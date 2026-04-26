import fs from "node:fs/promises";
import path from "node:path";

export const EXPECTED_HEADER = "game,team,formation,lineup";
export const EXPECTED_HEADER_WITH_DIFFICULTY = "game,team,difficulty,formation,lineup";
export const EXPECTED_HEADER_WITH_LINEUP_NUMBERS = "game,team,formation,lineup,lineup_numbers";
export const EXPECTED_HEADER_WITH_DIFFICULTY_AND_LINEUP_NUMBERS =
  "game,team,difficulty,formation,lineup,lineup_numbers";
export const EXPECTED_HEADER_WITH_DIFFICULTY_AND_LINEUP_NUMBERS_AND_CAPTAINS_AND_STATS_AND_SOURCE =
  "game,team,difficulty,formation,lineup,lineup_numbers,lineup_captains,lineup_goals,lineup_assists,lineup_cards,lineup_yellow_cards,lineup_red_cards,lineup_substitutions,source_match_id";
export const EXPECTED_HEADER_WITH_DIFFICULTY_AND_LINEUP_NUMBERS_AND_STATS_AND_SOURCE =
  "game,team,difficulty,formation,lineup,lineup_numbers,lineup_goals,lineup_assists,lineup_cards,lineup_yellow_cards,lineup_red_cards,lineup_substitutions,source_match_id";
export const EXPECTED_HEADER_WITH_DIFFICULTY_AND_LINEUP_NUMBERS_AND_LEGACY_CARD_STATS_AND_SOURCE =
  "game,team,difficulty,formation,lineup,lineup_numbers,lineup_goals,lineup_assists,lineup_cards,lineup_substitutions,source_match_id";

const OPTIONAL_TAIL_COLUMNS = [
  "lineup_numbers",
  "lineup_captains",
  "lineup_goals",
  "lineup_assists",
  "lineup_cards",
  "lineup_yellow_cards",
  "lineup_red_cards",
  "lineup_substitutions",
  "source_match_id",
];

function buildSupportedHeaders() {
  const supported = new Set();
  for (const includeDifficulty of [false, true]) {
    const base = ["game", "team", ...(includeDifficulty ? ["difficulty"] : []), "formation", "lineup"];
    const combinations = 1 << OPTIONAL_TAIL_COLUMNS.length;
    for (let mask = 0; mask < combinations; mask += 1) {
      const fields = [...base];
      for (let i = 0; i < OPTIONAL_TAIL_COLUMNS.length; i += 1) {
        if (mask & (1 << i)) {
          fields.push(OPTIONAL_TAIL_COLUMNS[i]);
        }
      }
      supported.add(fields.join(","));
    }
  }
  return supported;
}

export const SUPPORTED_HEADERS = new Set([
  EXPECTED_HEADER,
  EXPECTED_HEADER_WITH_DIFFICULTY,
  EXPECTED_HEADER_WITH_LINEUP_NUMBERS,
  EXPECTED_HEADER_WITH_DIFFICULTY_AND_LINEUP_NUMBERS,
  EXPECTED_HEADER_WITH_DIFFICULTY_AND_LINEUP_NUMBERS_AND_CAPTAINS_AND_STATS_AND_SOURCE,
  EXPECTED_HEADER_WITH_DIFFICULTY_AND_LINEUP_NUMBERS_AND_STATS_AND_SOURCE,
  EXPECTED_HEADER_WITH_DIFFICULTY_AND_LINEUP_NUMBERS_AND_LEGACY_CARD_STATS_AND_SOURCE,
  ...buildSupportedHeaders(),
]);

export function escapeCsvCell(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function rowKey(row) {
  return `${row.game}|||${row.team}`;
}

function serializeLineupNumbers(lineupNumbers) {
  if (!Array.isArray(lineupNumbers)) return "";
  return lineupNumbers
    .map((value) => {
      if (value === null || value === undefined || value === "") return "";
      const number = Number(value);
      return Number.isInteger(number) && number > 0 ? String(number) : "";
    })
    .join(";");
}

function serializeLineupStatCounts(values) {
  if (!Array.isArray(values)) return "";
  return values
    .map((value) => {
      const number = Number(value);
      return Number.isInteger(number) && number >= 0 ? String(number) : "0";
    })
    .join(";");
}

function serializeLineupBinaryFlags(values) {
  if (!Array.isArray(values)) return "";
  return values
    .map((value) => {
      const number = Number(value);
      return number > 0 ? "1" : "0";
    })
    .join(";");
}

function parseLineupNumber(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function parseLineupStatCount(value) {
  const text = String(value ?? "").trim();
  if (!text) return 0;
  const number = Number(text);
  return Number.isInteger(number) && number >= 0 ? number : 0;
}

function parseLineupBinaryFlag(value) {
  const text = String(value ?? "").trim();
  if (!text) return 0;
  const number = Number(text);
  return number > 0 ? 1 : 0;
}

export function serializeGamesCsv(rows, options = {}) {
  const includeDifficulty =
    options.includeDifficulty ?? rows.some((row) => typeof row.difficulty === "string" && row.difficulty !== "");
  const includeLineupNumbers =
    options.includeLineupNumbers ?? rows.some((row) => Array.isArray(row.lineupNumbers) && row.lineupNumbers.length > 0);
  const includeLineupCaptains =
    options.includeLineupCaptains ?? rows.some((row) => Array.isArray(row.lineupCaptains) && row.lineupCaptains.length > 0);
  const includeLineupGoals =
    options.includeLineupGoals ?? rows.some((row) => Array.isArray(row.lineupGoals) && row.lineupGoals.length > 0);
  const includeLineupAssists =
    options.includeLineupAssists ?? rows.some((row) => Array.isArray(row.lineupAssists) && row.lineupAssists.length > 0);
  const includeLineupCards =
    options.includeLineupCards ?? rows.some((row) => Array.isArray(row.lineupCards) && row.lineupCards.length > 0);
  const includeLineupYellowCards =
    options.includeLineupYellowCards ??
    rows.some((row) => Array.isArray(row.lineupYellowCards) && row.lineupYellowCards.length > 0);
  const includeLineupRedCards =
    options.includeLineupRedCards ??
    rows.some((row) => Array.isArray(row.lineupRedCards) && row.lineupRedCards.length > 0);
  const includeLineupSubstitutions =
    options.includeLineupSubstitutions ??
    rows.some((row) => Array.isArray(row.lineupSubstitutions) && row.lineupSubstitutions.length > 0);
  const includeSourceMatchId =
    options.includeSourceMatchId ??
    rows.some((row) => row.sourceMatchId !== undefined && row.sourceMatchId !== null && String(row.sourceMatchId).trim() !== "");

  const headerFields = ["game", "team"];
  if (includeDifficulty) headerFields.push("difficulty");
  headerFields.push("formation", "lineup");
  if (includeLineupNumbers) headerFields.push("lineup_numbers");
  if (includeLineupCaptains) headerFields.push("lineup_captains");
  if (includeLineupGoals) headerFields.push("lineup_goals");
  if (includeLineupAssists) headerFields.push("lineup_assists");
  if (includeLineupCards) headerFields.push("lineup_cards");
  if (includeLineupYellowCards) headerFields.push("lineup_yellow_cards");
  if (includeLineupRedCards) headerFields.push("lineup_red_cards");
  if (includeLineupSubstitutions) headerFields.push("lineup_substitutions");
  if (includeSourceMatchId) headerFields.push("source_match_id");
  const header = headerFields.join(",");

  const body = rows
    .map((row) => {
      const lineup = Array.isArray(row.lineup) ? row.lineup.join(";") : "";
      const lineupNumbers = serializeLineupNumbers(row.lineupNumbers);
      const lineupCaptains = serializeLineupBinaryFlags(row.lineupCaptains);
      const lineupGoals = serializeLineupStatCounts(row.lineupGoals);
      const lineupAssists = serializeLineupStatCounts(row.lineupAssists);
      const lineupCards = serializeLineupStatCounts(row.lineupCards);
      const lineupYellowCards = serializeLineupStatCounts(row.lineupYellowCards);
      const lineupRedCards = serializeLineupStatCounts(row.lineupRedCards);
      const lineupSubstitutions = serializeLineupStatCounts(row.lineupSubstitutions);

      const fields = [escapeCsvCell(row.game), escapeCsvCell(row.team)];
      if (includeDifficulty) {
        fields.push(escapeCsvCell(row.difficulty ?? ""));
      }
      fields.push(escapeCsvCell(row.formation), escapeCsvCell(lineup));
      if (includeLineupNumbers) fields.push(escapeCsvCell(lineupNumbers));
      if (includeLineupCaptains) fields.push(escapeCsvCell(lineupCaptains));
      if (includeLineupGoals) fields.push(escapeCsvCell(lineupGoals));
      if (includeLineupAssists) fields.push(escapeCsvCell(lineupAssists));
      if (includeLineupCards) fields.push(escapeCsvCell(lineupCards));
      if (includeLineupYellowCards) fields.push(escapeCsvCell(lineupYellowCards));
      if (includeLineupRedCards) fields.push(escapeCsvCell(lineupRedCards));
      if (includeLineupSubstitutions) fields.push(escapeCsvCell(lineupSubstitutions));
      if (includeSourceMatchId) fields.push(escapeCsvCell(row.sourceMatchId ?? ""));
      return fields.join(",");
    })
    .join("\n");

  return body ? `${header}\n${body}\n` : `${header}\n`;
}

export function parseGamesCsv(text, filePath = "<memory>") {
  const clean = text.replace(/^\uFEFF/, "");
  const lines = clean.split(/\r?\n/);
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
    lines.pop();
  }

  if (lines.length === 0) {
    return { header: "", rows: [], errors: [] };
  }

  const header = lines[0].trim();
  const headerFields = header.split(",").map((value) => value.trim().toLowerCase());
  const fieldIndex = new Map(headerFields.map((field, index) => [field, index]));
  const hasDifficulty = fieldIndex.has("difficulty");
  const hasLineupNumbers = fieldIndex.has("lineup_numbers");
  const hasLineupCaptains = fieldIndex.has("lineup_captains");
  const hasLineupGoals = fieldIndex.has("lineup_goals");
  const hasLineupAssists = fieldIndex.has("lineup_assists");
  const hasLineupCards = fieldIndex.has("lineup_cards");
  const hasLineupYellowCards = fieldIndex.has("lineup_yellow_cards");
  const hasLineupRedCards = fieldIndex.has("lineup_red_cards");
  const hasLineupSubstitutions = fieldIndex.has("lineup_substitutions");
  const hasSourceMatchId = fieldIndex.has("source_match_id");

  const gameIndex = fieldIndex.get("game") ?? 0;
  const teamIndex = fieldIndex.get("team") ?? 1;
  const difficultyIndex = fieldIndex.get("difficulty") ?? 2;
  const formationIndex = fieldIndex.get("formation") ?? (hasDifficulty ? 3 : 2);
  const lineupIndex = fieldIndex.get("lineup") ?? (hasDifficulty ? 4 : 3);
  const lineupNumbersIndex = fieldIndex.get("lineup_numbers") ?? -1;
  const lineupCaptainsIndex = fieldIndex.get("lineup_captains") ?? -1;
  const lineupGoalsIndex = fieldIndex.get("lineup_goals") ?? -1;
  const lineupAssistsIndex = fieldIndex.get("lineup_assists") ?? -1;
  const lineupCardsIndex = fieldIndex.get("lineup_cards") ?? -1;
  const lineupYellowCardsIndex = fieldIndex.get("lineup_yellow_cards") ?? -1;
  const lineupRedCardsIndex = fieldIndex.get("lineup_red_cards") ?? -1;
  const lineupSubstitutionsIndex = fieldIndex.get("lineup_substitutions") ?? -1;
  const sourceMatchIdIndex = fieldIndex.get("source_match_id") ?? -1;

  const rows = [];
  const errors = [];

  for (let i = 1; i < lines.length; i += 1) {
    const lineNo = i + 1;
    const line = lines[i];
    if (!line || line.trim() === "") continue;

    const parts = line.split(",");
    const requiredIndexes = [gameIndex, teamIndex, formationIndex, lineupIndex, hasDifficulty ? difficultyIndex : -1].filter(
      (value) => value >= 0
    );
    const minParts = Math.max(...requiredIndexes) + 1;
    if (parts.length < minParts) {
      errors.push(`${filePath}:${lineNo} has fewer than ${minParts} comma-separated fields`);
      continue;
    }

    const getPart = (index) => (index >= 0 ? parts[index] ?? "" : "");
    const gameRaw = getPart(gameIndex);
    const teamRaw = getPart(teamIndex);
    const difficultyRaw = hasDifficulty ? getPart(difficultyIndex) : "";
    const formationRaw = getPart(formationIndex);
    const lineupRaw = getPart(lineupIndex);
    const lineupNumbersRaw = hasLineupNumbers ? getPart(lineupNumbersIndex) : "";
    const lineupCaptainsRaw = hasLineupCaptains ? getPart(lineupCaptainsIndex) : "";
    const lineupGoalsRaw = hasLineupGoals ? getPart(lineupGoalsIndex) : "";
    const lineupAssistsRaw = hasLineupAssists ? getPart(lineupAssistsIndex) : "";
    const lineupCardsRaw = hasLineupCards ? getPart(lineupCardsIndex) : "";
    const lineupYellowCardsRaw = hasLineupYellowCards ? getPart(lineupYellowCardsIndex) : "";
    const lineupRedCardsRaw = hasLineupRedCards ? getPart(lineupRedCardsIndex) : "";
    const lineupSubstitutionsRaw = hasLineupSubstitutions ? getPart(lineupSubstitutionsIndex) : "";
    const sourceMatchIdRaw = hasSourceMatchId ? getPart(sourceMatchIdIndex) : "";

    const lineup = lineupRaw
      .split(";")
      .map((name) => name.trim())
      .filter(Boolean);

    const lineupNumbers =
      hasLineupNumbers && lineupNumbersRaw.trim() !== ""
        ? lineupNumbersRaw.split(";").map((value) => parseLineupNumber(value))
        : [];
    const lineupCaptains =
      hasLineupCaptains && lineupCaptainsRaw.trim() !== ""
        ? lineupCaptainsRaw.split(";").map((value) => parseLineupBinaryFlag(value))
        : [];
    const lineupGoals =
      hasLineupGoals && lineupGoalsRaw.trim() !== ""
        ? lineupGoalsRaw.split(";").map((value) => parseLineupStatCount(value))
        : [];
    const lineupAssists =
      hasLineupAssists && lineupAssistsRaw.trim() !== ""
        ? lineupAssistsRaw.split(";").map((value) => parseLineupStatCount(value))
        : [];
    const lineupCards =
      hasLineupCards && lineupCardsRaw.trim() !== ""
        ? lineupCardsRaw.split(";").map((value) => parseLineupStatCount(value))
        : [];
    const lineupYellowCards =
      hasLineupYellowCards && lineupYellowCardsRaw.trim() !== ""
        ? lineupYellowCardsRaw.split(";").map((value) => parseLineupStatCount(value))
        : [];
    const lineupRedCards =
      hasLineupRedCards && lineupRedCardsRaw.trim() !== ""
        ? lineupRedCardsRaw.split(";").map((value) => parseLineupStatCount(value))
        : [];
    const lineupSubstitutions =
      hasLineupSubstitutions && lineupSubstitutionsRaw.trim() !== ""
        ? lineupSubstitutionsRaw.split(";").map((value) => parseLineupStatCount(value))
        : [];
    const sourceMatchId = hasSourceMatchId ? sourceMatchIdRaw.trim() : undefined;

    rows.push({
      game: gameRaw.trim(),
      team: teamRaw.trim(),
      difficulty: hasDifficulty ? difficultyRaw.trim() : undefined,
      formation: formationRaw.trim(),
      lineup,
      lineupNumbers: hasLineupNumbers ? lineupNumbers : undefined,
      lineupCaptains: hasLineupCaptains ? lineupCaptains : undefined,
      lineupGoals: hasLineupGoals ? lineupGoals : undefined,
      lineupAssists: hasLineupAssists ? lineupAssists : undefined,
      lineupCards: hasLineupCards ? lineupCards : undefined,
      lineupYellowCards: hasLineupYellowCards ? lineupYellowCards : undefined,
      lineupRedCards: hasLineupRedCards ? lineupRedCards : undefined,
      lineupSubstitutions: hasLineupSubstitutions ? lineupSubstitutions : undefined,
      sourceMatchId: hasSourceMatchId ? sourceMatchId : undefined,
      _line: lineNo,
    });
  }

  return {
    header,
    rows,
    errors,
    hasDifficulty,
    hasLineupNumbers,
    hasLineupCaptains,
    hasLineupGoals,
    hasLineupAssists,
    hasLineupCards,
    hasLineupYellowCards,
    hasLineupRedCards,
    hasLineupSubstitutions,
    hasSourceMatchId,
  };
}

export async function readGamesCsv(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  return parseGamesCsv(text, filePath);
}

export async function writeGamesCsv(filePath, rows, options = {}) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const csv = serializeGamesCsv(rows, options);
  await fs.writeFile(filePath, csv, "utf8");
}

export function parseGameDate(gameLabel) {
  const match = gameLabel.match(/ - ([A-Za-z]+) ([A-Za-z]+) (\d{1,2}) - (\d{4})$/);
  if (match) {
    const [, , monthName, dayText, yearText] = match;
    const day = Number(dayText);
    const year = Number(yearText);
    const parsed = new Date(`${monthName} ${day}, ${year} UTC`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const fallback = gameLabel.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (fallback) {
    const [, dd, mm, yyyy] = fallback;
    const date = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
    if (!Number.isNaN(date.getTime())) return date;
  }

  return null;
}

export function compareRowsByDateThenGame(a, b) {
  const dateA = parseGameDate(a.game);
  const dateB = parseGameDate(b.game);

  if (dateA && dateB) {
    const diff = dateA.getTime() - dateB.getTime();
    if (diff !== 0) return diff;
  } else if (dateA && !dateB) {
    return -1;
  } else if (!dateA && dateB) {
    return 1;
  }

  const gameCmp = a.game.localeCompare(b.game);
  if (gameCmp !== 0) return gameCmp;
  return a.team.localeCompare(b.team);
}

export function countRowsByYear(rows) {
  const counts = new Map();
  for (const row of rows) {
    let year = "";
    const date = parseGameDate(row.game);
    if (date) {
      year = String(date.getUTCFullYear());
    } else {
      const rawYear = row.game.match(/(\d{4})$/)?.[1] ?? "unknown";
      year = rawYear;
    }
    counts.set(year, (counts.get(year) ?? 0) + 1);
  }
  return counts;
}
