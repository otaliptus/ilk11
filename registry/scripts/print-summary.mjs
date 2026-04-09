#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJson, writeJson } from "../lib/io.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(__dirname, "..");

const files = [
  ["playersBootstrap", "output/players.bootstrap.json"],
  ["playersFbref", "output/players.fbref.json"],
  ["playersTransfermarkt", "output/players.transfermarkt.json"],
  ["playersTransfermarktHistorical", "output/players.transfermarkt.historical.json"],
  ["coachesTransfermarkt", "output/coaches.transfermarkt.json"],
  ["coachesTransfermarktHistorical", "output/coaches.transfermarkt.historical.json"],
  ["refereesTransfermarkt", "output/referees.transfermarkt.json"],
  ["coachesManual", "output/coaches.manual.json"],
  ["refereesManual", "output/referees.manual.json"],
  ["autocomplete", "output/autocomplete.json"],
];

const summary = {
  generatedAt: new Date().toISOString(),
  outputs: {},
};

for (const [key, relativePath] of files) {
  const absolutePath = path.resolve(projectDir, relativePath);
  const payload = await readJson(absolutePath, null);
  summary.outputs[key] = payload?.summary ?? null;
}

const outputPath = path.resolve(projectDir, "output/summary.json");
await writeJson(outputPath, summary);
console.log(JSON.stringify(summary, null, 2));
