#!/usr/bin/env node

import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const rootDir = process.cwd();
const sourcePath = path.join(rootDir, "data/ilk10-questions.ts");
const outputPath = path.join(rootDir, "data/ilk10/questions.json");
const require = createRequire(import.meta.url);

function readJsonModule(relativePath) {
  const payload = JSON.parse(awaitableReadFileSync(path.join(rootDir, relativePath)));
  payload.__esModule = true;
  payload.default = payload;
  return payload;
}

function awaitableReadFileSync(filePath) {
  return require("node:fs").readFileSync(filePath, "utf8");
}

function loadCurrentQuestions() {
  const source = awaitableReadFileSync(sourcePath);
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      resolveJsonModule: true,
    },
  }).outputText;

  const module = { exports: {} };
  const localRequire = (specifier) => {
    if (specifier === "@/data/ilk10-fbref-season-questions.json") {
      return readJsonModule("data/ilk10-fbref-season-questions.json");
    }
    if (specifier === "@/data/ilk10-research-verified-questions.json") {
      return readJsonModule("data/ilk10-research-verified-questions.json");
    }
    if (specifier === "@/types/ilk10") {
      return {};
    }
    return require(specifier);
  };

  vm.runInNewContext(
    transpiled,
    { require: localRequire, module, exports: module.exports, console },
    { filename: sourcePath }
  );

  return module.exports.ILK10_QUESTIONS;
}

function normalizeQuestion(question) {
  const status = question.status ?? (question.designExample ? "draft" : "live");
  return {
    ...question,
    status,
  };
}

const questions = loadCurrentQuestions().map(normalizeQuestion);

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(questions, null, 2)}\n`, "utf8");

const statusCounts = questions.reduce((counts, question) => {
  counts[question.status] = (counts[question.status] ?? 0) + 1;
  return counts;
}, {});

console.log(
  `[build-ilk10-canonical-json] questions=${questions.length} live=${statusCounts.live ?? 0} draft=${statusCounts.draft ?? 0} retired=${statusCounts.retired ?? 0} wrote=${outputPath}`
);
