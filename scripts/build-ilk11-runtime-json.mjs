#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { readGamesCsv } from "./lib/games-csv.mjs";

function getOption(name, fallback = null) {
  const args = process.argv.slice(2);
  const idx = args.indexOf(name);
  if (idx === -1) return fallback;
  const value = args[idx + 1];
  if (!value || value.startsWith("--")) return "true";
  return value;
}

function printUsage() {
  console.log(
    [
      "Usage:",
      "  node scripts/build-ilk11-runtime-json.mjs [--easy <path>] [--hard <path>] [--out-dir <path>]",
      "",
      "Defaults:",
      "  --easy public/easy.csv",
      "  --hard public/hard.csv",
      "  --out-dir public/data/ilk11",
    ].join("\n")
  );
}

if (process.argv.includes("--help")) {
  printUsage();
  process.exit(0);
}

const inputFiles = {
  easy: getOption("--easy", "public/easy.csv"),
  hard: getOption("--hard", "public/hard.csv"),
};
const outDir = getOption("--out-dir", "public/data/ilk11");

function normalizeCounts(values, expectedLength) {
  return Array.from({ length: expectedLength }, (_, index) => {
    const value = Number(values?.[index] ?? 0);
    return Number.isInteger(value) && value >= 0 ? value : 0;
  });
}

function normalizeNumbers(values, expectedLength) {
  return Array.from({ length: expectedLength }, (_, index) => {
    const value = Number(values?.[index]);
    return Number.isInteger(value) && value > 0 ? value : null;
  });
}

function normalizeBinaryFlags(values, expectedLength) {
  return Array.from({ length: expectedLength }, (_, index) => {
    const value = Number(values?.[index] ?? 0);
    return value > 0 ? 1 : 0;
  });
}

function toRuntimeRow(row) {
  const expectedLength = Array.isArray(row.lineup) ? row.lineup.length : 0;
  const lineupCards = normalizeCounts(row.lineupCards, expectedLength);
  const parsedLineupYellowCards = normalizeCounts(row.lineupYellowCards, expectedLength);
  const parsedLineupRedCards = normalizeCounts(row.lineupRedCards, expectedLength);
  const hasColoredCardColumns =
    Array.isArray(row.lineupYellowCards) ||
    Array.isArray(row.lineupRedCards);
  const coloredCardTotal =
    parsedLineupYellowCards.reduce((sum, count) => sum + count, 0) +
    parsedLineupRedCards.reduce((sum, count) => sum + count, 0);
  const legacyCardTotal = lineupCards.reduce((sum, count) => sum + count, 0);
  const hasColoredCards = hasColoredCardColumns && (coloredCardTotal > 0 || legacyCardTotal === 0);

  return {
    game: row.game,
    team: row.team,
    formation: row.formation,
    lineup: row.lineup,
    lineupNumbers: normalizeNumbers(row.lineupNumbers, expectedLength),
    lineupCaptains: normalizeBinaryFlags(row.lineupCaptains, expectedLength),
    lineupGoals: normalizeCounts(row.lineupGoals, expectedLength),
    lineupAssists: normalizeCounts(row.lineupAssists, expectedLength),
    hasColoredCards,
    lineupCards,
    lineupYellowCards: hasColoredCards ? parsedLineupYellowCards : [],
    lineupRedCards: hasColoredCards ? parsedLineupRedCards : [],
    lineupSubstitutions: normalizeCounts(row.lineupSubstitutions, expectedLength),
    sourceMatchId: String(row.sourceMatchId ?? "").trim(),
  };
}

async function buildPool(difficulty, inputPath) {
  const parsed = await readGamesCsv(inputPath);
  if (parsed.errors.length > 0) {
    console.error(`[build-ilk11-runtime-json] parse errors in ${inputPath}`);
    for (const error of parsed.errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }

  const rows = parsed.rows
    .filter((row) => row.lineup.length === 11)
    .filter((row) => !row.difficulty || row.difficulty === difficulty)
    .map(toRuntimeRow);

  if (rows.length === 0) {
    console.error(`[build-ilk11-runtime-json] no valid ${difficulty} rows in ${inputPath}`);
    process.exit(1);
  }

  const payload = {
    v: 1,
    d: difficulty,
    r: rows.map((row) => [
      row.game,
      row.team,
      row.formation,
      row.lineup,
      row.lineupNumbers,
      row.lineupCaptains,
      row.lineupGoals,
      row.lineupAssists,
      row.hasColoredCards,
      row.lineupCards,
      row.lineupYellowCards,
      row.lineupRedCards,
      row.lineupSubstitutions,
      row.sourceMatchId,
    ]),
  };

  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `${difficulty}.json`);
  await fs.writeFile(outPath, `${JSON.stringify(payload)}\n`, "utf8");
  console.log(`[build-ilk11-runtime-json] ${difficulty}_rows=${rows.length} wrote=${outPath}`);
}

await buildPool("easy", inputFiles.easy);
await buildPool("hard", inputFiles.hard);
