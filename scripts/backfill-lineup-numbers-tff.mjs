#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { readGamesCsv, writeGamesCsv } from "./lib/games-csv.mjs";
import {
  alignPlayers,
  hasNumberAnomaly,
  norm,
  numbersToString,
  parseInts as ints,
  teamMatches,
} from "./lib/lineup-align.mjs";

// Fills missing / duplicate shirt numbers from TFF (tff.org) match pages.
// TFF match reports list the starting XI with shirt numbers ("6. ZURAB
// KHIZANISHVILI"), including seasons where Transfermarkt has no numbers.
// Captains are NOT marked on TFF pages.

const TFF_SEASON_PAGE_IDS = {
  2000: 552, 2001: 551, 2002: 550, 2003: 549, 2004: 548, 2005: 547,
  2006: 546, 2007: 752, 2008: 898, 2009: 974, 2010: 1059, 2011: 1139,
  2012: 1236, 2013: 1274, 2014: 1318, 2015: 1382, 2016: 1413, 2017: 1440,
  2018: 1467, 2019: 1501, 2020: 1529, 2021: 1576, 2022: 1628, 2023: 1648,
  2024: 1730, 2025: 1768,
};

// TFF club names vary by sponsor ("MEDİCAL PARK ANTALYASPOR"); the fuzzy
// teamMatches helper handles most of it. Add explicit aliases when needed.
const TEAM_ALIASES = {
  "Istanbul Bbsk": "Istanbul Bs Bld Spor",
  "Basaksehir": "Istanbul Bs Bld Spor",
};

function getOption(name, fallback = null) {
  const args = process.argv.slice(2);
  const idx = args.indexOf(name);
  if (idx === -1) return fallback;
  const value = args[idx + 1];
  if (!value || value.startsWith("--")) return "true";
  return value;
}

function hasFlag(name) {
  return process.argv.slice(2).includes(name);
}

if (hasFlag("--help")) {
  console.log(
    [
      "Usage:",
      "  node scripts/backfill-lineup-numbers-tff.mjs [--dry] [--limit <n>] [--season <year>] [--cache-dir <path>] [--delay-ms <n>]",
      "",
      "Defaults:",
      "  --cache-dir <os tmpdir>/ilk11-tff-cache",
      "  --delay-ms 200",
    ].join("\n")
  );
  process.exit(0);
}

const dryRun = hasFlag("--dry");
const limit = Number(getOption("--limit", "0"));
const onlySeason = getOption("--season", null);
const cacheDir = getOption("--cache-dir", path.join(os.tmpdir(), "ilk11-tff-cache"));
const delayMs = Number(getOption("--delay-ms", "200"));

const MONTHS = {
  January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
  July: 7, August: 8, September: 9, October: 10, November: 11, December: 12,
};

function gameDateParts(game) {
  const match = String(game).match(/(\w+) (\d{1,2}) - (\d{4})$/);
  if (!match || !MONTHS[match[1]]) return null;
  return { day: Number(match[2]), month: MONTHS[match[1]], year: Number(match[3]) };
}

function dateKey(parts) {
  return `${String(parts.day).padStart(2, "0")}.${String(parts.month).padStart(2, "0")}.${parts.year}`;
}

function tffDateToDayNumber(value) {
  const [day, month, year] = String(value).split(".").map(Number);
  if (!day || !month || !year) return null;
  return Date.UTC(year, month - 1, day) / 86400000;
}

async function fetchTff(url, cacheKey) {
  const cachePath = path.join(cacheDir, `${cacheKey}.html`);
  try {
    return await fs.readFile(cachePath, "utf8");
  } catch {
    // cache miss
  }
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/122.0.0.0",
      "accept-language": "tr,en;q=0.9",
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  const text = new TextDecoder("windows-1254").decode(Buffer.from(await response.arrayBuffer()));
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(cachePath, text, "utf8");
  await sleep(delayMs);
  return text;
}

function parseWeekFixtures(html) {
  const rowRegex =
    /<tr class="haftaninMaclariTr">[\s\S]*?lblTarih">([\d.]+)<[\s\S]*?haftaninMaclariEv[\s\S]*?Label4">([^<]+)<[\s\S]*?pageId=(29|397)&macId=(\d+)[\s\S]*?haftaninMaclariDeplasman[\s\S]*?Label1">([^<]+)</g;
  return [...html.matchAll(rowRegex)].map((match) => ({
    date: match[1],
    home: match[2].trim(),
    away: match[5].trim(),
    pageId: match[3],
    macId: match[4],
  }));
}

function parseMatchStarters(html) {
  const teamBlock = (teamIndex) => {
    const marker = `grdTakim${teamIndex}_rptKadrolar`;
    const start = html.indexOf(marker);
    if (start < 0) return null;
    const next = html.indexOf(`grdTakim${teamIndex + 1}_rptKadrolar`, start);
    const chunk = html.slice(start, next > start ? next : start + 80000);
    return [...chunk.matchAll(/formaNo">(\d+)\.<\/span>\s*<a[^>]*>([^<]+)<\/a>/g)]
      .map((match) => ({ number: Number(match[1]), name: match[2].trim() }))
      .slice(0, 11);
  };
  const home = teamBlock(1);
  const away = teamBlock(2);
  if (!home || !away || home.length !== 11 || away.length !== 11) return null;
  return { home, away };
}

// --- load season files and collect target rows ---
const seasonsDir = path.join(process.cwd(), "data/seasons");
const seasonFiles = (await fs.readdir(seasonsDir))
  .filter((name) => /^tr1-\d{4}\.csv$/i.test(name))
  .sort((a, b) => a.localeCompare(b));

const fileRows = new Map();
const targetsBySeason = new Map();

for (const file of seasonFiles) {
  const filePath = path.join(seasonsDir, file);
  const parsed = await readGamesCsv(filePath);
  if (parsed.errors.length > 0) {
    console.error(`[tff-backfill] parse errors in ${filePath}`);
    for (const error of parsed.errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  fileRows.set(file, { filePath, rows: parsed.rows });
  const season = Number(file.match(/(\d{4})/)[1]);
  if (onlySeason && String(season) !== onlySeason) continue;

  const rowsByGame = new Map();
  for (const row of parsed.rows) {
    const list = rowsByGame.get(row.game) ?? [];
    list.push(row);
    rowsByGame.set(row.game, list);
  }
  for (const [game, rows] of rowsByGame) {
    const date = gameDateParts(game);
    if (!date) continue;
    for (const row of rows) {
      if (!hasNumberAnomaly(ints(row.lineupNumbers))) continue;
      const entry = targetsBySeason.get(season) ?? [];
      entry.push({ file, row, game, date, teams: rows.map((r) => r.team) });
      targetsBySeason.set(season, entry);
    }
  }
}

const report = {
  seasons: 0,
  weeksFetched: 0,
  targetRows: 0,
  matched: 0,
  dateFallback: 0,
  changedRows: 0,
  cellsFilled: 0,
  cellsDeduped: 0,
  crossSourceDiff: 0,
  unmatched: [],
  ambiguous: [],
  changedFiles: new Set(),
};

async function seasonFixtures(season) {
  const pageId = TFF_SEASON_PAGE_IDS[season];
  if (!pageId) return null;
  const fixtures = [];
  let emptyStreak = 0;
  for (let week = 1; week <= 46; week += 1) {
    let html;
    try {
      html = await fetchTff(`https://www.tff.org/default.aspx?pageID=${pageId}&hafta=${week}`, `s${season}-w${week}`);
    } catch (error) {
      report.unmatched.push({ season, reason: `week ${week} fetch failed: ${error.message}` });
      break;
    }
    report.weeksFetched += 1;
    const weekFixtures = parseWeekFixtures(html);
    if (weekFixtures.length === 0) {
      emptyStreak += 1;
      if (emptyStreak >= 3) break;
      continue;
    }
    emptyStreak = 0;
    fixtures.push(...weekFixtures);
  }
  return fixtures;
}

function findFixture(fixtures, target) {
  const dk = dateKey(target.date);
  const [teamA, teamB] = target.teams;
  const alias = (team) => TEAM_ALIASES[team] ?? team;
  const pairMatches = (fixture) =>
    (teamMatches(fixture.home, alias(teamA)) && teamMatches(fixture.away, alias(teamB))) ||
    (teamMatches(fixture.home, alias(teamB)) && teamMatches(fixture.away, alias(teamA)));

  const sameDate = fixtures.filter((fixture) => fixture.date === dk && pairMatches(fixture));
  if (sameDate.length === 1) return { fixture: sameDate[0] };
  if (sameDate.length > 1) return { error: "multiple fixtures on date" };

  // Postponed fixtures: allow a unique pair match within three weeks of the
  // stored date, so numbers never come from the other meeting of the season.
  const targetDay = tffDateToDayNumber(dk);
  const sameTeams = fixtures.filter((fixture) => {
    if (!pairMatches(fixture)) return false;
    const fixtureDay = tffDateToDayNumber(fixture.date);
    if (targetDay === null || fixtureDay === null) return false;
    return Math.abs(fixtureDay - targetDay) <= 21;
  });
  if (sameTeams.length === 1) return { fixture: sameTeams[0], fallback: true };
  if (sameTeams.length > 1) return { error: "multiple season fixtures for pair" };
  return { error: `no fixture for ${dk}` };
}

let processed = 0;
for (const [season, targets] of [...targetsBySeason.entries()].sort((a, b) => a[0] - b[0])) {
  if (limit > 0 && processed >= limit) break;
  console.log(`[tff-backfill] season ${season}: ${targets.length} target rows`);
  const fixtures = await seasonFixtures(season);
  if (!fixtures) {
    report.unmatched.push({ season, reason: "no TFF page id" });
    continue;
  }
  report.seasons += 1;

  const matchCache = new Map();
  for (const target of targets) {
    if (limit > 0 && processed >= limit) break;
    processed += 1;
    report.targetRows += 1;

    const found = findFixture(fixtures, target);
    if (found.error) {
      report.unmatched.push({ game: target.game, team: target.row.team, reason: found.error });
      continue;
    }
    if (found.fallback) report.dateFallback += 1;
    const { macId, pageId } = found.fixture;
    report.matched += 1;

    let starters = matchCache.get(macId);
    if (starters === undefined) {
      try {
        const html = await fetchTff(`https://www.tff.org/Default.aspx?pageId=${pageId}&macId=${macId}`, `m${macId}`);
        starters = parseMatchStarters(html);
      } catch (error) {
        starters = null;
        report.unmatched.push({ game: target.game, team: target.row.team, reason: `match fetch failed: ${error.message}` });
      }
      matchCache.set(macId, starters);
    }
    if (!starters) continue;

    const csvTeam = target.row.team;
    const side = teamMatches(found.fixture.home, TEAM_ALIASES[csvTeam] ?? csvTeam) ? starters.home : starters.away;

    const csvNames = target.row.lineup.map((name) => String(name).trim());
    const oldNumbers = ints(target.row.lineupNumbers);
    const alignment = alignPlayers(csvNames, side, oldNumbers);
    if (alignment.error) {
      report.ambiguous.push({ game: target.game, team: csvTeam, reason: alignment.error });
      continue;
    }

    const dupValues = new Set(
      oldNumbers.filter((value, index) => value !== null && oldNumbers.indexOf(value) !== index)
    );
    // Same-surname slots (two TEBERs) are only distinguishable by their shirt
    // numbers, so allow the assignment to move values inside those groups.
    const csvNorms = csvNames.map(norm);
    const duplicatedNames = new Set(csvNorms.filter((value, index) => csvNorms.indexOf(value) !== index));
    const variants = new Map();
    for (const solution of alignment.solutions) {
      const numbers = solution.map((sourceIndex, csvIndex) => {
        const sourceNumber = side[sourceIndex].number ?? null;
        const current = oldNumbers[csvIndex];
        if (current === null && sourceNumber !== null) return sourceNumber;
        if (duplicatedNames.has(csvNorms[csvIndex]) && sourceNumber !== null && sourceNumber !== current) {
          return sourceNumber;
        }
        if (current !== null && dupValues.has(current) && sourceNumber !== null && sourceNumber !== current) {
          return sourceNumber;
        }
        return current;
      });
      variants.set(numbersToString(numbers), numbers);
    }
    const ranked = [...variants.values()].map((numbers) => ({
      numbers,
      changes: numbers.filter((number, index) => number !== oldNumbers[index]).length,
    })).sort((a, b) => a.changes - b.changes);
    if (ranked.length > 1 && ranked[0].changes === ranked[1].changes && ranked[0].changes > 0) {
      report.ambiguous.push({ game: target.game, team: csvTeam, reason: "ambiguous number assignment" });
      continue;
    }
    const newNumbers = ranked[0].numbers;
    if (numbersToString(newNumbers) === numbersToString(oldNumbers)) {
      // count cross-source disagreements for information only
      for (const solution of [alignment.solutions[0]]) {
        solution.forEach((sourceIndex, csvIndex) => {
          const sourceNumber = side[sourceIndex].number ?? null;
          if (oldNumbers[csvIndex] !== null && !dupValues.has(oldNumbers[csvIndex]) && sourceNumber !== null && sourceNumber !== oldNumbers[csvIndex]) {
            report.crossSourceDiff += 1;
          }
        });
      }
      continue;
    }

    report.changedRows += 1;
    for (let i = 0; i < newNumbers.length; i += 1) {
      if (newNumbers[i] === oldNumbers[i]) continue;
      if (oldNumbers[i] === null) report.cellsFilled += 1;
      else report.cellsDeduped += 1;
    }
    if (process.env.BACKFILL_DEBUG) {
      const diffs = newNumbers
        .map((number, index) => (number !== oldNumbers[index] ? `${index + 1}:${oldNumbers[index] ?? "-"}->${number ?? "-"}` : null))
        .filter(Boolean)
        .join(",");
      console.log(`  * ${macId} ${target.game} ${csvTeam}: [${diffs}]`);
    }
    if (!dryRun) {
      target.row.lineupNumbers = newNumbers;
      report.changedFiles.add(target.file);
    }
  }
}

if (!dryRun) {
  for (const file of report.changedFiles) {
    const { filePath, rows } = fileRows.get(file);
    await writeGamesCsv(filePath, rows, {
      includeDifficulty: true,
      includeLineupNumbers: true,
      includeLineupCaptains: true,
      includeLineupGoals: true,
      includeLineupAssists: true,
      includeLineupCards: true,
      includeLineupYellowCards: true,
      includeLineupRedCards: true,
      includeLineupSubstitutions: true,
      includeSourceMatchId: true,
    });
    console.log(`[tff-backfill] wrote=${filePath}`);
  }
}

console.log(`[tff-backfill] seasons=${report.seasons} weeks_fetched=${report.weeksFetched}`);
console.log(`[tff-backfill] target_rows=${report.targetRows} matched=${report.matched} (date_fallback=${report.dateFallback})`);
console.log(`[tff-backfill] rows_changed=${report.changedRows} cells_filled=${report.cellsFilled} cells_deduped=${report.cellsDeduped}`);
console.log(`[tff-backfill] cross_source_differences=${report.crossSourceDiff} unmatched=${report.unmatched.length} ambiguous=${report.ambiguous.length}`);
for (const entry of [...report.unmatched, ...report.ambiguous].slice(0, 25)) {
  console.log(`  - ${entry.game ?? entry.season ?? ""} ${entry.team ?? ""}: ${entry.reason}`);
}
if (report.unmatched.length + report.ambiguous.length > 25) {
  console.log(`  ... ${report.unmatched.length + report.ambiguous.length - 25} more`);
}
