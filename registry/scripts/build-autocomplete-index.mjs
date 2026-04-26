#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import { ensureDir, readJson, writeJson } from "../lib/io.mjs";
import { normalizeAsciiText, normalizeSearchKey, uniqueSorted } from "../lib/normalize.mjs";

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

const outputPath = path.resolve(projectDir, getOption("--out", "output/autocomplete.json"));
const runtimeOutputPath = path.resolve(projectDir, getOption("--runtime-out", "output/autocomplete-runtime.json"));
const rootDir = path.resolve(projectDir, "..");

async function loadEntities(relativePath) {
  const payload = await readJson(path.resolve(projectDir, relativePath), null);
  return Array.isArray(payload?.entities) ? payload.entities : [];
}

function chooseBestPlayerSource(fbrefEntities, transfermarktEntities, bootstrapEntities) {
  if (fbrefEntities.length > 0) return fbrefEntities;
  if (transfermarktEntities.length > 0) return transfermarktEntities;
  return bootstrapEntities;
}

function chooseBestStaffSource(primaryEntities, fallbackEntities) {
  if (primaryEntities.length > 0) return primaryEntities;
  return fallbackEntities;
}

function getNormalizedEntityName(entityLike) {
  return normalizeSearchKey(entityLike.canonicalName ?? entityLike.displayName ?? "");
}

function getEntityBirthYear(entityLike) {
  return Number.isInteger(entityLike.birthYear) ? entityLike.birthYear : null;
}

function getEntityAliasKeys(entityLike) {
  return uniqueSorted(
    [entityLike.displayName, entityLike.canonicalName, ...(entityLike.aliases ?? [])]
      .map((value) => normalizeSearchKey(value))
      .filter(Boolean)
  );
}

function normalizeTeamKey(team) {
  return normalizeSearchKey(normalizeAsciiText(team));
}

function toSeasonStartYear(value) {
  if (Number.isInteger(value)) return value;
  const text = String(value ?? "");
  const match = text.match(/^(\d{4})(?:-(\d{2}|\d{4}))?$/);
  return match ? Number(match[1]) : null;
}

function getEntitySeasonYears(entityLike) {
  const seasons = Array.isArray(entityLike.seasons) ? entityLike.seasons : [];
  const years = seasons.map((season) => toSeasonStartYear(season)).filter((year) => Number.isInteger(year));
  if (years.length > 0) {
    return uniqueSorted(years.map(String)).map(Number);
  }

  const rangeYears = [];
  if (Number.isInteger(entityLike.firstSeason)) rangeYears.push(entityLike.firstSeason);
  if (Number.isInteger(entityLike.lastSeason)) rangeYears.push(entityLike.lastSeason);
  return uniqueSorted(rangeYears.map(String)).map(Number);
}

function getEntityTeamKeys(entityLike) {
  return uniqueSorted(
    (Array.isArray(entityLike.teams) ? entityLike.teams : [])
      .map((teamEntry) => normalizeTeamKey(teamEntry?.team))
      .filter(Boolean)
  );
}

function hasIntersection(leftValues, rightValues) {
  if (leftValues.length === 0 || rightValues.length === 0) return false;
  const rightSet = new Set(rightValues);
  return leftValues.some((value) => rightSet.has(value));
}

function canLinkPlayerEntity(entity, canonical) {
  const transfermarktId = entity.sourceIds?.transfermarkt ? String(entity.sourceIds.transfermarkt) : null;
  const canonicalTransfermarktId = canonical.sourceIds?.transfermarkt
    ? String(canonical.sourceIds.transfermarkt)
    : null;
  if (transfermarktId && canonicalTransfermarktId && transfermarktId === canonicalTransfermarktId) {
    return true;
  }

  const fbrefId = entity.sourceIds?.fbref ? String(entity.sourceIds.fbref) : null;
  const canonicalFbrefId = canonical.sourceIds?.fbref ? String(canonical.sourceIds.fbref) : null;
  if (fbrefId && canonicalFbrefId && fbrefId === canonicalFbrefId) {
    return true;
  }

  const normalizedName = getNormalizedEntityName(entity);
  if (!normalizedName || normalizedName !== getNormalizedEntityName(canonical)) {
    return false;
  }

  const birthYear = getEntityBirthYear(entity);
  const canonicalBirthYear = getEntityBirthYear(canonical);
  if (birthYear !== null && canonicalBirthYear !== null) {
    return birthYear === canonicalBirthYear;
  }

  return (
    hasIntersection(getEntitySeasonYears(entity), canonical._seasonYears ?? []) &&
    hasIntersection(getEntityTeamKeys(entity), canonical._teamKeys ?? [])
  );
}

function mergeEntityTeams(leftTeams = [], rightTeams = []) {
  const byKey = new Map();
  for (const teamEntry of [...leftTeams, ...rightTeams]) {
    if (!teamEntry?.team) continue;
    const key = normalizeTeamKey(teamEntry.team);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...teamEntry });
      continue;
    }

    const merged = { ...existing };
    for (const [field, value] of Object.entries(teamEntry)) {
      if (field === "team") continue;
      if (typeof value === "number") {
        merged[field] = Math.max(typeof merged[field] === "number" ? merged[field] : 0, value);
      } else if ((merged[field] === undefined || merged[field] === null) && value !== undefined) {
        merged[field] = value;
      }
    }
    if (String(teamEntry.team).length > String(merged.team).length) {
      merged.team = teamEntry.team;
    }
    byKey.set(key, merged);
  }

  return [...byKey.values()].sort((left, right) => String(left.team).localeCompare(String(right.team)));
}

function mergePrimitiveLists(...groups) {
  return uniqueSorted(groups.flat().filter(Boolean).map((value) => String(value)));
}

function mergePlayerSources(...groups) {
  const canonicalPlayers = [];
  const canonicalByTransfermarktId = new Map();
  const canonicalByFbrefId = new Map();
  const canonicalByName = new Map();
  const richAliasKeys = new Set();

  function registerCanonical(canonical) {
    const transfermarktId = canonical.sourceIds?.transfermarkt ? String(canonical.sourceIds.transfermarkt) : null;
    if (transfermarktId) {
      canonicalByTransfermarktId.set(transfermarktId, canonical);
    }

    const fbrefId = canonical.sourceIds?.fbref ? String(canonical.sourceIds.fbref) : null;
    if (fbrefId) {
      canonicalByFbrefId.set(fbrefId, canonical);
    }

    const normalizedName = getNormalizedEntityName(canonical);
    if (normalizedName) {
      const entries = canonicalByName.get(normalizedName) ?? [];
      if (!entries.includes(canonical)) {
        entries.push(canonical);
        canonicalByName.set(normalizedName, entries);
      }
    }
  }

  for (const entity of groups.flat()) {
    const aliasKeys = getEntityAliasKeys(entity);
    const hasRichSourceIds = Object.keys(entity.sourceIds ?? {}).length > 0;
    const candidateCanonicals = [];
    const transfermarktId = entity.sourceIds?.transfermarkt ? String(entity.sourceIds.transfermarkt) : null;
    if (transfermarktId && canonicalByTransfermarktId.has(transfermarktId)) {
      candidateCanonicals.push(canonicalByTransfermarktId.get(transfermarktId));
    }

    const fbrefId = entity.sourceIds?.fbref ? String(entity.sourceIds.fbref) : null;
    if (fbrefId && canonicalByFbrefId.has(fbrefId)) {
      candidateCanonicals.push(canonicalByFbrefId.get(fbrefId));
    }

    const normalizedName = getNormalizedEntityName(entity);
    for (const canonical of canonicalByName.get(normalizedName) ?? []) {
      if (!candidateCanonicals.includes(canonical)) {
        candidateCanonicals.push(canonical);
      }
    }

    const matchedCanonical = candidateCanonicals.find((canonical) => canLinkPlayerEntity(entity, canonical)) ?? null;

    if (!matchedCanonical) {
      if (
        !hasRichSourceIds &&
        aliasKeys.some((key) => richAliasKeys.has(key))
      ) {
        continue;
      }

      const canonical = {
        ...entity,
        aliases: uniqueSorted([entity.displayName, entity.canonicalName, ...(entity.aliases ?? [])]),
        sourceIds: { ...(entity.sourceIds ?? {}) },
        sourceUrls: uniqueSorted(entity.sourceUrls ?? []),
        birthYear: getEntityBirthYear(entity),
        birthYears: mergePrimitiveLists(entity.birthYears ?? [], getEntityBirthYear(entity) ?? []),
        teams: mergeEntityTeams(entity.teams ?? []),
        seasons: mergePrimitiveLists(entity.seasons ?? []),
        _aliasKeys: aliasKeys,
        _teamKeys: getEntityTeamKeys(entity),
        _seasonYears: getEntitySeasonYears(entity),
      };
      canonicalPlayers.push(canonical);
      registerCanonical(canonical);
      if (hasRichSourceIds) {
        for (const key of aliasKeys) {
          richAliasKeys.add(key);
        }
      }
      continue;
    }

    const canonical = matchedCanonical;
    canonical.aliases = uniqueSorted([
      canonical.displayName,
      canonical.canonicalName,
      ...(canonical.aliases ?? []),
      entity.displayName,
      entity.canonicalName,
      ...(entity.aliases ?? []),
    ]);
    canonical.sourceIds = { ...(canonical.sourceIds ?? {}), ...(entity.sourceIds ?? {}) };
    canonical.sourceUrls = uniqueSorted([...(canonical.sourceUrls ?? []), ...(entity.sourceUrls ?? [])]);
    canonical.provisional = Boolean(canonical.provisional && entity.provisional);
    canonical.teams = mergeEntityTeams(canonical.teams ?? [], entity.teams ?? []);
    canonical.seasons = mergePrimitiveLists(canonical.seasons ?? [], entity.seasons ?? []);

    const canonicalBirthYears = mergePrimitiveLists(
      canonical.birthYears ?? [],
      entity.birthYears ?? [],
      getEntityBirthYear(canonical) ?? [],
      getEntityBirthYear(entity) ?? []
    );
    canonical.birthYears = canonicalBirthYears;
    if (canonical.birthYear === null) {
      canonical.birthYear = getEntityBirthYear(entity);
    }

    canonical._aliasKeys = uniqueSorted([...(canonical._aliasKeys ?? []), ...aliasKeys]);
    canonical._teamKeys = uniqueSorted([...(canonical._teamKeys ?? []), ...getEntityTeamKeys(entity)]);
    canonical._seasonYears = uniqueSorted(
      [...(canonical._seasonYears ?? []).map(String), ...getEntitySeasonYears(entity).map(String)]
    ).map(Number);
    registerCanonical(canonical);
    if (Object.keys(canonical.sourceIds ?? {}).length > 0) {
      for (const key of canonical._aliasKeys) {
        richAliasKeys.add(key);
      }
    }
  }

  return canonicalPlayers.map((entity) => {
    const { _aliasKeys, _teamKeys, _seasonYears, ...publicEntity } = entity;
    return publicEntity;
  });
}

function buildSuggestions(entities) {
  const suggestionMap = new Map();
  const duplicateCounts = new Map();

  for (const entity of entities) {
    const key = `${entity.entityType}:${entity.displayName}`;
    duplicateCounts.set(key, (duplicateCounts.get(key) ?? 0) + 1);
  }

  for (const entity of entities) {
    const aliases = uniqueSorted([entity.displayName, entity.canonicalName, ...(entity.aliases ?? [])]);
    const duplicateKey = `${entity.entityType}:${entity.displayName}`;
    const needsBirthYear = (duplicateCounts.get(duplicateKey) ?? 0) > 1 && Number.isInteger(entity.birthYear);

    const suggestion = {
      id: entity.id,
      entityType: entity.entityType,
      label: entity.displayName,
      labelWithMeta: needsBirthYear ? `${entity.displayName} (${entity.birthYear})` : entity.displayName,
      searchKey: entity.searchKey ?? normalizeSearchKey(entity.displayName),
      aliases,
      sourceIds: entity.sourceIds ?? {},
      provisional: Boolean(entity.provisional),
    };

    suggestionMap.set(`${entity.entityType}:${entity.id}`, suggestion);
  }

  return [...suggestionMap.values()].sort((left, right) => left.labelWithMeta.localeCompare(right.labelWithMeta));
}

async function loadIlk10AnswerReferenceScores() {
  const payload = await readJson(path.resolve(rootDir, "data/ilk10/questions.json"), []);
  const questions = Array.isArray(payload) ? payload : [];
  const entityIds = new Set();
  const sourceIdsByProvider = new Map();
  const answerLabels = new Set();

  for (const question of questions) {
    for (const answer of question.answers ?? []) {
      if (typeof answer.entityId === "string" && answer.entityId) {
        entityIds.add(answer.entityId);
      }

      for (const [provider, sourceId] of Object.entries(answer.sourceIds ?? {})) {
        if (!sourceId) continue;
        const key = `${provider}:${sourceId}`;
        sourceIdsByProvider.set(key, (sourceIdsByProvider.get(key) ?? 0) + 1);
      }

      for (const value of [answer.value, ...(answer.aliases ?? [])]) {
        const labelKey = normalizeSearchKey(value);
        if (labelKey) answerLabels.add(labelKey);
      }
    }
  }

  return { entityIds, sourceIdsByProvider, answerLabels };
}

function scoreSuggestionForDedup(suggestion, answerReferenceScores) {
  let score = 0;

  if (answerReferenceScores.entityIds.has(suggestion.id)) {
    score += 10_000;
  }

  for (const [provider, sourceId] of Object.entries(suggestion.sourceIds ?? {})) {
    score += (answerReferenceScores.sourceIdsByProvider.get(`${provider}:${sourceId}`) ?? 0) * 1_000;
  }

  if (answerReferenceScores.answerLabels.has(normalizeSearchKey(suggestion.label))) {
    score += 100;
  }

  if (suggestion.sourceIds?.transfermarkt) score += 30;
  if (suggestion.sourceIds?.fbref) score += 20;
  if (!suggestion.provisional) score += 10;
  if (!String(suggestion.id).includes(":fbref-")) score += 3;
  if (!String(suggestion.id).includes(":tm-historical-")) score += 2;
  if (suggestion.labelWithMeta === suggestion.label) score += 1;

  const yearMatch = String(suggestion.labelWithMeta ?? "").match(/\((\d{4})\)$/);
  const birthYear = yearMatch ? Number(yearMatch[1]) : null;

  return { score, birthYear };
}

function dedupePlayerSuggestionsByLabel(suggestions, answerReferenceScores) {
  const selected = new Map();
  let removed = 0;

  for (const suggestion of suggestions) {
    if (suggestion.entityType !== "player") {
      selected.set(`${suggestion.entityType}:${suggestion.id}`, suggestion);
      continue;
    }

    const key = `player:${normalizeSearchKey(suggestion.label)}`;
    const existing = selected.get(key);
    if (!existing) {
      selected.set(key, suggestion);
      continue;
    }

    const left = scoreSuggestionForDedup(existing, answerReferenceScores);
    const right = scoreSuggestionForDedup(suggestion, answerReferenceScores);
    const shouldReplace =
      right.score > left.score ||
      (right.score === left.score &&
        (right.birthYear ?? Number.POSITIVE_INFINITY) < (left.birthYear ?? Number.POSITIVE_INFINITY)) ||
      (right.score === left.score &&
        right.birthYear === left.birthYear &&
        suggestion.id.localeCompare(existing.id) < 0);

    if (shouldReplace) {
      selected.set(key, suggestion);
    }
    removed += 1;
  }

  return {
    suggestions: [...selected.values()]
      .map((suggestion) =>
        suggestion.entityType === "player"
          ? { ...suggestion, labelWithMeta: suggestion.label }
          : suggestion
      )
      .sort((left, right) => left.labelWithMeta.localeCompare(right.labelWithMeta)),
    removed,
  };
}

const playersBootstrap = await loadEntities("output/players.bootstrap.json");
const playersFbref = await loadEntities("output/players.fbref.json");
const playersTransfermarkt = await loadEntities("output/players.transfermarkt.json");
const playersTransfermarktHistorical = await loadEntities("output/players.transfermarkt.historical.json");
const coachesTransfermarkt = await loadEntities("output/coaches.transfermarkt.json");
const coachesTransfermarktHistorical = await loadEntities("output/coaches.transfermarkt.historical.json");
const refereesTransfermarkt = await loadEntities("output/referees.transfermarkt.json");
const coachesManual = await loadEntities("output/coaches.manual.json");
const refereesManual = await loadEntities("output/referees.manual.json");

const players =
  playersTransfermarktHistorical.length > 0
    ? mergePlayerSources(
        playersTransfermarktHistorical,
        playersTransfermarkt,
        playersFbref,
        playersBootstrap
      )
    : chooseBestPlayerSource(playersFbref, playersTransfermarkt, playersBootstrap);
const coaches = chooseBestStaffSource(
  coachesTransfermarktHistorical,
  coachesTransfermarkt.length > 0 ? coachesTransfermarkt : coachesManual
);
const referees = refereesTransfermarkt.length > 0 ? refereesTransfermarkt : refereesManual;
const all = [...players, ...coaches, ...referees];
const rawSuggestions = buildSuggestions(all);
const answerReferenceScores = await loadIlk10AnswerReferenceScores();
const { suggestions, removed: duplicatePlayerSuggestionsRemoved } = dedupePlayerSuggestionsByLabel(
  rawSuggestions,
  answerReferenceScores
);

const byEntityType = {
  player: suggestions.filter((entry) => entry.entityType === "player"),
  coach: suggestions.filter((entry) => entry.entityType === "coach"),
  referee: suggestions.filter((entry) => entry.entityType === "referee"),
};

await writeJson(outputPath, {
  metadata: {
    project: "ilk10-registry",
    builder: "build-autocomplete-index",
    generatedAt: new Date().toISOString(),
    playerSource:
      playersTransfermarktHistorical.length > 0
        ? "merged(players.transfermarkt.historical.json, players.transfermarkt.json, players.fbref.json, players.bootstrap.json)"
        : playersFbref.length > 0
        ? "players.fbref.json"
        : playersTransfermarkt.length > 0
          ? "players.transfermarkt.json"
          : "players.bootstrap.json",
    coachSource:
      coachesTransfermarktHistorical.length > 0
        ? "coaches.transfermarkt.historical.json"
        : coachesTransfermarkt.length > 0
          ? "coaches.transfermarkt.json"
          : "coaches.manual.json",
  },
  summary: {
    totalSuggestions: suggestions.length,
    playerSuggestions: byEntityType.player.length,
    coachSuggestions: byEntityType.coach.length,
    refereeSuggestions: byEntityType.referee.length,
    duplicatePlayerSuggestionsRemoved,
  },
  suggestions,
  byEntityType,
});

function stripRuntimeSuggestion(entry) {
  const { sourceIds, ...runtimeEntry } = entry;
  return runtimeEntry;
}

await ensureDir(path.dirname(runtimeOutputPath));
await fs.writeFile(
  runtimeOutputPath,
  `${JSON.stringify({
    byEntityType: Object.fromEntries(
      Object.entries(byEntityType).map(([entityType, entries]) => [
        entityType,
        entries.map(stripRuntimeSuggestion),
      ])
    ),
  })}\n`,
  "utf8"
);

console.log(`[registry] autocomplete total=${suggestions.length}`);
console.log(`[registry] autocomplete players=${byEntityType.player.length}`);
console.log(`[registry] autocomplete coaches=${byEntityType.coach.length}`);
console.log(`[registry] autocomplete referees=${byEntityType.referee.length}`);
console.log(`[registry] autocomplete duplicate_player_suggestions_removed=${duplicatePlayerSuggestionsRemoved}`);
console.log(`[registry] autocomplete out=${outputPath}`);
console.log(`[registry] autocomplete runtime_out=${runtimeOutputPath}`);
