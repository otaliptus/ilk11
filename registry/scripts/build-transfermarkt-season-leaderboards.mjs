#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureDir, writeJson } from "../lib/io.mjs";
import { fetchHtml, parseTmTable, TM as BASE_URL } from "../../scripts/ilk10/utils.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(__dirname, "..");

function getOption(name, fallback = null) {
  const args = process.argv.slice(2);
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) return "true";
  return value;
}

function seasonLabel(startYear) {
  return `${startYear}-${startYear + 1}`;
}

function getSeasonStarts(fromSeasonStart, toSeasonStart) {
  const starts = [];
  for (let start = fromSeasonStart; start <= toSeasonStart; start += 1) {
    starts.push(start);
  }
  return starts;
}

function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function numericFromText(value) {
  const text = normalizeText(value).replace(/,/g, "");
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePlayerIdFromHref(href) {
  const match = String(href ?? "").match(/\/spieler\/(\d+)/i);
  return match?.[1] ?? null;
}

async function sleep(ms) {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function extractTitle(html) {
  return normalizeText(html.match(/<title>(.*?)<\/title>/is)?.[1] ?? "");
}

function extractPaginationCount(html) {
  const pages = [...html.matchAll(/\/page\/(\d+)/g)].map((match) => Number(match[1])).filter(Number.isFinite);
  return Math.max(1, ...pages);
}

const LEADERBOARD_CONFIG = [
  {
    key: "goals",
    label: "Goals",
    path: "torschuetzenliste",
    statFromCells: (cells) => numericFromText(cells.at(-1)),
  },
  {
    key: "assists",
    label: "Assists",
    path: "scorerliste",
    statFromCells: (cells) => numericFromText(cells.at(-2)),
  },
];

function buildSeasonUrl(config, startYear, page = null) {
  const suffix = page && page > 1 ? `/page/${page}` : "";
  return `${BASE_URL}/super-lig/${config.path}/wettbewerb/TR1/saison_id/${startYear}${suffix}`;
}

async function fetchLeaderboard(config, startYear, delayMs) {
  const firstUrl = buildSeasonUrl(config, startYear);
  await sleep(delayMs);
  const { status: firstStatus, html: firstHtml } = await fetchHtml(firstUrl, 0);
  if (firstStatus !== 200) {
    throw new Error(`HTTP ${firstStatus} for ${firstUrl}`);
  }
  const pageCount = extractPaginationCount(firstHtml);
  const allEntries = [];

  for (let page = 1; page <= pageCount; page += 1) {
    const url = buildSeasonUrl(config, startYear, page);
    if (page > 1) await sleep(delayMs);
    const html =
      page === 1
        ? firstHtml
        : await fetchHtml(url, 0).then((response) => {
            if (response.status !== 200) {
              throw new Error(`HTTP ${response.status} for ${url}`);
            }
            return response.html;
          });

    for (const row of parseTmTable(html)) {
      const statValue = config.statFromCells(row.cells);
      if (statValue === null || statValue <= 0) continue;
      allEntries.push({
        rank: numericFromText(row.cells[0]),
        playerName: row.name,
        playerHref: row.profileHref,
        transfermarktId: parsePlayerIdFromHref(row.profileHref),
        statValue,
        cells: row.cells,
      });
    }
  }

  const deduped = [];
  const seen = new Set();
  for (const entry of allEntries) {
    const key = entry.transfermarktId ?? `${entry.playerName}__${entry.rank ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(entry);
  }

  deduped.sort((left, right) => right.statValue - left.statValue || left.playerName.localeCompare(right.playerName));

  return {
    key: config.key,
    title: config.label,
    source: "transfermarkt-season-table",
    sourceUrl: firstUrl,
    pageCount,
    entryCount: deduped.length,
    entries: deduped,
    topTenEntries: deduped.slice(0, 10),
    pageTitle: extractTitle(firstHtml),
  };
}

async function main() {
  const outputDir = path.resolve(projectDir, getOption("--out-dir", "output/transfermarkt-season-leaderboards"));
  const seasonOutputDir = path.join(outputDir, "seasons");
  const oneSeason = getOption("--season", null);
  const limitRaw = getOption("--limit", null);
  const fromSeasonStart = Number(getOption("--from-season", "2001")) || 2001;
  const toSeasonStart = Number(getOption("--to-season", "2021")) || 2021;
  const delayMs = Number(getOption("--delay-ms", "150")) || 0;

  const targetSeasonStarts = (() => {
    const all = getSeasonStarts(fromSeasonStart, toSeasonStart);
    if (oneSeason) {
      const match = oneSeason.match(/^(\d{4})(?:-(\d{4}))?$/);
      if (!match) throw new Error(`Invalid --season value: ${oneSeason}`);
      return [Number(match[1])];
    }
    if (limitRaw === null) return all;
    return all.slice(0, Math.max(0, Number(limitRaw) || 0));
  })();

  await ensureDir(outputDir);
  await ensureDir(seasonOutputDir);

  const summaries = [];
  const combined = [];

  for (const startYear of targetSeasonStarts) {
    const season = seasonLabel(startYear);
    console.log(`[registry] transfermarkt season leaderboards season=${season}`);

    const leaderboards = [];
    for (const config of LEADERBOARD_CONFIG) {
      const leaderboard = await fetchLeaderboard(config, startYear, delayMs);
      leaderboards.push(leaderboard);
      console.log(
        `[registry] transfermarkt season=${season} key=${config.key} entries=${leaderboard.entryCount} pages=${leaderboard.pageCount}`
      );
    }

    const payload = {
      metadata: {
        project: "ilk10-registry",
        builder: "build-transfermarkt-season-leaderboards",
        generatedAt: new Date().toISOString(),
        season,
      },
      season,
      sourceLabel: "Transfermarkt season leaderboards",
      leaderboards,
    };

    const seasonPath = path.join(seasonOutputDir, `${season}.json`);
    await writeJson(seasonPath, payload);

    summaries.push({
      season,
      outputPath: path.relative(projectDir, seasonPath),
      leaderboards: leaderboards.map((leaderboard) => ({
        key: leaderboard.key,
        entryCount: leaderboard.entryCount,
        pageCount: leaderboard.pageCount,
        sourceUrl: leaderboard.sourceUrl,
      })),
    });

    combined.push(payload);
  }

  await writeJson(path.join(outputDir, "index.json"), {
    metadata: {
      project: "ilk10-registry",
      builder: "build-transfermarkt-season-leaderboards",
      generatedAt: new Date().toISOString(),
      fromSeasonStart,
      toSeasonStart,
    },
    summary: {
      seasonCount: summaries.length,
      leaderboardCount: summaries.reduce((sum, season) => sum + season.leaderboards.length, 0),
    },
    seasonSummaries: summaries,
    seasons: combined,
  });

  console.log(`[registry] transfermarkt season leaderboards seasons=${summaries.length}`);
  console.log(`[registry] transfermarkt season leaderboards out=${path.join(outputDir, "index.json")}`);
}

main().catch((error) => {
  console.error(`[registry] transfermarkt season leaderboards failed: ${error.message}`);
  process.exit(1);
});
