#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

import {
  dateKeyToDayIndex,
  dayIndexToDateKey,
  getGameForDifficulty,
  getTurkeyDateKey,
  readCsvRuntimeRows,
  readRuntimePool,
} from "./lib/ilk11-runtime.mjs";

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
      "  node scripts/validate-ilk11-runtime.mjs [--easy-csv <path>] [--hard-csv <path>] [--pool-dir <path>] [--daily-dir <path>] [--start YYYY-MM-DD] [--days 400]",
      "",
      "Defaults:",
      "  --easy-csv public/easy.csv",
      "  --hard-csv public/hard.csv",
      "  --pool-dir public/data/ilk11",
      "  --daily-dir public/data/daily",
      "  --start today in Europe/Istanbul",
      "  --days 400",
    ].join("\n")
  );
}

if (process.argv.includes("--help")) {
  printUsage();
  process.exit(0);
}

const csvFiles = {
  easy: getOption("--easy-csv", "public/easy.csv"),
  hard: getOption("--hard-csv", "public/hard.csv"),
};
const poolDir = getOption("--pool-dir", "public/data/ilk11");
const dailyDir = getOption("--daily-dir", "public/data/daily");
const startDateKey = getOption("--start", getTurkeyDateKey(new Date()));
const days = Number(getOption("--days", "400"));

const errors = [];

function stable(value) {
  return JSON.stringify(value);
}

function gameIdentity(game) {
  return {
    game: game.game,
    team: game.team,
    difficulty: game.difficulty,
    dateKey: game.dateKey,
    formation: game.formation,
    lineup: game.lineup,
    lineupNumbers: game.lineupNumbers,
    lineupCaptains: game.lineupCaptains,
    lineupGoals: game.lineupGoals,
    lineupAssists: game.lineupAssists,
    hasColoredCards: game.hasColoredCards,
    lineupCards: game.lineupCards,
    lineupYellowCards: game.lineupYellowCards,
    lineupRedCards: game.lineupRedCards,
    lineupSubstitutions: game.lineupSubstitutions,
    sourceMatchId: game.sourceMatchId,
    gameId: game.gameId,
  };
}

function assertEqual(label, actual, expected) {
  if (stable(actual) !== stable(expected)) {
    errors.push(`${label} mismatch`);
  }
}

const csvPools = {
  easy: await readCsvRuntimeRows(csvFiles.easy, "easy"),
  hard: await readCsvRuntimeRows(csvFiles.hard, "hard"),
};

const runtimePools = {
  easy: await readRuntimePool(path.join(poolDir, "easy.json"), "easy"),
  hard: await readRuntimePool(path.join(poolDir, "hard.json"), "hard"),
};

for (const difficulty of ["easy", "hard"]) {
  console.log(
    `[validate-ilk11-runtime] ${difficulty}_csv_rows=${csvPools[difficulty].length} ${difficulty}_json_rows=${runtimePools[difficulty].length}`
  );
  assertEqual(`${difficulty} row count`, runtimePools[difficulty].length, csvPools[difficulty].length);
  assertEqual(`${difficulty} rows`, runtimePools[difficulty], csvPools[difficulty]);
}

const startDayIndex = dateKeyToDayIndex(startDateKey);
for (let offset = 0; offset < days; offset += 1) {
  const dateKey = dayIndexToDateKey(startDayIndex + offset);
  const expectedEasy = gameIdentity(getGameForDifficulty(csvPools, "easy", dateKey));
  const expectedHard = gameIdentity(getGameForDifficulty(csvPools, "hard", dateKey));
  const runtimeEasy = gameIdentity(getGameForDifficulty(runtimePools, "easy", dateKey));
  const runtimeHard = gameIdentity(getGameForDifficulty(runtimePools, "hard", dateKey));

  assertEqual(`${dateKey} easy runtime`, runtimeEasy, expectedEasy);
  assertEqual(`${dateKey} hard runtime`, runtimeHard, expectedHard);

  try {
    const dailyPayload = JSON.parse(await fs.readFile(path.join(dailyDir, `${dateKey}.json`), "utf8"));
    assertEqual(`${dateKey} daily dateKey`, dailyPayload.dateKey, dateKey);
    assertEqual(`${dateKey} daily easy`, gameIdentity(dailyPayload.ilk11?.easy), expectedEasy);
    assertEqual(`${dateKey} daily hard`, gameIdentity(dailyPayload.ilk11?.hard), expectedHard);
  } catch (error) {
    errors.push(`${dateKey} daily payload missing or invalid: ${error.message}`);
  }
}

const today = getTurkeyDateKey(new Date());
const todayEasy = getGameForDifficulty(runtimePools, "easy", today);
const todayHard = getGameForDifficulty(runtimePools, "hard", today);
console.log(
  `[validate-ilk11-runtime] today=${today} easy=${todayEasy.sourceMatchId}:${todayEasy.team} hard=${todayHard.sourceMatchId}:${todayHard.team}`
);

if (errors.length > 0) {
  console.error(`[validate-ilk11-runtime] errors=${errors.length}`);
  for (const error of errors.slice(0, 50)) {
    console.error(`  - ${error}`);
  }
  if (errors.length > 50) {
    console.error(`  - ... ${errors.length - 50} more`);
  }
  process.exit(1);
}

console.log(`[validate-ilk11-runtime] OK days=${days} start=${startDateKey}`);

