#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJson, writeJson } from "../lib/io.mjs";
import { normalizeSearchKey, uniqueSorted } from "../lib/normalize.mjs";

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
    ? playersTransfermarktHistorical
    : chooseBestPlayerSource(playersFbref, playersTransfermarkt, playersBootstrap);
const coaches = chooseBestStaffSource(
  coachesTransfermarktHistorical,
  coachesTransfermarkt.length > 0 ? coachesTransfermarkt : coachesManual
);
const referees = refereesTransfermarkt.length > 0 ? refereesTransfermarkt : refereesManual;
const all = [...players, ...coaches, ...referees];
const suggestions = buildSuggestions(all);

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
        ? "players.transfermarkt.historical.json"
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
  },
  suggestions,
  byEntityType,
});

console.log(`[registry] autocomplete total=${suggestions.length}`);
console.log(`[registry] autocomplete players=${byEntityType.player.length}`);
console.log(`[registry] autocomplete coaches=${byEntityType.coach.length}`);
console.log(`[registry] autocomplete referees=${byEntityType.referee.length}`);
console.log(`[registry] autocomplete out=${outputPath}`);
