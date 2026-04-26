#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import {
  compareRowsByDateThenGame,
  readGamesCsv,
  rowKey,
  writeGamesCsv,
} from "./lib/games-csv.mjs";

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

function printUsage() {
  console.log(
    [
      "Usage:",
      "  node scripts/build-pools.mjs [--seasons-dir <path>] [--out-data <path>] [--out-easy <path>] [--out-hard <path>]",
      "",
      "Defaults:",
      "  --seasons-dir data/seasons",
      "  --out-data data/games.csv",
      "  --out-easy public/easy.csv",
      "  --out-hard public/hard.csv",
    ].join("\n")
  );
}

if (hasFlag("--help")) {
  printUsage();
  process.exit(0);
}

const seasonsDir = getOption("--seasons-dir", "data/seasons");
const outDataPath = getOption("--out-data", "data/games.csv");
const outEasyPath = getOption("--out-easy", "public/easy.csv");
const outHardPath = getOption("--out-hard", "public/hard.csv");
const EASY_MIN_YEAR = Number(getOption("--easy-min-year", "2010"));
const EASY_TEAMS = new Set(["Besiktas", "Trabzonspor", "Fenerbahce", "Galatasaray"]);

function extractGameYear(gameLabel) {
  const yearMatch = String(gameLabel ?? "").match(/(\d{4})\s*$/);
  if (!yearMatch) return null;
  const year = Number(yearMatch[1]);
  return Number.isInteger(year) ? year : null;
}

function isEligibleEasyRow(row) {
  if (row.difficulty !== "easy") return false;
  if (!EASY_TEAMS.has(row.team)) return false;

  const year = extractGameYear(row.game);
  return year !== null && year >= EASY_MIN_YEAR;
}

const seasonFiles = (await fs.readdir(seasonsDir))
  .filter((name) => /^tr1-\d{4}\.csv$/i.test(name))
  .map((name) => path.join(seasonsDir, name))
  .sort((a, b) => a.localeCompare(b));

if (seasonFiles.length === 0) {
  console.error(`[build-pools] no season files found in ${seasonsDir}`);
  process.exit(1);
}

const merged = new Map();
let rowsRead = 0;

for (const file of seasonFiles) {
  const parsed = await readGamesCsv(file);
  if (parsed.errors.length > 0) {
    console.error(`[build-pools] parse errors in ${file}`);
    for (const error of parsed.errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }

  for (const row of parsed.rows) {
    merged.set(rowKey(row), row);
  }
  rowsRead += parsed.rows.length;
}

const allRows = [...merged.values()].sort(compareRowsByDateThenGame);
const normalizedRows = allRows.map((row) => {
  const expectedLength = Array.isArray(row.lineup) && row.lineup.length > 0 ? row.lineup.length : 11;
  const normalizeCounts = (values) =>
    Array.from({ length: expectedLength }, (_, index) => {
      const value = Number(values?.[index] ?? 0);
      return Number.isInteger(value) && value >= 0 ? value : 0;
    });
  const normalizeNumbers = (values) =>
    Array.from({ length: expectedLength }, (_, index) => {
      const value = Number(values?.[index]);
      return Number.isInteger(value) && value > 0 ? value : null;
    });
  const normalizeBinaryFlags = (values) =>
    Array.from({ length: expectedLength }, (_, index) => {
      const value = Number(values?.[index] ?? 0);
      return value > 0 ? 1 : 0;
    });

  return {
    ...row,
    lineupNumbers: normalizeNumbers(row.lineupNumbers),
    lineupCaptains: normalizeBinaryFlags(row.lineupCaptains),
    lineupGoals: normalizeCounts(row.lineupGoals),
    lineupAssists: normalizeCounts(row.lineupAssists),
    lineupCards: normalizeCounts(row.lineupCards),
    lineupYellowCards: normalizeCounts(row.lineupYellowCards),
    lineupRedCards: normalizeCounts(row.lineupRedCards),
    lineupSubstitutions: normalizeCounts(row.lineupSubstitutions),
    sourceMatchId: String(row.sourceMatchId ?? "").trim(),
  };
});

const easyRows = [];
const hardRows = [];
let reclassifiedEasyRows = 0;

for (const row of normalizedRows) {
  if (row.difficulty === "easy") {
    if (isEligibleEasyRow(row)) {
      easyRows.push(row);
    } else {
      hardRows.push({ ...row, difficulty: "hard" });
      reclassifiedEasyRows += 1;
    }
    continue;
  }

  if (row.difficulty === "hard") {
    hardRows.push(row);
  }
}

await writeGamesCsv(outDataPath, normalizedRows, {
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

await writeGamesCsv(outEasyPath, easyRows, {
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

await writeGamesCsv(outHardPath, hardRows, {
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

console.log(`[build-pools] season_files=${seasonFiles.length}`);
console.log(`[build-pools] rows_read=${rowsRead} unique_rows=${normalizedRows.length}`);
console.log(`[build-pools] easy_policy=min_year_${EASY_MIN_YEAR},teams=${[...EASY_TEAMS].join("|")}`);
console.log(`[build-pools] reclassified_easy_to_hard=${reclassifiedEasyRows}`);
console.log(`[build-pools] easy_rows=${easyRows.length} hard_rows=${hardRows.length}`);
console.log(`[build-pools] wrote=${outDataPath}`);
console.log(`[build-pools] wrote=${outEasyPath}`);
console.log(`[build-pools] wrote=${outHardPath}`);
