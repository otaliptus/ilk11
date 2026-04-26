#!/usr/bin/env node

import {
  countRowsByYear,
  EXPECTED_HEADER,
  EXPECTED_HEADER_WITH_DIFFICULTY,
  EXPECTED_HEADER_WITH_DIFFICULTY_AND_LINEUP_NUMBERS_AND_CAPTAINS_AND_STATS_AND_SOURCE,
  EXPECTED_HEADER_WITH_DIFFICULTY_AND_LINEUP_NUMBERS,
  EXPECTED_HEADER_WITH_DIFFICULTY_AND_LINEUP_NUMBERS_AND_STATS_AND_SOURCE,
  EXPECTED_HEADER_WITH_LINEUP_NUMBERS,
  readGamesCsv,
  rowKey,
  SUPPORTED_HEADERS,
} from "./lib/games-csv.mjs";

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
      "  node scripts/validate-games.mjs [--file <path>] [--allow-mixed-case] [--allow-non-pairs]",
      "",
      "Examples:",
      "  node scripts/validate-games.mjs",
      "  node scripts/validate-games.mjs --file data/seasons/tr1-2025.csv",
    ].join("\n")
  );
}

if (hasFlag("--help")) {
  printUsage();
  process.exit(0);
}

const filePath = getOption("--file", "data/games.csv");
const allowMixedCase = hasFlag("--allow-mixed-case");
const allowNonPairs = hasFlag("--allow-non-pairs");

const {
  header,
  rows,
  errors: parseErrors,
  hasDifficulty,
  hasLineupCaptains,
  hasLineupGoals,
  hasLineupAssists,
  hasLineupCards,
  hasLineupYellowCards,
  hasLineupRedCards,
  hasLineupSubstitutions,
  hasSourceMatchId,
} = await readGamesCsv(filePath);

const errors = [...parseErrors];
const warnings = [];

if (!SUPPORTED_HEADERS.has(header)) {
  warnings.push(
    `${filePath}: header is "${header}" (expected a supported games CSV header, such as "${EXPECTED_HEADER}", "${EXPECTED_HEADER_WITH_DIFFICULTY}", "${EXPECTED_HEADER_WITH_LINEUP_NUMBERS}", "${EXPECTED_HEADER_WITH_DIFFICULTY_AND_LINEUP_NUMBERS}", "${EXPECTED_HEADER_WITH_DIFFICULTY_AND_LINEUP_NUMBERS_AND_CAPTAINS_AND_STATS_AND_SOURCE}", or "${EXPECTED_HEADER_WITH_DIFFICULTY_AND_LINEUP_NUMBERS_AND_STATS_AND_SOURCE}")`
  );
}

const seenKeys = new Map();
const gameCounts = new Map();

for (const row of rows) {
  const where = `${filePath}:${row._line}`;
  const key = rowKey(row);

  if (!row.game) errors.push(`${where} empty game field`);
  if (!row.team) errors.push(`${where} empty team field`);
  if (hasDifficulty) {
    if (!row.difficulty) {
      errors.push(`${where} empty difficulty field`);
    } else if (row.difficulty !== "easy" && row.difficulty !== "hard") {
      errors.push(`${where} invalid difficulty "${row.difficulty}"`);
    }
  }
  if (!row.formation) errors.push(`${where} empty formation field`);
  if (!/^\d+(?:-\d+)+$/.test(row.formation)) {
    errors.push(`${where} invalid formation "${row.formation}"`);
  }

  if (row.lineup.length !== 11) {
    errors.push(`${where} lineup has ${row.lineup.length} players (expected 11)`);
  }
  if (Array.isArray(row.lineupNumbers) && row.lineupNumbers.length > 0) {
    if (row.lineupNumbers.length !== 11) {
      errors.push(`${where} lineup_numbers has ${row.lineupNumbers.length} entries (expected 11)`);
    }
    for (const number of row.lineupNumbers) {
      if (number === null) continue;
      if (!Number.isInteger(number) || number <= 0) {
        errors.push(`${where} lineup_numbers contains invalid value "${number}"`);
      }
    }
  }
  if (hasLineupCaptains && Array.isArray(row.lineupCaptains) && row.lineupCaptains.length > 0) {
    if (row.lineupCaptains.length !== 11) {
      errors.push(`${where} lineup_captains has ${row.lineupCaptains.length} entries (expected 11)`);
    }
    for (const captainFlag of row.lineupCaptains) {
      if (!Number.isInteger(captainFlag) || (captainFlag !== 0 && captainFlag !== 1)) {
        errors.push(`${where} lineup_captains contains invalid value "${captainFlag}"`);
      }
    }
  }
  if (hasLineupGoals && Array.isArray(row.lineupGoals) && row.lineupGoals.length > 0) {
    if (row.lineupGoals.length !== 11) {
      errors.push(`${where} lineup_goals has ${row.lineupGoals.length} entries (expected 11)`);
    }
    for (const count of row.lineupGoals) {
      if (!Number.isInteger(count) || count < 0) {
        errors.push(`${where} lineup_goals contains invalid value "${count}"`);
      }
    }
  }
  if (hasLineupAssists && Array.isArray(row.lineupAssists) && row.lineupAssists.length > 0) {
    if (row.lineupAssists.length !== 11) {
      errors.push(`${where} lineup_assists has ${row.lineupAssists.length} entries (expected 11)`);
    }
    for (const count of row.lineupAssists) {
      if (!Number.isInteger(count) || count < 0) {
        errors.push(`${where} lineup_assists contains invalid value "${count}"`);
      }
    }
  }
  if (hasLineupCards && Array.isArray(row.lineupCards) && row.lineupCards.length > 0) {
    if (row.lineupCards.length !== 11) {
      errors.push(`${where} lineup_cards has ${row.lineupCards.length} entries (expected 11)`);
    }
    for (const count of row.lineupCards) {
      if (!Number.isInteger(count) || count < 0) {
        errors.push(`${where} lineup_cards contains invalid value "${count}"`);
      }
    }
  }
  if (hasLineupYellowCards && Array.isArray(row.lineupYellowCards) && row.lineupYellowCards.length > 0) {
    if (row.lineupYellowCards.length !== 11) {
      errors.push(`${where} lineup_yellow_cards has ${row.lineupYellowCards.length} entries (expected 11)`);
    }
    for (const count of row.lineupYellowCards) {
      if (!Number.isInteger(count) || count < 0) {
        errors.push(`${where} lineup_yellow_cards contains invalid value "${count}"`);
      }
    }
  }
  if (hasLineupRedCards && Array.isArray(row.lineupRedCards) && row.lineupRedCards.length > 0) {
    if (row.lineupRedCards.length !== 11) {
      errors.push(`${where} lineup_red_cards has ${row.lineupRedCards.length} entries (expected 11)`);
    }
    for (const count of row.lineupRedCards) {
      if (!Number.isInteger(count) || count < 0) {
        errors.push(`${where} lineup_red_cards contains invalid value "${count}"`);
      }
    }
  }
  if (hasLineupSubstitutions && Array.isArray(row.lineupSubstitutions) && row.lineupSubstitutions.length > 0) {
    if (row.lineupSubstitutions.length !== 11) {
      errors.push(`${where} lineup_substitutions has ${row.lineupSubstitutions.length} entries (expected 11)`);
    }
    for (const count of row.lineupSubstitutions) {
      if (!Number.isInteger(count) || count < 0) {
        errors.push(`${where} lineup_substitutions contains invalid value "${count}"`);
      }
    }
  }
  if (hasSourceMatchId) {
    const matchId = String(row.sourceMatchId ?? "").trim();
    if (matchId !== "" && !/^\d+$/.test(matchId)) {
      errors.push(`${where} source_match_id "${row.sourceMatchId}" is not numeric`);
    }
  }

  for (const player of row.lineup) {
    if (!allowMixedCase && /[a-z]/.test(player)) {
      errors.push(`${where} player "${player}" is not uppercase`);
    }
  }

  if (seenKeys.has(key)) {
    errors.push(`${where} duplicate game+team (first seen at line ${seenKeys.get(key)})`);
  } else {
    seenKeys.set(key, row._line);
  }

  gameCounts.set(row.game, (gameCounts.get(row.game) ?? 0) + 1);
}

if (!allowNonPairs) {
  for (const [game, count] of gameCounts) {
    if (count !== 2) {
      warnings.push(`game "${game}" has ${count} rows (expected 2)`);
    }
  }
}

const yearCounts = countRowsByYear(rows);

console.log(`[validate-games] file=${filePath}`);
console.log(`[validate-games] rows=${rows.length} unique_game_team=${seenKeys.size} unique_games=${gameCounts.size}`);

const yearSummary = [...yearCounts.entries()]
  .sort((a, b) => a[0].localeCompare(b[0]))
  .map(([year, count]) => `${year}:${count}`)
  .join(" ");
console.log(`[validate-games] years=${yearSummary || "n/a"}`);

if (warnings.length > 0) {
  console.log(`[validate-games] warnings=${warnings.length}`);
  for (const warning of warnings) {
    console.log(`  - ${warning}`);
  }
}

if (errors.length > 0) {
  console.error(`[validate-games] errors=${errors.length}`);
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
  process.exit(1);
}

console.log("[validate-games] OK");
