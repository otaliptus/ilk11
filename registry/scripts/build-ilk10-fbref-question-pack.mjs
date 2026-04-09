#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeAsciiText, normalizeSearchKey, slugify } from "../lib/normalize.mjs";
import { readJson, writeJson } from "../lib/io.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const registryDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(registryDir, "..");

const seasonDir = path.resolve(registryDir, "output/fbref-season-leaderboards/seasons");
const tmSeasonDir = path.resolve(registryDir, "output/transfermarkt-season-leaderboards/seasons");
const outputPath = path.resolve(repoRoot, "data/ilk10-fbref-season-questions.json");
const fbrefPlayersPath = path.resolve(registryDir, "output/players.fbref.json");
const transfermarktPlayersPath = path.resolve(registryDir, "output/players.transfermarkt.historical.json");
const transfermarktCurrentPlayersPath = path.resolve(registryDir, "output/players.transfermarkt.json");

const TEAM_ALIAS_MAP = new Map(
  [
    ["Istanbul BB", "Istanbul Basaksehir"],
    ["Basaksehir", "Istanbul Basaksehir"],
    ["Mersin IY", "Mersin Idmanyurdu"],
    ["A Sebatspor", "Akcaabat Sebatspor"],
    ["Ankaragucu", "MKE Ankaragucu"],
    ["Gaziantep BB", "Gaziantep Buyuksehir Belediyespor"],
  ].map(([from, to]) => [normalizeAsciiText(from), normalizeAsciiText(to)])
);

const TM_ENTITY_ID_OVERRIDES_BY_FBREF_ID = new Map([
  ["3cfc870f", "player:tm-historical-45596-marcio-mossoro"],
  ["3571f3d1", "player:tm-historical-3374-njitap-geremi"],
  ["b2dea386", "player:tm-historical-18537-alex"],
  ["2a31d34d", "player:tm-historical-15821-mert-nobre"],
  ["0928af22", "player:tm-historical-8886-matias-delgado"],
  ["af985d2f", "player:tm-historical-47011-oscar-scarione"],
]);

const MODERN_SEASON_START_YEAR = 2022;

const HISTORICAL_RANGE_BUCKETS = [
  { startYear: 2001, endYear: 2005 },
  { startYear: 2006, endYear: 2010 },
  { startYear: 2011, endYear: 2015 },
  { startYear: 2016, endYear: 2021 },
];

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
];

const HISTORICAL_RANGE_KEYS = new Set([
  "goals",
  "assists",
]);

function shortSeason(season) {
  const [start, end] = String(season).split("-");
  return `${start}-${String(end).slice(-2)}`;
}

function buildQuestionId(season, key) {
  return `fbref-${slugify(season)}-${slugify(key)}`;
}

function buildRangeQuestionId(startYear, endYear, key) {
  return `fbref-range-${startYear}-${endYear + 1}-${slugify(key)}`;
}

function compactPlayerName(name) {
  return normalizeAsciiText(name);
}

function seasonLabel(startYear) {
  return `${startYear}-${startYear + 1}`;
}

function getSeasonStartYear(season) {
  return Number(String(season).split("-")[0]);
}

function formatShortRangeLabel(startYear, endYear) {
  return `${startYear}-${String(endYear + 1).slice(-2)}`;
}

function formatLongSeasonLabel(startYear, endYear) {
  return `${startYear}-${startYear + 1} through ${endYear}-${endYear + 1}`;
}

function buildHistoricalShortLabel(key, startYear, endYear) {
  const rangeLabel = formatShortRangeLabel(startYear, endYear);
  switch (key) {
    case "goals":
      return `${rangeLabel} Goals`
    case "assists":
      return `${rangeLabel} Assists`
    case "cards_yellow":
      return `${rangeLabel} Yellows`
    case "cards_red":
      return `${rangeLabel} Reds`
    case "gk_clean_sheets":
      return `${rangeLabel} Clean Sheets`
    case "minutes":
      return `${rangeLabel} Minutes`
    case "pens_made":
      return `${rangeLabel} Pens`
    default:
      return `${rangeLabel} ${key}`
  }
}

function buildHistoricalPrompt(key, startYear, endYear) {
  const range = formatLongSeasonLabel(startYear, endYear);
  switch (key) {
    case "goals":
      return `Top 10 Super Lig scorers from ${range}`
    case "assists":
      return `Top 10 Super Lig assist leaders from ${range}`
    case "cards_yellow":
      return `Top 10 most yellow-carded Super Lig players from ${range}`
    case "cards_red":
      return `Top 10 most red-carded Super Lig players from ${range}`
    case "gk_clean_sheets":
      return `Top 10 Super Lig goalkeepers by clean sheets from ${range}`
    case "minutes":
      return `Top 10 Super Lig players by minutes played from ${range}`
    case "pens_made":
      return `Top 10 Super Lig penalty scorers from ${range}`
    default:
      return `Top 10 Super Lig players from ${range}`
  }
}

function normalizeTeamKey(team) {
  const normalized = normalizeAsciiText(team);
  return TEAM_ALIAS_MAP.get(normalized) ?? normalized;
}

function tokenizeName(name) {
  return compactPlayerName(name)
    .split(/[\s\-'.’`]+/)
    .map((token) => normalizeSearchKey(token))
    .filter(Boolean);
}

function diceCoefficient(left, right) {
  const leftKey = normalizeSearchKey(left);
  const rightKey = normalizeSearchKey(right);
  if (!leftKey || !rightKey) return 0;
  if (leftKey === rightKey) return 1;

  const buildBigrams = (value) => {
    const bigrams = new Map();
    for (let index = 0; index < value.length - 1; index += 1) {
      const bigram = value.slice(index, index + 2);
      bigrams.set(bigram, (bigrams.get(bigram) ?? 0) + 1);
    }
    return bigrams;
  };

  const leftBigrams = buildBigrams(leftKey);
  const rightBigrams = buildBigrams(rightKey);
  let overlap = 0;
  for (const [bigram, count] of leftBigrams) {
    overlap += Math.min(count, rightBigrams.get(bigram) ?? 0);
  }

  return (2 * overlap) / Math.max(1, leftKey.length + rightKey.length - 2);
}

function findLeaderboard(payload, key) {
  return (payload.rawLeaderboards ?? []).find((leaderboard) => leaderboard.key === key) ?? null;
}

function buildTmIndexes(entities) {
  const byId = new Map();
  const byExactName = new Map();
  const bySeasonTeam = new Map();

  for (const entity of entities) {
    byId.set(entity.id, entity);

    const names = new Set([entity.displayName, entity.canonicalName, ...(entity.aliases ?? [])]);
    for (const name of names) {
      const key = normalizeSearchKey(name);
      if (!key) continue;
      if (!byExactName.has(key)) {
        byExactName.set(key, []);
      }
      byExactName.get(key).push(entity);
    }

    const seasons = entity.seasons ?? [];
    const teams = (entity.teams ?? []).map((teamEntry) => normalizeTeamKey(teamEntry.team));
    for (const season of seasons) {
      for (const team of teams) {
        const key = `${season}__${team}`;
        if (!bySeasonTeam.has(key)) {
          bySeasonTeam.set(key, []);
        }
        bySeasonTeam.get(key).push(entity);
      }
    }
  }

  return { byId, byExactName, bySeasonTeam };
}

function rankTmCandidates(entry, fbrefEntity, tmCandidates) {
  const entryTokens = new Set(tokenizeName(entry.playerName));
  const entrySearchKey = normalizeSearchKey(entry.playerName);

  return tmCandidates
    .map((candidate) => {
      const candidateNames = [candidate.displayName, candidate.canonicalName, ...(candidate.aliases ?? [])];
      const candidateTokenSets = candidateNames.map((name) => new Set(tokenizeName(name)));
      const tokenOverlap = Math.max(
        0,
        ...candidateTokenSets.map((tokenSet) => [...entryTokens].filter((token) => tokenSet.has(token)).length)
      );
      const bestDice = Math.max(0, ...candidateNames.map((name) => diceCoefficient(entry.playerName, name)));
      const exactAlias = candidateNames.some((name) => normalizeSearchKey(name) === entrySearchKey) ? 1 : 0;
      const birthMatch =
        fbrefEntity?.birthYear && candidate.birthYear && fbrefEntity.birthYear === candidate.birthYear ? 1 : 0;
      const seasonMatch = (candidate.seasons ?? []).includes(entry.season) ? 1 : 0;
      const teamMatch = (candidate.teams ?? []).some(
        (teamEntry) => normalizeTeamKey(teamEntry.team) === normalizeTeamKey(entry.team)
      )
        ? 1
        : 0;

      return {
        candidate,
        exactAlias,
        birthMatch,
        seasonMatch,
        teamMatch,
        tokenOverlap,
        bestDice,
        score:
          exactAlias * 1000 +
          teamMatch * 200 +
          seasonMatch * 50 +
          birthMatch * 100 +
          tokenOverlap * 20 +
          Math.round(bestDice * 100),
      };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.teamMatch - left.teamMatch ||
        right.seasonMatch - left.seasonMatch ||
        right.birthMatch - left.birthMatch
    );
}

function acceptRankedCandidate(best, next) {
  if (!best) return false;

  const strongNameEvidence = best.exactAlias === 1 || best.bestDice >= 0.72 || best.tokenOverlap >= 2;
  const contextEvidence = best.teamMatch === 1 || best.seasonMatch === 1 || best.birthMatch === 1;
  if (!strongNameEvidence || !contextEvidence) {
    return false;
  }

  if (!next) {
    return true;
  }

  return (
    best.score >= next.score + 10 ||
    best.bestDice >= next.bestDice + 0.08 ||
    best.tokenOverlap >= next.tokenOverlap + 1 ||
    best.exactAlias > next.exactAlias
  );
}

function chooseTransfermarktEntity(entry, fbrefEntity, tmIndexes) {
  const overrideEntityId = TM_ENTITY_ID_OVERRIDES_BY_FBREF_ID.get(entry.fbrefId);
  if (overrideEntityId) {
    return tmIndexes.byId.get(overrideEntityId) ?? null;
  }

  const exactNameKey = normalizeSearchKey(entry.playerName);
  const exactGlobalCandidates = tmIndexes.byExactName.get(exactNameKey) ?? [];
  if (exactGlobalCandidates.length === 1) {
    return exactGlobalCandidates[0];
  }

  const seasonTeamCandidates = tmIndexes.bySeasonTeam.get(`${entry.season}__${normalizeTeamKey(entry.team)}`) ?? [];
  const rankedSeasonTeam = rankTmCandidates(entry, fbrefEntity, seasonTeamCandidates);
  if (acceptRankedCandidate(rankedSeasonTeam[0], rankedSeasonTeam[1])) {
    return rankedSeasonTeam[0].candidate;
  }

  const rankedGlobal = rankTmCandidates(entry, fbrefEntity, exactGlobalCandidates);
  if (acceptRankedCandidate(rankedGlobal[0], rankedGlobal[1])) {
    return rankedGlobal[0].candidate;
  }

  const broadPool = tmPlayers.filter(
    (candidate) =>
      (fbrefEntity?.birthYear && candidate.birthYear === fbrefEntity.birthYear) ||
      (candidate.seasons ?? []).includes(entry.season) ||
      (candidate.teams ?? []).some((teamEntry) => normalizeTeamKey(teamEntry.team) === normalizeTeamKey(entry.team))
  );
  const rankedBroad = rankTmCandidates(entry, fbrefEntity, broadPool);
  if (acceptRankedCandidate(rankedBroad[0], rankedBroad[1])) {
    return rankedBroad[0].candidate;
  }

  return null;
}

function buildAnswer(entry, fbrefPlayersById, tmIndexes, stats) {
  const value = compactPlayerName(entry.playerName);
  const fbrefId = entry.fbrefId ?? null;
  const fbrefEntity = fbrefId ? fbrefPlayersById.get(fbrefId) ?? null : null;
  const tmEntity = chooseTransfermarktEntity(entry, fbrefEntity, tmIndexes);

  if (tmEntity) {
    stats.transfermarktMatches += 1;
    return {
      value,
      entityId: tmEntity.id,
      sourceIds: {
        ...(fbrefId ? { fbref: fbrefId } : {}),
        ...(tmEntity.sourceIds?.transfermarkt ? { transfermarkt: String(tmEntity.sourceIds.transfermarkt) } : {}),
      },
    };
  }

  if (fbrefEntity) {
    stats.fbrefFallbacks += 1;
    return {
      value,
      entityId: fbrefEntity.id,
      sourceIds: {
        ...(fbrefId ? { fbref: fbrefId } : {}),
      },
    };
  }

  stats.unresolved += 1;
  return { value };
}

function chooseHistoricalRangeBucket(startYear) {
  return HISTORICAL_RANGE_BUCKETS.find((bucket) => startYear >= bucket.startYear && startYear <= bucket.endYear) ?? null;
}

function buildTmPlayersByTransfermarktId(entities) {
  const byTransfermarktId = new Map();
  for (const entity of entities) {
    const transfermarktId = entity.sourceIds?.transfermarkt;
    if (!transfermarktId) continue;
    byTransfermarktId.set(String(transfermarktId), entity);
  }
  return byTransfermarktId;
}

function choosePreferredEntityId(entityIds) {
  return (
    entityIds.find((entityId) => String(entityId).includes(":tm-historical-")) ??
    entityIds.find((entityId) => String(entityId).includes(":fbref-")) ??
    entityIds[0]
  );
}

function choosePreferredValue(values) {
  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || right[0].length - left[0].length || left[0].localeCompare(right[0]))[0]?.[0];
}

function buildAggregatedAnswer(group) {
  const preferredValue = choosePreferredValue(group.values);
  const aliases = [...new Set(group.values.filter((value) => value !== preferredValue))].sort((left, right) =>
    left.localeCompare(right)
  );
  const entityIds = [...new Set(group.entityIds.filter(Boolean))];
  const entityId = choosePreferredEntityId(entityIds);
  const fbrefIds = [...new Set(group.fbrefIds.filter(Boolean))];
  const transfermarktIds = [...new Set(group.transfermarktIds.filter(Boolean))];

  return {
    value: preferredValue,
    ...(entityId ? { entityId } : {}),
    ...(aliases.length > 0 ? { aliases } : {}),
    ...((fbrefIds.length > 0 || transfermarktIds.length > 0)
      ? {
          sourceIds: {
            ...(fbrefIds.length === 1 ? { fbref: fbrefIds[0] } : {}),
            ...(transfermarktIds.length === 1 ? { transfermarkt: transfermarktIds[0] } : {}),
          },
        }
      : {}),
  };
}

function aggregateHistoricalEntries(entries) {
  const groups = new Map();

  for (const entry of entries) {
    const sourceKey = entry.answer.sourceIds?.fbref ?? entry.answer.entityId ?? normalizeSearchKey(entry.answer.value);
    if (!groups.has(sourceKey)) {
      groups.set(sourceKey, {
        total: 0,
        values: [],
        entityIds: [],
        fbrefIds: [],
        transfermarktIds: [],
      });
    }

    const group = groups.get(sourceKey);
    group.total += Number(entry.statValue ?? 0);
    group.values.push(entry.answer.value);
    if (entry.answer.entityId) group.entityIds.push(entry.answer.entityId);
    if (entry.answer.sourceIds?.fbref) group.fbrefIds.push(entry.answer.sourceIds.fbref);
    if (entry.answer.sourceIds?.transfermarkt) group.transfermarktIds.push(entry.answer.sourceIds.transfermarkt);
  }

  return [...groups.values()]
    .sort((left, right) => right.total - left.total || choosePreferredValue(left.values).localeCompare(choosePreferredValue(right.values)))
    .slice(0, 10)
    .map((group) => buildAggregatedAnswer(group));
}

function findTmLeaderboard(payload, key) {
  return (payload.leaderboards ?? []).find((leaderboard) => leaderboard.key === key) ?? null;
}

function buildHistoricalTmAnswer(entry, tmPlayersByTransfermarktId) {
  const transfermarktId = entry.transfermarktId ? String(entry.transfermarktId) : null;
  const tmEntity = transfermarktId ? tmPlayersByTransfermarktId.get(transfermarktId) ?? null : null;
  const entityDisplayName = compactPlayerName(tmEntity?.displayName ?? tmEntity?.canonicalName ?? "");
  const scrapedName = compactPlayerName(entry.playerName);
  const value = entityDisplayName || scrapedName;
  const aliases = [...new Set([scrapedName, compactPlayerName(tmEntity?.canonicalName ?? "")])]
    .filter((alias) => alias && alias !== value)
    .sort((left, right) => left.localeCompare(right));

  return {
    value,
    ...(tmEntity?.id ? { entityId: tmEntity.id } : {}),
    ...(aliases.length > 0 ? { aliases } : {}),
    ...(transfermarktId ? { sourceIds: { transfermarkt: transfermarktId } } : {}),
  };
}

function aggregateHistoricalTmEntries(entries) {
  const groups = new Map();

  for (const entry of entries) {
    const transfermarktId = entry.answer.sourceIds?.transfermarkt ?? null;
    const sourceKey = transfermarktId ?? entry.answer.entityId ?? normalizeSearchKey(entry.answer.value);
    if (!groups.has(sourceKey)) {
      groups.set(sourceKey, {
        total: 0,
        values: [],
        entityIds: [],
        transfermarktIds: [],
      });
    }

    const group = groups.get(sourceKey);
    group.total += Number(entry.statValue ?? 0);
    group.values.push(entry.answer.value);
    if (entry.answer.entityId) group.entityIds.push(entry.answer.entityId);
    if (transfermarktId) group.transfermarktIds.push(transfermarktId);
  }

  return [...groups.values()]
    .sort((left, right) => right.total - left.total || choosePreferredValue(left.values).localeCompare(choosePreferredValue(right.values)))
    .slice(0, 10)
    .map((group) =>
      buildAggregatedAnswer({
        total: group.total,
        values: group.values,
        entityIds: group.entityIds,
        fbrefIds: [],
        transfermarktIds: group.transfermarktIds,
      })
    );
}

const files = (await fs.readdir(seasonDir)).filter((name) => name.endsWith(".json")).sort();
const questions = [];
const skipped = [];
const stats = {
  transfermarktMatches: 0,
  fbrefFallbacks: 0,
  unresolved: 0,
};

const fbrefPlayersPayload = await readJson(fbrefPlayersPath, null);
const transfermarktPlayersPayload = await readJson(transfermarktPlayersPath, null);
const transfermarktCurrentPlayersPayload = await readJson(transfermarktCurrentPlayersPath, null);
const fbrefPlayersById = new Map(
  (Array.isArray(fbrefPlayersPayload?.entities) ? fbrefPlayersPayload.entities : []).map((entity) => [
    entity.sourceIds?.fbref,
    entity,
  ])
);
const tmPlayers = (() => {
  const merged = new Map();
  for (const entity of Array.isArray(transfermarktPlayersPayload?.entities) ? transfermarktPlayersPayload.entities : []) {
    merged.set(entity.id, entity);
  }
  for (const entity of Array.isArray(transfermarktCurrentPlayersPayload?.entities) ? transfermarktCurrentPlayersPayload.entities : []) {
    if (!merged.has(entity.id)) {
      merged.set(entity.id, entity);
    }
  }
  return [...merged.values()];
})();
const tmPlayersByTransfermarktId = buildTmPlayersByTransfermarktId(tmPlayers);
const tmIndexes = buildTmIndexes(tmPlayers);
const seasonPayloads = [];

for (const fileName of files) {
  const filePath = path.join(seasonDir, fileName);
  const payload = JSON.parse(await fs.readFile(filePath, "utf8"));
  seasonPayloads.push(payload);
}

for (const payload of seasonPayloads) {
  const season = payload.season;
  const seasonStartYear = getSeasonStartYear(season);

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

    const builtEntries = topTenEntries.map((entry) => ({
      statValue: Number(entry.statValue ?? 0),
      answer: buildAnswer(
        {
          season,
          key: config.key,
          playerName: entry.playerName,
          team: entry.team,
          fbrefId: /\/players\/([^/]+)\//.exec(entry.playerHref ?? "")?.[1] ?? null,
        },
        fbrefPlayersById,
        tmIndexes,
        stats
      ),
    }));

    if (seasonStartYear >= MODERN_SEASON_START_YEAR) {
      questions.push({
        id: buildQuestionId(season, config.key),
        shortLabel: config.shortLabel(season),
        prompt: config.prompt(season),
        entityType: "player",
        category: config.category,
        sourceLabel: `FBref ${season} Super Lig leaderboard`,
        sourceUrl: payload.sourceUrl,
        note: `Generated from stored FBref season leaderboard "${leaderboard.title}".`,
        answers: builtEntries.map((entry) => entry.answer),
      });
      continue;
    }
  }
}

const tmSeasonFiles = await fs
  .readdir(tmSeasonDir)
  .then((names) => names.filter((name) => name.endsWith(".json")).sort())
  .catch(() => []);
const tmSeasonPayloads = [];

for (const fileName of tmSeasonFiles) {
  const filePath = path.join(tmSeasonDir, fileName);
  const payload = JSON.parse(await fs.readFile(filePath, "utf8"));
  tmSeasonPayloads.push(payload);
}

for (const bucket of HISTORICAL_RANGE_BUCKETS) {
  for (const config of LEADERBOARD_CONFIG) {
    if (!HISTORICAL_RANGE_KEYS.has(config.key)) continue;

    const bucketPayloads = tmSeasonPayloads.filter((payload) => {
      const startYear = getSeasonStartYear(payload.season);
      return startYear >= bucket.startYear && startYear <= bucket.endYear;
    });

    if (bucketPayloads.length === 0) {
      skipped.push({
        season: `${bucket.startYear}-${bucket.endYear + 1}`,
        key: config.key,
        reason: "missing transfermarkt season payloads",
      });
      continue;
    }

    const entries = [];
    const sourceUrls = new Set();

    for (const payload of bucketPayloads) {
      const leaderboard = findTmLeaderboard(payload, config.key);
      if (!leaderboard) {
        skipped.push({
          season: payload.season,
          key: config.key,
          reason: "missing transfermarkt leaderboard",
        });
        continue;
      }

      sourceUrls.add(leaderboard.sourceUrl);
      entries.push(
        ...leaderboard.entries.map((entry) => ({
          statValue: Number(entry.statValue ?? 0),
          answer: buildHistoricalTmAnswer(entry, tmPlayersByTransfermarktId),
        }))
      );
    }

    const answers = aggregateHistoricalTmEntries(entries);
    if (answers.length !== 10) {
      skipped.push({
        season: `${bucket.startYear}-${bucket.endYear + 1}`,
        key: config.key,
        reason: `expected 10 exact aggregated answers, got ${answers.length}`,
      });
      continue;
    }

    questions.push({
      id: buildRangeQuestionId(bucket.startYear, bucket.endYear, config.key),
      shortLabel: buildHistoricalShortLabel(config.key, bucket.startYear, bucket.endYear),
      prompt: buildHistoricalPrompt(config.key, bucket.startYear, bucket.endYear),
      entityType: "player",
      category: config.category,
      sourceLabel: `Transfermarkt ${bucket.startYear}-${bucket.endYear + 1} cumulative leaderboard`,
      sourceUrl: [...sourceUrls][0] ?? "",
      note: `Aggregated exactly from full Transfermarkt season tables from ${formatLongSeasonLabel(bucket.startYear, bucket.endYear)}.`,
      answers,
    });
  }
}

questions.sort((left, right) => left.id.localeCompare(right.id));

await writeJson(outputPath, questions);

console.log(`[ilk10] fbref season questions=${questions.length}`);
console.log(`[ilk10] fbref season skipped=${skipped.length}`);
console.log(`[ilk10] fbref season tm-matches=${stats.transfermarktMatches}`);
console.log(`[ilk10] fbref season fbref-fallbacks=${stats.fbrefFallbacks}`);
console.log(`[ilk10] fbref season unresolved=${stats.unresolved}`);
console.log(`[ilk10] fbref season out=${outputPath}`);
