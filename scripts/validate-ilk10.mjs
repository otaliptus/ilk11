#!/usr/bin/env node

import fs from "node:fs/promises";

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
      "  node scripts/validate-ilk10.mjs [--file <path>] [--max-list <n>]",
      "",
      "Examples:",
      "  node scripts/validate-ilk10.mjs",
      "  node scripts/validate-ilk10.mjs --file data/ilk10/questions.json",
    ].join("\n")
  );
}

if (hasFlag("--help")) {
  printUsage();
  process.exit(0);
}

const filePath = getOption("--file", "data/ilk10/questions.json");
const maxList = Number(getOption("--max-list", "10"));

const VALID_STATUSES = new Set(["live", "draft", "retired"]);

let questions;
try {
  questions = JSON.parse(await fs.readFile(filePath, "utf8"));
} catch (error) {
  console.error(`[validate-ilk10] failed to read ${filePath}: ${error.message}`);
  process.exit(1);
}

const errors = [];
const warnings = [];

if (!Array.isArray(questions)) {
  errors.push(`${filePath} is not a JSON array`);
} else if (questions.length === 0) {
  errors.push(`${filePath} contains no questions`);
}

const seenIds = new Map();

function answerSet(question) {
  return new Set(question.answers.map((answer) => answer.value));
}

const rows = Array.isArray(questions) ? questions : [];

for (let index = 0; index < rows.length; index += 1) {
  const question = rows[index];
  const where = `${filePath}[${index}]${question && question.id ? ` id=${question.id}` : ""}`;

  if (!question || typeof question !== "object") {
    errors.push(`${where} is not an object`);
    continue;
  }

  if (typeof question.id !== "string" || question.id.trim() === "") {
    errors.push(`${where} has an empty id`);
  } else if (seenIds.has(question.id)) {
    errors.push(`${where} duplicate id (first seen at index ${seenIds.get(question.id)})`);
  } else {
    seenIds.set(question.id, index);
  }

  if (typeof question.prompt !== "string" || question.prompt.trim() === "") {
    errors.push(`${where} has an empty prompt`);
  }
  if (typeof question.shortLabel !== "string" || question.shortLabel.trim() === "") {
    errors.push(`${where} has an empty shortLabel`);
  }
  if (typeof question.entityType !== "string" || question.entityType.trim() === "") {
    errors.push(`${where} has an empty entityType`);
  }
  if (typeof question.category !== "string" || question.category.trim() === "") {
    errors.push(`${where} has an empty category`);
  }

  if (typeof question.status !== "string") {
    warnings.push(`${where} has no status (assumed live)`);
  } else if (!VALID_STATUSES.has(question.status)) {
    errors.push(`${where} has invalid status "${question.status}"`);
  }

  if (question.designExample && question.status === "live") {
    errors.push(`${where} is a design example but marked live`);
  }

  if (!Array.isArray(question.answers)) {
    errors.push(`${where} has no answers array`);
    continue;
  }
  if (question.answers.length !== 10) {
    errors.push(`${where} has ${question.answers.length} answers (expected 10)`);
  }

  const values = [];
  for (const answer of question.answers) {
    if (!answer || typeof answer.value !== "string" || answer.value.trim() === "") {
      errors.push(`${where} contains an empty answer value`);
      continue;
    }
    values.push(answer.value);
  }
  if (new Set(values).size !== values.length) {
    errors.push(`${where} contains duplicate answer values`);
  }

  if (question.status === "live") {
    if (typeof question.sourceUrl !== "string" || question.sourceUrl.trim() === "") {
      warnings.push(`${where} is live without a sourceUrl`);
    }
    if (typeof question.note !== "string" || question.note.trim() === "") {
      warnings.push(`${where} is live without a note`);
    }
  }
}

// Duplicate and near-duplicate detection across live questions.
const liveQuestions = rows.filter((question) => question && question.status === "live");
const liveSets = liveQuestions.map((question) => ({
  id: question.id,
  set: answerSet(question),
}));

const exactDuplicates = [];
for (let i = 0; i < liveSets.length; i += 1) {
  for (let j = i + 1; j < liveSets.length; j += 1) {
    const a = liveSets[i];
    const b = liveSets[j];
    if (a.set.size === b.set.size && [...a.set].every((value) => b.set.has(value))) {
      exactDuplicates.push([a.id, b.id]);
    }
  }
}
for (const [a, b] of exactDuplicates) {
  warnings.push(`live questions "${a}" and "${b}" share the exact same answer set`);
}

const nearDuplicates = [];
for (let i = 0; i < liveSets.length; i += 1) {
  for (let j = i + 1; j < liveSets.length; j += 1) {
    const a = liveSets[i];
    const b = liveSets[j];
    if (a.set.size !== 10 || b.set.size !== 10) continue;
    let overlap = 0;
    for (const value of a.set) {
      if (b.set.has(value)) overlap += 1;
    }
    if (overlap >= 8 && !exactDuplicates.some(([x, y]) => x === a.id && y === b.id)) {
      nearDuplicates.push([overlap, a.id, b.id]);
    }
  }
}
nearDuplicates.sort((a, b) => b[0] - a[0]);

const statusCounts = rows.reduce((counts, question) => {
  const status = question && typeof question.status === "string" ? question.status : "live";
  counts[status] = (counts[status] ?? 0) + 1;
  return counts;
}, {});

console.log(`[validate-ilk10] file=${filePath}`);
console.log(
  `[validate-ilk10] questions=${rows.length} live=${statusCounts.live ?? 0} draft=${statusCounts.draft ?? 0} retired=${statusCounts.retired ?? 0}`
);
console.log(
  `[validate-ilk10] exact_live_duplicates=${exactDuplicates.length} near_live_duplicates_8plus=${nearDuplicates.length}`
);
if (nearDuplicates.length > 0) {
  for (const [overlap, a, b] of nearDuplicates.slice(0, maxList)) {
    console.log(`  ~ ${overlap}/10 shared answers: ${a} <> ${b}`);
  }
  if (nearDuplicates.length > maxList) {
    console.log(`  ~ ... ${nearDuplicates.length - maxList} more`);
  }
}

if (warnings.length > 0) {
  console.log(`[validate-ilk10] warnings=${warnings.length}`);
  const warningLimit = 50;
  for (const warning of warnings.slice(0, warningLimit)) {
    console.log(`  - ${warning}`);
  }
  if (warnings.length > warningLimit) {
    console.log(`  - ... ${warnings.length - warningLimit} more`);
  }
}

if (errors.length > 0) {
  console.error(`[validate-ilk10] errors=${errors.length}`);
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
  process.exit(1);
}

console.log("[validate-ilk10] OK");
