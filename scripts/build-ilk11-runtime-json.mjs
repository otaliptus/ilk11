#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { readCsvRuntimeRows, toCompactRuntimeRow } from "./lib/ilk11-runtime.mjs";

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

async function buildPool(difficulty, inputPath) {
  let rows;
  try {
    rows = await readCsvRuntimeRows(inputPath, difficulty);
  } catch (error) {
    console.error(`[build-ilk11-runtime-json] parse errors in ${inputPath}`);
    for (const line of String(error.message).split("\n")) {
      console.error(`  - ${line}`);
    }
    process.exit(1);
  }

  if (rows.length === 0) {
    console.error(`[build-ilk11-runtime-json] no valid ${difficulty} rows in ${inputPath}`);
    process.exit(1);
  }

  const payload = {
    v: 1,
    d: difficulty,
    r: rows.map(toCompactRuntimeRow),
  };

  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `${difficulty}.json`);
  await fs.writeFile(outPath, `${JSON.stringify(payload)}\n`, "utf8");
  console.log(`[build-ilk11-runtime-json] ${difficulty}_rows=${rows.length} wrote=${outPath}`);
}

await buildPool("easy", inputFiles.easy);
await buildPool("hard", inputFiles.hard);
