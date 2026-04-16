#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { buildEntityId, decodeHtmlEntities, normalizeAsciiText, normalizeSearchKey, uniqueSorted } from "../lib/normalize.mjs";
import { writeJson } from "../lib/io.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(__dirname, "..");

const BASE_URL = "https://www.transfermarkt.com";
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function getOption(name, fallback = null) {
  const args = process.argv.slice(2);
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) return "true";
  return value;
}

function getCurrentSeasonStartYear() {
  const current = new Date();
  const year = current.getUTCFullYear();
  const month = current.getUTCMonth() + 1;
  return month >= 7 ? year : year - 1;
}

function seasonLabel(startYear) {
  return `${startYear}-${startYear + 1}`;
}

function normalizeName(text) {
  return normalizeAsciiText(text);
}

function parseBirthYear(dateText) {
  const match = String(dateText ?? "").match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return null;
  const year = Number(match[3]);
  return Number.isInteger(year) ? year : null;
}

function parseDateParts(dateText) {
  const match = String(dateText ?? "").match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return null;
  return {
    day: Number(match[1]),
    month: Number(match[2]),
    year: Number(match[3]),
  };
}

function overlapsHistoricalWindow(fromDateText, untilDateText, fromSeasonStart) {
  const fromDate = parseDateParts(fromDateText);
  const untilDate = parseDateParts(untilDateText);
  const fromYear = fromDate?.year ?? null;
  const untilYear = untilDate?.year ?? null;

  if (untilYear !== null) return untilYear >= fromSeasonStart;
  if (fromYear !== null) return fromYear >= fromSeasonStart;
  return true;
}

function toAbsoluteUrl(href) {
  if (!href) return null;
  if (href.startsWith("http://") || href.startsWith("https://")) return href;
  return `${BASE_URL}${href}`;
}

function extractSlugFromClubPath(href) {
  const match = String(href ?? "").match(/^\/([^/]+)\/startseite\/verein\/\d+(?:\/saison_id\/\d+)?/i);
  return match?.[1] ?? null;
}

async function fetchTextWithCache(url, cachePath, delayMs) {
  try {
    return await fs.readFile(cachePath, "utf8");
  } catch {
    // cache miss
  }

  if (delayMs > 0) {
    await sleep(delayMs);
  }

  const response = await fetch(url, {
    headers: {
      "accept-language": "en-US,en;q=0.9",
      "user-agent": DEFAULT_USER_AGENT,
    },
    redirect: "follow",
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) {
    const body = (await response.text()).slice(0, 500);
    throw new Error(`HTTP ${response.status} for ${url}: ${body}`);
  }

  const html = await response.text();
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(cachePath, html, "utf8");
  return html;
}

function extractItemsTableBody(html) {
  return html.match(/<table class="items">[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/i)?.[1] ?? "";
}

function parseCompetitionClubs(html, seasonStart) {
  const clubs = [];
  const seen = new Set();
  const rowRegex = new RegExp(
    `<a title="([^"]+)" href="(\\/[^"]+\\/startseite\\/verein\\/(\\d+)\\/saison_id\\/${seasonStart})">[^<]+<\\/a>[\\s\\S]*?<a title="[^"]+" href="(\\/[^"]+\\/kader\\/verein\\/\\3\\/saison_id\\/${seasonStart})">`,
    "g"
  );

  for (const match of html.matchAll(rowRegex)) {
    const clubName = normalizeName(decodeHtmlEntities(match[1]));
    const clubId = String(match[3]);
    const slug = extractSlugFromClubPath(match[2]);
    if (!clubId || seen.has(clubId)) continue;
    seen.add(clubId);

    clubs.push({
      clubId,
      clubName,
      startseitePath: match[2],
      squadPath: match[4],
      historyPath: slug ? `/${slug}/mitarbeiterhistorie/verein/${clubId}` : null,
      seasons: [seasonLabel(seasonStart)],
    });
  }

  return clubs;
}

function parseDetailedSquadPlayers(html) {
  const body = extractItemsTableBody(html);
  const players = [];
  const rowRegex =
    /<a href="([^"]*\/profil\/spieler\/(\d+))">\s*([^<]+?)\s*<\/a>[\s\S]*?<tr>\s*<td>\s*([^<]+?)\s*<\/td>\s*<\/tr>\s*<\/table>\s*<\/td><td class="zentriert">([^<]*)<\/td>/g;

  for (const match of body.matchAll(rowRegex)) {
    const name = normalizeName(decodeHtmlEntities(match[3]));
    const position = normalizeName(decodeHtmlEntities(match[4]));
    const birthDate = normalizeName(decodeHtmlEntities(match[5]));
    if (!name) continue;

    players.push({
      playerId: String(match[2]),
      name,
      position,
      birthDate,
      birthYear: parseBirthYear(birthDate),
      href: match[1],
    });
  }

  return players;
}

function parseManagerHistoryRows(html, minSeasonStart) {
  const body = extractItemsTableBody(html);
  const managers = [];
  const rowRegex =
    /<a title="([^"]+)" id="(\d+)" href="([^"]*\/profil\/trainer\/\d+)">[^<]*<\/a><\/td><\/tr><tr><td>([^<]*)<\/td><\/tr><\/table><\/td><td class="zentriert">[\s\S]*?<\/td><td class="zentriert">([^<]*)<\/td><td class="zentriert">([^<]*)<\/td>/g;

  for (const match of body.matchAll(rowRegex)) {
    const name = normalizeName(decodeHtmlEntities(match[1]));
    const birthDate = normalizeName(decodeHtmlEntities(match[4]));
    const fromDate = normalizeName(decodeHtmlEntities(match[5]));
    const untilDate = normalizeName(decodeHtmlEntities(match[6]));
    if (!name || !overlapsHistoricalWindow(fromDate, untilDate, minSeasonStart)) continue;

    managers.push({
      coachId: String(match[2]),
      name,
      birthDate,
      birthYear: parseBirthYear(birthDate),
      fromDate,
      untilDate,
      href: match[3],
    });
  }

  return managers;
}

async function runWorkers(items, concurrency, worker) {
  let cursor = 0;

  async function loop() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => loop()));
}

const fromSeasonRaw = Number(getOption("--from-season", "1980"));
const toSeasonRaw = Number(getOption("--to-season", String(getCurrentSeasonStartYear())));
const concurrencyRaw = Number(getOption("--concurrency", "6"));
const delayMsRaw = Number(getOption("--delay-ms", "80"));
const playersOutPath = path.resolve(
  projectDir,
  getOption("--players-out", "output/players.transfermarkt.historical.json")
);
const coachesOutPath = path.resolve(
  projectDir,
  getOption("--coaches-out", "output/coaches.transfermarkt.historical.json")
);
const cacheRoot = path.resolve(projectDir, getOption("--cache-dir", "output/cache/transfermarkt-historical"));

const fromSeasonStart = Number.isInteger(fromSeasonRaw) ? fromSeasonRaw : 1980;
const toSeasonStart = Number.isInteger(toSeasonRaw) ? toSeasonRaw : getCurrentSeasonStartYear();
const concurrency = Number.isInteger(concurrencyRaw) && concurrencyRaw > 0 ? concurrencyRaw : 6;
const delayMs = Number.isInteger(delayMsRaw) && delayMsRaw >= 0 ? delayMsRaw : 80;

const competitionCacheDir = path.join(cacheRoot, "competitions");
const squadCacheDir = path.join(cacheRoot, "squads");
const staffCacheDir = path.join(cacheRoot, "staff-history");

const seasonStarts = [];
for (let seasonStart = fromSeasonStart; seasonStart <= toSeasonStart; seasonStart += 1) {
  seasonStarts.push(seasonStart);
}

const clubsById = new Map();
const seasonSummaries = [];
const competitionFailures = [];

for (const seasonStart of seasonStarts) {
  const url = `${BASE_URL}/super-lig/startseite/wettbewerb/TR1/saison_id/${seasonStart}`;
  const cachePath = path.join(competitionCacheDir, `tr1-${seasonStart}.html`);

  try {
    const html = await fetchTextWithCache(url, cachePath, delayMs);
    const clubs = parseCompetitionClubs(html, seasonStart);

    seasonSummaries.push({
      season: seasonLabel(seasonStart),
      seasonStart,
      clubCount: clubs.length,
    });

    for (const club of clubs) {
      if (!clubsById.has(club.clubId)) {
        clubsById.set(club.clubId, {
          ...club,
          seasons: new Set(club.seasons),
        });
      } else {
        const existing = clubsById.get(club.clubId);
        existing.seasons.add(seasonLabel(seasonStart));
        if (!existing.startseitePath) existing.startseitePath = club.startseitePath;
        if (!existing.squadPath) existing.squadPath = club.squadPath;
        if (!existing.historyPath) existing.historyPath = club.historyPath;
        if (!existing.clubName && club.clubName) existing.clubName = club.clubName;
      }
    }
  } catch (error) {
    competitionFailures.push({
      season: seasonLabel(seasonStart),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const playerMap = new Map();
const playerFailures = [];
const squadTargets = [];

for (const seasonStart of seasonStarts) {
  const seasonName = seasonLabel(seasonStart);
  for (const club of clubsById.values()) {
    if (club.seasons.has(seasonName)) {
      squadTargets.push({
        seasonStart,
        seasonName,
        clubId: club.clubId,
        clubName: club.clubName,
        squadPath: club.squadPath.replace(/\/saison_id\/\d+$/i, `/saison_id/${seasonStart}`) + "/plus/1",
      });
    }
  }
}

let playerProcessed = 0;
await runWorkers(squadTargets, concurrency, async (target) => {
  const cachePath = path.join(squadCacheDir, `${target.clubId}-${target.seasonStart}.html`);

  try {
    const html = await fetchTextWithCache(toAbsoluteUrl(target.squadPath), cachePath, delayMs);
    const players = parseDetailedSquadPlayers(html);

    for (const player of players) {
      if (!player.playerId) continue;

      if (!playerMap.has(player.playerId)) {
        playerMap.set(player.playerId, {
          id: buildEntityId("player", `tm-historical-${player.playerId}-${player.name}`),
          entityType: "player",
          canonicalName: player.name,
          displayName: player.name,
          searchKey: normalizeSearchKey(player.name),
          aliases: new Set([player.name]),
          sourceIds: { transfermarkt: player.playerId },
          sourceUrls: new Set([toAbsoluteUrl(player.href)]),
          birthYears: new Set(),
          positions: new Map(),
          teams: new Map(),
          seasons: new Set(),
          rosterEntries: 0,
        });
      }

      const entity = playerMap.get(player.playerId);
      entity.aliases.add(player.name);
      entity.sourceUrls.add(toAbsoluteUrl(player.href));
      entity.rosterEntries += 1;
      entity.teams.set(target.clubName, (entity.teams.get(target.clubName) ?? 0) + 1);
      entity.seasons.add(target.seasonName);
      if (player.position) entity.positions.set(player.position, (entity.positions.get(player.position) ?? 0) + 1);
      if (Number.isInteger(player.birthYear)) entity.birthYears.add(player.birthYear);
    }
  } catch (error) {
    playerFailures.push({
      season: target.seasonName,
      clubId: target.clubId,
      clubName: target.clubName,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  playerProcessed += 1;
  if (playerProcessed % 50 === 0 || playerProcessed === squadTargets.length) {
    console.log(`[registry] historical players progress ${playerProcessed}/${squadTargets.length}`);
  }
});

const coachMap = new Map();
const coachFailures = [];
const coachTargets = [...clubsById.values()].sort((left, right) => left.clubName.localeCompare(right.clubName));

let coachProcessed = 0;
await runWorkers(coachTargets, concurrency, async (club) => {
  if (!club.historyPath) {
    coachFailures.push({
      clubId: club.clubId,
      clubName: club.clubName,
      error: "missing history path",
    });
    return;
  }

  const cachePath = path.join(staffCacheDir, `${club.clubId}.html`);

  try {
    const html = await fetchTextWithCache(toAbsoluteUrl(club.historyPath), cachePath, delayMs);
    const rows = parseManagerHistoryRows(html, fromSeasonStart);

    for (const row of rows) {
      if (!row.coachId) continue;

      if (!coachMap.has(row.coachId)) {
        coachMap.set(row.coachId, {
          id: buildEntityId("coach", `tm-historical-${row.coachId}-${row.name}`),
          entityType: "coach",
          canonicalName: row.name,
          displayName: row.name,
          searchKey: normalizeSearchKey(row.name),
          aliases: new Set([row.name]),
          sourceIds: { transfermarkt: row.coachId },
          sourceUrls: new Set([toAbsoluteUrl(row.href)]),
          birthYears: new Set(),
          teams: new Map(),
          spells: [],
        });
      }

      const entity = coachMap.get(row.coachId);
      entity.aliases.add(row.name);
      entity.sourceUrls.add(toAbsoluteUrl(row.href));
      if (Number.isInteger(row.birthYear)) entity.birthYears.add(row.birthYear);
      entity.teams.set(club.clubName, (entity.teams.get(club.clubName) ?? 0) + 1);
      entity.spells.push({
        team: club.clubName,
        fromDate: row.fromDate || null,
        untilDate: row.untilDate || null,
      });
    }
  } catch (error) {
    coachFailures.push({
      clubId: club.clubId,
      clubName: club.clubName,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  coachProcessed += 1;
  if (coachProcessed % 25 === 0 || coachProcessed === coachTargets.length) {
    console.log(`[registry] historical coaches progress ${coachProcessed}/${coachTargets.length}`);
  }
});

const players = [...playerMap.values()]
  .map((entity) => {
    const birthYears = [...new Set([...entity.birthYears])]
      .filter((year) => Number.isInteger(year))
      .sort((left, right) => left - right);
    const teams = [...entity.teams.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([team, seasonsSeen]) => ({ team, seasonsSeen }));
    const positions = [...entity.positions.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([position, seasonsSeen]) => ({ position, seasonsSeen }));

    return {
      id: entity.id,
      entityType: entity.entityType,
      canonicalName: entity.canonicalName,
      displayName: entity.displayName,
      searchKey: entity.searchKey,
      aliases: uniqueSorted([...entity.aliases]),
      birthYear: birthYears.length === 1 ? birthYears[0] : null,
      birthYears,
      sourceIds: entity.sourceIds,
      sourceUrls: uniqueSorted([...entity.sourceUrls]),
      provisional: false,
      confidence: "high",
      rosterEntries: entity.rosterEntries,
      teams,
      positions,
      seasons: uniqueSorted([...entity.seasons]),
    };
  })
  .sort((left, right) => left.displayName.localeCompare(right.displayName));

const coaches = [...coachMap.values()]
  .map((entity) => {
    const birthYears = [...new Set([...entity.birthYears])]
      .filter((year) => Number.isInteger(year))
      .sort((left, right) => left - right);
    const teams = [...entity.teams.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([team, spells]) => ({ team, spells }));

    return {
      id: entity.id,
      entityType: entity.entityType,
      canonicalName: entity.canonicalName,
      displayName: entity.displayName,
      searchKey: entity.searchKey,
      aliases: uniqueSorted([...entity.aliases]),
      birthYear: birthYears.length === 1 ? birthYears[0] : null,
      birthYears,
      sourceIds: entity.sourceIds,
      sourceUrls: uniqueSorted([...entity.sourceUrls]),
      provisional: false,
      confidence: "high",
      teams,
      spellCount: entity.spells.length,
      spells: entity.spells
        .slice()
        .sort((left, right) => String(left.fromDate ?? "").localeCompare(String(right.fromDate ?? ""))),
    };
  })
  .sort((left, right) => left.displayName.localeCompare(right.displayName));

await writeJson(playersOutPath, {
  metadata: {
    project: "ilk10-registry",
    builder: "build-transfermarkt-historical-registry",
    generatedAt: new Date().toISOString(),
    fromSeasonStart,
    toSeasonStart,
    cacheRoot,
  },
  summary: {
    seasonCount: seasonStarts.length,
    discoveredClubCount: clubsById.size,
    playerCount: players.length,
    competitionFailureCount: competitionFailures.length,
    playerFailureCount: playerFailures.length,
  },
  seasonSummaries,
  failures: {
    competitions: competitionFailures,
    players: playerFailures,
  },
  entities: players,
});

await writeJson(coachesOutPath, {
  metadata: {
    project: "ilk10-registry",
    builder: "build-transfermarkt-historical-registry",
    generatedAt: new Date().toISOString(),
    fromSeasonStart,
    toSeasonStart,
    cacheRoot,
  },
  summary: {
    discoveredClubCount: clubsById.size,
    coachCount: coaches.length,
    coachFailureCount: coachFailures.length,
  },
  failures: coachFailures,
  entities: coaches,
});

console.log(`[registry] historical seasons=${seasonStarts.length}`);
console.log(`[registry] historical clubs=${clubsById.size}`);
console.log(`[registry] historical players=${players.length}`);
console.log(`[registry] historical coaches=${coaches.length}`);
console.log(`[registry] historical players out=${playersOutPath}`);
console.log(`[registry] historical coaches out=${coachesOutPath}`);
