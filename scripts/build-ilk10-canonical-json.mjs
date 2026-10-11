#!/usr/bin/env node

import fs from "node:fs/promises";

// `data/ilk10/questions.json` is the canonical bank consumed by the app.
// This script normalizes it in place: it fills in default statuses and
// re-serializes with stable formatting. Run `validate-ilk10.mjs` for checks.

function getOption(name, fallback = null) {
  const args = process.argv.slice(2);
  const idx = args.indexOf(name);
  if (idx === -1) return fallback;
  const value = args[idx + 1];
  if (!value || value.startsWith("--")) return "true";
  return value;
}

if (process.argv.includes("--help")) {
  console.log(
    [
      "Usage:",
      "  node scripts/build-ilk10-canonical-json.mjs [--file <path>]",
      "",
      "Normalizes data/ilk10/questions.json (status defaults) and writes it back.",
    ].join("\n")
  );
  process.exit(0);
}

const filePath = getOption("--file", "data/ilk10/questions.json");

let questions;
try {
  questions = JSON.parse(await fs.readFile(filePath, "utf8"));
} catch (error) {
  console.error(`[build-ilk10-canonical-json] failed to read ${filePath}: ${error.message}`);
  process.exit(1);
}

if (!Array.isArray(questions)) {
  console.error(`[build-ilk10-canonical-json] ${filePath} is not a JSON array`);
  process.exit(1);
}

let normalizedStatuses = 0;
const normalized = questions.map((question) => {
  if (!question || typeof question !== "object") return question;
  if (typeof question.status === "string") return question;
  normalizedStatuses += 1;
  return {
    ...question,
    status: question.designExample ? "draft" : "live",
  };
});

await fs.writeFile(filePath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");

const statusCounts = normalized.reduce((counts, question) => {
  const status = question && typeof question.status === "string" ? question.status : "live";
  counts[status] = (counts[status] ?? 0) + 1;
  return counts;
}, {});

console.log(
  `[build-ilk10-canonical-json] questions=${normalized.length} live=${statusCounts.live ?? 0} draft=${statusCounts.draft ?? 0} retired=${statusCounts.retired ?? 0}`
);
console.log(
  `[build-ilk10-canonical-json] statuses_filled=${normalizedStatuses} wrote=${filePath}`
);
