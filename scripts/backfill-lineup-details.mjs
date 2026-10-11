#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { fetchTransfermarktMatchHtml, parseMatchStarters } from "../registry/lib/transfermarkt.mjs";
import { readGamesCsv, writeGamesCsv } from "./lib/games-csv.mjs";
import {
  alignPlayers,
  flagsToString,
  hasNumberAnomaly,
  numbersToString,
  parseInts as ints,
  parseFlags as flags,
  teamMatches,
} from "./lib/lineup-align.mjs";

// Backfills two details on existing lineup data from Transfermarkt match pages:
//   - lineup_numbers: fills nulls and re-syncs rows that contain duplicate numbers
//   - lineup_captains: sets the captain when Transfermarkt marks exactly one
// Used by scripts/lib/ilk11-runtime consumers via data/seasons/*.csv, so after a
// run re-run `npm run data:build-pools` and `npm run data:validate:all`.

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
      "  node scripts/backfill-lineup-details.mjs [--dry] [--match <id>] [--limit <n>] [--cache-dir <path>] [--concurrency <n>] [--delay-ms <n>]",
      "",
      "Defaults:",
      "  --cache-dir <os tmpdir>/ilk11-tm-match-cache",
      "  --concurrency 4 --delay-ms 150",
    ].join("\n")
  );
  process.exit(0);
}

const dryRun = hasFlag("--dry");
const onlyMatchId = getOption("--match", null);
const limit = Number(getOption("--limit", "0"));
const cacheDir = getOption("--cache-dir", path.join(os.tmpdir(), "ilk11-tm-match-cache"));
const concurrency = Number(getOption("--concurrency", "4"));
const delayMs = Number(getOption("--delay-ms", "150"));

const seasonsDir = path.join(process.cwd(), "data/seasons");


// --- load season files and find rows that need a backfill ---
const seasonFiles = (await fs.readdir(seasonsDir))
  .filter((name) => /^tr1-\d{4}\.csv$/i.test(name))
  .sort((a, b) => a.localeCompare(b));

const fileRows = new Map();
const rowsByMatch = new Map();

for (const file of seasonFiles) {
  const filePath = path.join(seasonsDir, file);
  const parsed = await readGamesCsv(filePath);
  if (parsed.errors.length > 0) {
    console.error(`[backfill] parse errors in ${filePath}`);
    for (const error of parsed.errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  fileRows.set(file, { filePath, rows: parsed.rows });
  for (const row of parsed.rows) {
    if (!row.sourceMatchId) continue;
    const entry = rowsByMatch.get(row.sourceMatchId) ?? [];
    entry.push({ file, row });
    rowsByMatch.set(row.sourceMatchId, entry);
  }
}

const targetMatchIds = [];
for (const [matchId, entries] of rowsByMatch) {
  if (onlyMatchId && matchId !== onlyMatchId) continue;
  const needs = entries.some(({ row }) => {
    const captainCount = flags(row.lineupCaptains).filter(Boolean).length;
    return captainCount !== 1 || hasNumberAnomaly(ints(row.lineupNumbers));
  });
  if (needs) targetMatchIds.push(matchId);
}
targetMatchIds.sort();

const selected = limit > 0 ? targetMatchIds.slice(0, limit) : targetMatchIds;
console.log(`[backfill] target matches: ${selected.length}${limit ? ` (of ${targetMatchIds.length})` : ""}${dryRun ? " (dry run)" : ""}`);

const report = {
  fetched: 0,
  fetchFailed: [],
  rowsProcessed: 0,
  numbersChanged: 0,
  captainSet: 0,
  captainSkipped: 0,
  ambiguous: [],
  unmatched: [],
  nameMismatches: [],
  changedFiles: new Set(),
  changedRows: 0,
};

async function processMatch(matchId) {
  let html;
  try {
    html = await fetchTransfermarktMatchHtml(matchId, cacheDir);
  } catch (error) {
    report.fetchFailed.push({ matchId, error: String(error.message ?? error) });
    return;
  }
  report.fetched += 1;

  let parsed;
  try {
    parsed = parseMatchStarters(html, matchId);
  } catch (error) {
    report.fetchFailed.push({ matchId, error: String(error.message ?? error) });
    return;
  }

  for (const { file, row } of rowsByMatch.get(matchId)) {
    report.rowsProcessed += 1;
    const teamSide = parsed.teams.findIndex((team) => teamMatches(team, row.team));
    if (teamSide === -1) {
      report.unmatched.push({ matchId, team: row.team, reason: "team not found on page" });
      continue;
    }
    const tmPlayers = parsed.players.slice(teamSide * 11, teamSide * 11 + 11);
    const csvNames = row.lineup.map((name) => String(name).trim());
    const oldNumbers = ints(row.lineupNumbers);
    const oldFlags = flags(row.lineupCaptains);

    const alignment = alignPlayers(
      csvNames,
      tmPlayers.map((player) => ({ name: player.displayName, number: player.number, isCaptain: player.isCaptain })),
      oldNumbers
    );
    if (alignment.error) {
      const detail = alignment.details ? ` (${alignment.details.join(", ")})` : "";
      report.ambiguous.push({ matchId, team: row.team, reason: alignment.error + detail });
      continue;
    }
    for (const mismatch of alignment.nameMismatch ?? []) {
      report.nameMismatches.push({ matchId, team: row.team, ...mismatch });
    }

    const tmCaptains = tmPlayers.filter((player) => player.isCaptain);
    const applyCaptain = tmCaptains.length === 1;
    const captainTmIndex = applyCaptain ? tmPlayers.findIndex((player) => player.isCaptain) : -1;

    // Every remaining assignment ambiguity must collapse to a single most
    // conservative result (fewest changed cells); otherwise skip the row.
    const variants = new Map();
    for (const solution of alignment.solutions) {
      const numbers = solution.map((tmIndex, csvIndex) => tmPlayers[tmIndex].number ?? oldNumbers[csvIndex]);
      let solutionFlags = oldFlags;
      if (applyCaptain) {
        const csvIndex = solution.indexOf(captainTmIndex);
        solutionFlags = Array.from({ length: 11 }, (_, index) => (index === csvIndex ? 1 : 0));
      }
      const changes =
        numbers.filter((number, index) => number !== oldNumbers[index]).length +
        solutionFlags.filter((flag, index) => flag !== oldFlags[index]).length;
      const key = `${numbersToString(numbers)}|${flagsToString(solutionFlags)}`;
      if (!variants.has(key) || variants.get(key).changes > changes) {
        variants.set(key, { numbers, flags: solutionFlags, changes });
      }
    }
    const ranked = [...variants.values()].sort((a, b) => a.changes - b.changes);
    if (ranked.length !== 1 && ranked[0].changes === ranked[1].changes) {
      report.ambiguous.push({ matchId, team: row.team, reason: `${variants.size} distinct results across assignments` });
      continue;
    }
    const { numbers: newNumbers, flags: newFlags } = ranked[0];

    if (!applyCaptain) report.captainSkipped += 1;

    const numbersChanged = numbersToString(oldNumbers) !== numbersToString(newNumbers);
    const flagsChanged = flagsToString(oldFlags) !== flagsToString(newFlags);
    if (!numbersChanged && !flagsChanged) continue;

    report.changedRows += 1;
    if (numbersChanged) report.numbersChanged += 1;
    if (flagsChanged) report.captainSet += 1;

    if (process.env.BACKFILL_DEBUG) {
      const numberDiffs = newNumbers
        .map((number, index) => (number !== oldNumbers[index] ? `${index + 1}:${oldNumbers[index] ?? "-"}->${number ?? "-"}` : null))
        .filter(Boolean)
        .join(",");
      const flagDiff = flagsChanged ? flagsToString(newFlags) : "";
      console.log(`  * ${matchId} ${row.team}: numbers[${numberDiffs}] flags[${flagDiff || "same"}]`);
    }

    if (!dryRun) {
      row.lineupNumbers = newNumbers;
      row.lineupCaptains = newFlags;
      report.changedFiles.add(file);
    }
  }
}

for (let index = 0; index < selected.length; index += concurrency) {
  const chunk = selected.slice(index, index + concurrency);
  await Promise.all(chunk.map((matchId) => processMatch(matchId)));
  if (delayMs > 0) await sleep(delayMs);
  if ((index / concurrency) % 20 === 0) {
    process.stdout.write(`[backfill] fetched ${Math.min(index + concurrency, selected.length)}/${selected.length}\r`);
  }
}
console.log("");

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
    console.log(`[backfill] wrote=${filePath}`);
  }
}

console.log(`[backfill] matches_fetched=${report.fetched} fetch_failed=${report.fetchFailed.length}`);
console.log(`[backfill] rows_processed=${report.rowsProcessed} rows_changed=${report.changedRows}`);
console.log(`[backfill] numbers_changed=${report.numbersChanged} captains_set=${report.captainSet} captain_no_source=${report.captainSkipped}`);
console.log(`[backfill] ambiguous_alignments=${report.ambiguous.length} unmatched=${report.unmatched.length} name_mismatch_pairs=${report.nameMismatches.length}`);
for (const mismatch of report.nameMismatches.slice(0, 20)) {
  console.log(`  ~ ${mismatch.matchId} ${mismatch.team}: csv "${mismatch.csv}" vs source "${mismatch.source}" (#${mismatch.number})`);
}
if (report.nameMismatches.length > 20) {
  console.log(`  ~ ... ${report.nameMismatches.length - 20} more`);
}
const show = [...report.ambiguous, ...report.unmatched].slice(0, 20);
for (const entry of show) {
  console.log(`  - ${entry.matchId} ${entry.team}: ${entry.reason}`);
}
if (report.ambiguous.length + report.unmatched.length > show.length) {
  console.log(`  ... ${report.ambiguous.length + report.unmatched.length - show.length} more`);
}
for (const failure of report.fetchFailed.slice(0, 20)) {
  console.log(`  ! ${failure.matchId}: ${failure.error}`);
}

if (report.fetchFailed.length > 0) {
  process.exit(1);
}
