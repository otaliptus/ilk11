#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeAsciiText, slugify } from "../lib/normalize.mjs";
import { writeJson } from "../lib/io.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const registryDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(registryDir, "..");

const seasonDir = path.resolve(registryDir, "output/fbref-season-leaderboards/seasons");
const outputPath = path.resolve(repoRoot, "data/ilk10-fbref-season-questions.json");

const LEADERBOARD_CONFIG = [
  {
    key: "goals",
    shortLabel: (season) => `${shortSeason(season)} Goals`,
    prompt: (season) => `Top 10 Super Lig scorers in ${season}`,
    category: "season-stats",
  },
  {
    key: "assists",
    shortLabel: (season) => `${shortSeason(season)} Assists`,
    prompt: (season) => `Top 10 Super Lig assist leaders in ${season}`,
    category: "season-stats",
  },
  {
    key: "cards_yellow",
    shortLabel: (season) => `${shortSeason(season)} Yellows`,
    prompt: (season) => `Top 10 most yellow-carded Super Lig players in ${season}`,
    category: "season-stats",
  },
  {
    key: "cards_red",
    shortLabel: (season) => `${shortSeason(season)} Reds`,
    prompt: (season) => `Top 10 most red-carded Super Lig players in ${season}`,
    category: "season-stats",
  },
  {
    key: "gk_clean_sheets",
    shortLabel: (season) => `${shortSeason(season)} Clean Sheets`,
    prompt: (season) => `Top 10 Super Lig goalkeepers by clean sheets in ${season}`,
    category: "season-stats",
  },
  {
    key: "gk_saves",
    shortLabel: (season) => `${shortSeason(season)} Saves`,
    prompt: (season) => `Top 10 Super Lig goalkeepers by saves in ${season}`,
    category: "season-stats",
  },
  {
    key: "minutes",
    shortLabel: (season) => `${shortSeason(season)} Minutes`,
    prompt: (season) => `Top 10 Super Lig players by minutes played in ${season}`,
    category: "season-stats",
  },
  {
    key: "shots_on_target",
    shortLabel: (season) => `${shortSeason(season)} On Target`,
    prompt: (season) => `Top 10 Super Lig players by shots on target in ${season}`,
    category: "season-stats",
  },
  {
    key: "pens_made",
    shortLabel: (season) => `${shortSeason(season)} Pens`,
    prompt: (season) => `Top 10 Super Lig penalty scorers in ${season}`,
    category: "season-stats",
  },
]

function shortSeason(season) {
  const [start, end] = String(season).split("-");
  return `${start}-${String(end).slice(-2)}`;
}

function buildQuestionId(season, key) {
  return `fbref-${slugify(season)}-${slugify(key)}`;
}

function compactPlayerName(name) {
  return normalizeAsciiText(name);
}

function findLeaderboard(payload, key) {
  return (payload.rawLeaderboards ?? []).find((leaderboard) => leaderboard.key === key) ?? null;
}

const files = (await fs.readdir(seasonDir)).filter((name) => name.endsWith(".json")).sort();
const questions = [];
const skipped = [];

for (const fileName of files) {
  const filePath = path.join(seasonDir, fileName);
  const payload = JSON.parse(await fs.readFile(filePath, "utf8"));
  const season = payload.season;

  for (const config of LEADERBOARD_CONFIG) {
    const leaderboard = findLeaderboard(payload, config.key);
    if (!leaderboard) {
      skipped.push({ season, key: config.key, reason: "missing leaderboard" });
      continue;
    }

    const topTenEntries = Array.isArray(leaderboard.topTenEntries) ? leaderboard.topTenEntries : [];
    if (topTenEntries.length !== 10) {
      skipped.push({
        season,
        key: config.key,
        reason: `expected 10 entries, got ${topTenEntries.length}`,
      });
      continue;
    }

    questions.push({
      id: buildQuestionId(season, config.key),
      shortLabel: config.shortLabel(season),
      prompt: config.prompt(season),
      entityType: "player",
      category: config.category,
      sourceLabel: `FBref ${season} Super Lig leaderboard`,
      sourceUrl: payload.sourceUrl,
      note: `Generated from stored FBref season leaderboard "${leaderboard.title}".`,
      answers: topTenEntries.map((entry) => ({
        value: compactPlayerName(entry.playerName),
      })),
    });
  }
}

questions.sort((left, right) => left.id.localeCompare(right.id));

await writeJson(outputPath, questions);

console.log(`[ilk10] fbref season questions=${questions.length}`);
console.log(`[ilk10] fbref season skipped=${skipped.length}`);
console.log(`[ilk10] fbref season out=${outputPath}`);
