#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

import {
  dateKeyToDayIndex,
  dayIndexToDateKey,
  getGameForDifficulty,
  getTurkeyDateKey,
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
      "  node scripts/build-ilk11-daily-json.mjs [--start YYYY-MM-DD] [--days 400] [--pool-dir <path>] [--out-dir <path>]",
      "",
      "Defaults:",
      "  --start today in Europe/Istanbul",
      "  --days 400",
      "  --pool-dir public/data/ilk11",
      "  --out-dir public/data/daily",
    ].join("\n")
  );
}

if (process.argv.includes("--help")) {
  printUsage();
  process.exit(0);
}

const startDateKey = getOption("--start", getTurkeyDateKey(new Date()));
const days = Number(getOption("--days", "400"));
const poolDir = getOption("--pool-dir", "public/data/ilk11");
const outDir = getOption("--out-dir", "public/data/daily");

if (!/^\d{4}-\d{2}-\d{2}$/.test(startDateKey)) {
  console.error(`[build-ilk11-daily-json] invalid --start "${startDateKey}"`);
  process.exit(1);
}

if (!Number.isInteger(days) || days <= 0) {
  console.error(`[build-ilk11-daily-json] invalid --days "${days}"`);
  process.exit(1);
}

const pools = {
  easy: await readRuntimePool(path.join(poolDir, "easy.json"), "easy"),
  hard: await readRuntimePool(path.join(poolDir, "hard.json"), "hard"),
};

await fs.mkdir(outDir, { recursive: true });

const startDayIndex = dateKeyToDayIndex(startDateKey);
let firstPayload = null;
let lastPayload = null;

for (let offset = 0; offset < days; offset += 1) {
  const dateKey = dayIndexToDateKey(startDayIndex + offset);
  const payload = {
    v: 1,
    dateKey,
    ilk11: {
      easy: getGameForDifficulty(pools, "easy", dateKey),
      hard: getGameForDifficulty(pools, "hard", dateKey),
    },
  };

  if (!firstPayload) firstPayload = payload;
  lastPayload = payload;

  await fs.writeFile(path.join(outDir, `${dateKey}.json`), `${JSON.stringify(payload)}\n`, "utf8");
}

console.log(
  `[build-ilk11-daily-json] wrote=${days} out_dir=${outDir} first=${firstPayload.dateKey} last=${lastPayload.dateKey}`
);
console.log(
  `[build-ilk11-daily-json] first_easy=${firstPayload.ilk11.easy.sourceMatchId} first_hard=${firstPayload.ilk11.hard.sourceMatchId}`
);

