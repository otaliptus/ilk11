import fs from "node:fs/promises";

import { readGamesCsv } from "./games-csv.mjs";

export const GAME_TIME_ZONE = "Europe/Istanbul";
export const DIFFICULTIES = ["easy", "hard"];

const EASY_MIN_YEAR = 2010;
const EASY_TEAMS = new Set(["Besiktas", "Trabzonspor", "Fenerbahce", "Galatasaray"]);
const MS_PER_DAY = 86_400_000;
const DEDUP_WINDOW = 30;
const DEDUP_EPOCH = "2026-03-18";

function extractGameYear(game) {
  const yearMatch = String(game ?? "").match(/(\d{4})\s*$/);
  if (!yearMatch) return null;
  const year = Number(yearMatch[1]);
  return Number.isInteger(year) ? year : null;
}

const MONTH_NAMES = {
  January: 1,
  February: 2,
  March: 3,
  April: 4,
  May: 5,
  June: 6,
  July: 7,
  August: 8,
  September: 9,
  October: 10,
  November: 11,
  December: 12,
};

function getSeasonFromGame(game) {
  const year = extractGameYear(game);
  if (year === null) return "unknown";

  const monthMatch = String(game).match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/
  );
  if (!monthMatch) return String(year);

  const month = MONTH_NAMES[monthMatch[1]];
  if (month >= 8) {
    return `${year}-${String(year + 1).slice(-2)}`;
  }
  return `${year - 1}-${String(year).slice(-2)}`;
}

function normalizeCounts(values, expectedLength) {
  return Array.from({ length: expectedLength }, (_, index) => {
    const value = Number(values?.[index] ?? 0);
    return Number.isInteger(value) && value >= 0 ? value : 0;
  });
}

function normalizeNumbers(values, expectedLength) {
  return Array.from({ length: expectedLength }, (_, index) => {
    const value = Number(values?.[index]);
    return Number.isInteger(value) && value > 0 ? value : null;
  });
}

function normalizeBinaryFlags(values, expectedLength) {
  return Array.from({ length: expectedLength }, (_, index) => {
    const value = Number(values?.[index] ?? 0);
    return value > 0 ? 1 : 0;
  });
}

export function toRuntimeRow(row) {
  const expectedLength = Array.isArray(row.lineup) ? row.lineup.length : 0;
  const lineupCards = normalizeCounts(row.lineupCards, expectedLength);
  const parsedLineupYellowCards = normalizeCounts(row.lineupYellowCards, expectedLength);
  const parsedLineupRedCards = normalizeCounts(row.lineupRedCards, expectedLength);
  const hasColoredCardColumns = Array.isArray(row.lineupYellowCards) || Array.isArray(row.lineupRedCards);
  const coloredCardTotal =
    parsedLineupYellowCards.reduce((sum, count) => sum + count, 0) +
    parsedLineupRedCards.reduce((sum, count) => sum + count, 0);
  const legacyCardTotal = lineupCards.reduce((sum, count) => sum + count, 0);
  const hasColoredCards = hasColoredCardColumns && (coloredCardTotal > 0 || legacyCardTotal === 0);

  return {
    game: row.game,
    team: row.team,
    formation: row.formation,
    lineup: row.lineup,
    lineupNumbers: normalizeNumbers(row.lineupNumbers, expectedLength),
    lineupCaptains: normalizeBinaryFlags(row.lineupCaptains, expectedLength),
    lineupGoals: normalizeCounts(row.lineupGoals, expectedLength),
    lineupAssists: normalizeCounts(row.lineupAssists, expectedLength),
    hasColoredCards,
    lineupCards,
    lineupYellowCards: hasColoredCards ? parsedLineupYellowCards : [],
    lineupRedCards: hasColoredCards ? parsedLineupRedCards : [],
    lineupSubstitutions: normalizeCounts(row.lineupSubstitutions, expectedLength),
    sourceMatchId: String(row.sourceMatchId ?? "").trim(),
  };
}

export function toCompactRuntimeRow(row) {
  return [
    row.game,
    row.team,
    row.formation,
    row.lineup,
    row.lineupNumbers,
    row.lineupCaptains,
    row.lineupGoals,
    row.lineupAssists,
    row.hasColoredCards,
    row.lineupCards,
    row.lineupYellowCards,
    row.lineupRedCards,
    row.lineupSubstitutions,
    row.sourceMatchId,
  ];
}

export function fromCompactRuntimeRow(row) {
  return {
    game: row[0],
    team: row[1],
    formation: row[2],
    lineup: row[3],
    lineupNumbers: row[4],
    lineupCaptains: row[5],
    lineupGoals: row[6],
    lineupAssists: row[7],
    hasColoredCards: row[8],
    lineupCards: row[9],
    lineupYellowCards: row[10],
    lineupRedCards: row[11],
    lineupSubstitutions: row[12],
    sourceMatchId: row[13],
  };
}

export function decodeRuntimePool(payload, expectedDifficulty) {
  if (payload.d && payload.d !== expectedDifficulty) {
    throw new Error(`${expectedDifficulty}.json has difficulty "${payload.d}"`);
  }

  if (Array.isArray(payload.r)) {
    const rows = payload.r.map(fromCompactRuntimeRow).filter((row) => Array.isArray(row.lineup) && row.lineup.length === 11);
    if (rows.length > 0) return rows;
  }

  if (Array.isArray(payload.rows)) {
    const rows = payload.rows.filter((row) => Array.isArray(row.lineup) && row.lineup.length === 11);
    if (rows.length > 0) return rows;
  }

  throw new Error(`${expectedDifficulty}.json has no valid rows`);
}

export async function readRuntimePool(filePath, expectedDifficulty) {
  const payload = JSON.parse(await fs.readFile(filePath, "utf8"));
  return decodeRuntimePool(payload, expectedDifficulty);
}

export async function readCsvRuntimeRows(filePath, difficulty) {
  const parsed = await readGamesCsv(filePath);
  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors.join("\n"));
  }

  return parsed.rows
    .filter((row) => row.lineup.length === 11)
    .filter((row) => !row.difficulty || row.difficulty === difficulty)
    .filter((row) => {
      if (difficulty !== "easy") return true;
      const year = extractGameYear(row.game);
      return year !== null && year >= EASY_MIN_YEAR && EASY_TEAMS.has(row.team);
    })
    .map(toRuntimeRow);
}

function fnv1a32(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function dateKeyToDayIndex(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

export function dayIndexToDateKey(dayIndex) {
  const d = new Date(dayIndex * MS_PER_DAY);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function getTurkeyDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: GAME_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function getTurkeyDayIndex(date = new Date()) {
  return dateKeyToDayIndex(getTurkeyDateKey(date));
}

function getTeamSeasonCombo(row) {
  return `${row.team}|${getSeasonFromGame(row.game)}`;
}

function pickWithDedup(pool, rng, recentCombos) {
  let firstCandidate = null;
  for (let attempt = 0; attempt < pool.length; attempt++) {
    const index = Math.floor(rng() * pool.length);
    const candidate = pool[index];
    if (!firstCandidate) firstCandidate = candidate;
    if (!recentCombos.has(getTeamSeasonCombo(candidate))) {
      return candidate;
    }
  }
  return firstCandidate;
}

function pickDailyPairLegacy(pools, dayIndex) {
  const dateKey = dayIndexToDateKey(dayIndex);
  const seed = fnv1a32(`${GAME_TIME_ZONE}:${dateKey}:pair`);
  const rng = mulberry32(seed);
  return {
    easyRow: pools.easy[Math.floor(rng() * pools.easy.length)],
    hardRow: pools.hard[Math.floor(rng() * pools.hard.length)],
  };
}

export function pickDailyPair(pools, date = new Date()) {
  if (pools.easy.length === 0 || pools.hard.length === 0) {
    throw new Error("Need at least one easy and one hard game row");
  }

  const dayIndex = date instanceof Date ? getTurkeyDayIndex(date) : dateKeyToDayIndex(date);
  const epochDayIndex = dateKeyToDayIndex(DEDUP_EPOCH);

  if (dayIndex < epochDayIndex) {
    const { easyRow, hardRow } = pickDailyPairLegacy(pools, dayIndex);
    return { dayIndex, easyRow, hardRow };
  }

  const easyHistory = new Map();
  const hardHistory = new Map();

  for (let di = epochDayIndex - DEDUP_WINDOW; di < epochDayIndex; di++) {
    const { easyRow, hardRow } = pickDailyPairLegacy(pools, di);
    easyHistory.set(di, getTeamSeasonCombo(easyRow));
    hardHistory.set(di, getTeamSeasonCombo(hardRow));
  }

  let easyRow = pools.easy[0];
  let hardRow = pools.hard[0];

  for (let di = epochDayIndex; di <= dayIndex; di++) {
    const dk = dayIndexToDateKey(di);

    const recentEasy = new Set();
    for (let j = 1; j <= DEDUP_WINDOW; j++) {
      const combo = easyHistory.get(di - j);
      if (combo) recentEasy.add(combo);
    }
    easyRow = pickWithDedup(pools.easy, mulberry32(fnv1a32(`${GAME_TIME_ZONE}:${dk}:v2:easy`)), recentEasy);
    easyHistory.set(di, getTeamSeasonCombo(easyRow));

    const recentHard = new Set();
    for (let j = 1; j <= DEDUP_WINDOW; j++) {
      const combo = hardHistory.get(di - j);
      if (combo) recentHard.add(combo);
    }
    hardRow = pickWithDedup(pools.hard, mulberry32(fnv1a32(`${GAME_TIME_ZONE}:${dk}:v2:hard`)), recentHard);
    hardHistory.set(di, getTeamSeasonCombo(hardRow));
  }

  return { dayIndex, easyRow, hardRow };
}

export function getGameForDifficulty(pools, difficulty, date = new Date()) {
  const { dayIndex, easyRow, hardRow } = pickDailyPair(pools, date);
  const selected = difficulty === "easy" ? easyRow : hardRow;

  return {
    game: selected.game,
    team: selected.team,
    difficulty,
    dateKey: dayIndexToDateKey(dayIndex),
    formation: selected.formation,
    lineup: selected.lineup,
    lineupNumbers: selected.lineupNumbers,
    lineupCaptains: selected.lineupCaptains,
    lineupGoals: selected.lineupGoals,
    lineupAssists: selected.lineupAssists,
    hasColoredCards: selected.hasColoredCards,
    lineupCards: selected.lineupCards,
    lineupYellowCards: selected.lineupYellowCards,
    lineupRedCards: selected.lineupRedCards,
    lineupSubstitutions: selected.lineupSubstitutions,
    sourceMatchId: selected.sourceMatchId,
    gameId: dayIndex * 2 + (difficulty === "easy" ? 0 : 1),
  };
}

