import { GAME_TIME_ZONE, getTurkeyDayIndex } from "@/lib/date"

export type Difficulty = "easy" | "hard"

type CsvColumnIndexes = {
  game: number
  team: number
  difficulty: number
  formation: number
  lineup: number
  lineupNumbers: number
  lineupCaptains: number
  lineupGoals: number
  lineupAssists: number
  lineupCards: number
  lineupYellowCards: number
  lineupRedCards: number
  lineupSubstitutions: number
  sourceMatchId: number
}

export type Ilk11GameRow = {
  game: string
  team: string
  formation: string
  lineup: string[]
  lineupNumbers: Array<number | null>
  lineupCaptains: number[]
  lineupGoals: number[]
  lineupAssists: number[]
  hasColoredCards: boolean
  lineupCards: number[]
  lineupYellowCards: number[]
  lineupRedCards: number[]
  lineupSubstitutions: number[]
  sourceMatchId: string
}

export type DailyPools = {
  easy: Ilk11GameRow[]
  hard: Ilk11GameRow[]
}

type CompactIlk11GameRow = [
  string,
  string,
  string,
  string[],
  Array<number | null>,
  number[],
  number[],
  number[],
  boolean,
  number[],
  number[],
  number[],
  number[],
  string,
]

export type Ilk11RuntimePoolFile = {
  v?: number
  d?: Difficulty
  r?: CompactIlk11GameRow[]
  rows?: Ilk11GameRow[]
}

export type Ilk11GameData = {
  game: string
  team: string
  difficulty: string
  dateKey: string
  formation: string
  lineup: string[]
  lineupNumbers: Array<number | null>
  lineupCaptains: number[]
  lineupGoals: number[]
  lineupAssists: number[]
  hasColoredCards: boolean
  lineupCards: number[]
  lineupYellowCards: number[]
  lineupRedCards: number[]
  lineupSubstitutions: number[]
  sourceMatchId: string
  gameId: number
}

export type Ilk11DailyPayload = {
  v?: number
  dateKey: string
  ilk11: {
    easy: Ilk11GameData
    hard: Ilk11GameData
  }
}

const EASY_MIN_YEAR = 2010
const EASY_TEAMS = new Set(["Besiktas", "Trabzonspor", "Fenerbahce", "Galatasaray"])
const MS_PER_DAY = 86_400_000
const DEDUP_WINDOW = 30
const DEDUP_EPOCH = "2026-03-18"

function getCsvColumnIndexes(headerLine: string): CsvColumnIndexes {
  const columns = headerLine.split(",").map((value) => value.trim().toLowerCase())
  const getIndex = (field: string, fallback: number) => {
    const idx = columns.indexOf(field)
    return idx >= 0 ? idx : fallback
  }

  return {
    game: getIndex("game", 0),
    team: getIndex("team", 1),
    difficulty: getIndex("difficulty", 2),
    formation: getIndex("formation", 3),
    lineup: getIndex("lineup", 4),
    lineupNumbers: getIndex("lineup_numbers", -1),
    lineupCaptains: getIndex("lineup_captains", -1),
    lineupGoals: getIndex("lineup_goals", -1),
    lineupAssists: getIndex("lineup_assists", -1),
    lineupCards: getIndex("lineup_cards", -1),
    lineupYellowCards: getIndex("lineup_yellow_cards", -1),
    lineupRedCards: getIndex("lineup_red_cards", -1),
    lineupSubstitutions: getIndex("lineup_substitutions", -1),
    sourceMatchId: getIndex("source_match_id", -1),
  }
}

function parseLineupNumbers(raw: string, expectedLength: number): Array<number | null> {
  if (!raw) return Array.from({ length: expectedLength }, () => null)

  const parsed = raw.split(";").map((token) => {
    const trimmed = token.trim()
    if (!trimmed) return null
    const value = Number(trimmed)
    return Number.isInteger(value) && value > 0 ? value : null
  })

  return Array.from({ length: expectedLength }, (_, index) => parsed[index] ?? null)
}

function parseLineupStatCounts(raw: string, expectedLength: number): number[] {
  if (!raw) return Array.from({ length: expectedLength }, () => 0)

  const parsed = raw.split(";").map((token) => {
    const trimmed = token.trim()
    if (!trimmed) return 0
    const value = Number(trimmed)
    return Number.isInteger(value) && value >= 0 ? value : 0
  })

  return Array.from({ length: expectedLength }, (_, index) => parsed[index] ?? 0)
}

function parseLineupBinaryFlags(raw: string, expectedLength: number): number[] {
  if (!raw) return Array.from({ length: expectedLength }, () => 0)

  const parsed = raw.split(";").map((token) => {
    const trimmed = token.trim()
    if (!trimmed) return 0
    const value = Number(trimmed)
    return value > 0 ? 1 : 0
  })

  return Array.from({ length: expectedLength }, (_, index) => parsed[index] ?? 0)
}

function fnv1a32(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = Math.imul(state ^ (state >>> 15), state | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function extractGameYear(game: string): number | null {
  const yearMatch = game.match(/(\d{4})\s*$/)
  if (!yearMatch) return null

  const year = Number(yearMatch[1])
  return Number.isInteger(year) ? year : null
}

const MONTH_NAMES: Record<string, number> = {
  January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
  July: 7, August: 8, September: 9, October: 10, November: 11, December: 12,
}

function getSeasonFromGame(game: string): string {
  const year = extractGameYear(game)
  if (year === null) return "unknown"

  const monthMatch = game.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/)
  if (!monthMatch) return String(year)

  const month = MONTH_NAMES[monthMatch[1]]
  if (month >= 8) {
    const shortNext = String(year + 1).slice(-2)
    return `${year}-${shortNext}`
  }

  const shortCurr = String(year).slice(-2)
  return `${year - 1}-${shortCurr}`
}

function dayIndexToDateKey(dayIndex: number): string {
  const d = new Date(dayIndex * MS_PER_DAY)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
}

function getTeamSeasonCombo(row: Ilk11GameRow): string {
  return `${row.team}|${getSeasonFromGame(row.game)}`
}

function pickWithDedup(pool: Ilk11GameRow[], rng: () => number, recentCombos: Set<string>): Ilk11GameRow {
  let firstCandidate: Ilk11GameRow | null = null
  for (let attempt = 0; attempt < pool.length; attempt++) {
    const index = Math.floor(rng() * pool.length)
    const candidate = pool[index]
    if (!firstCandidate) firstCandidate = candidate
    if (!recentCombos.has(getTeamSeasonCombo(candidate))) {
      return candidate
    }
  }
  return firstCandidate!
}

export function parsePoolRows(csvText: string, expectedDifficulty: Difficulty): Ilk11GameRow[] {
  const allLines = csvText.trim().split(/\r?\n/)
  if (allLines.length < 2) {
    throw new Error(`${expectedDifficulty}.csv is empty`)
  }

  const columnIndexes = getCsvColumnIndexes(allLines[0])
  const rows = allLines.slice(1).flatMap((line): Ilk11GameRow[] => {
    const trimmed = line.trim()
    if (!trimmed) return []

    const parts = trimmed.split(",")
    if (parts.length <= columnIndexes.lineup) return []

    const diffToken = (parts[columnIndexes.difficulty]?.trim().toLowerCase() ?? "") as Difficulty
    if (diffToken && diffToken !== expectedDifficulty) return []
    const game = parts[columnIndexes.game]?.trim() ?? ""
    const team = parts[columnIndexes.team]?.trim() ?? ""
    if (expectedDifficulty === "easy") {
      const year = extractGameYear(game)
      if (year === null || year < EASY_MIN_YEAR) return []
      if (!EASY_TEAMS.has(team)) return []
    }

    const lineupString = parts[columnIndexes.lineup]?.trim() ?? ""
    const lineup = lineupString ? lineupString.split(";").filter(Boolean) : []
    if (lineup.length !== 11) return []

    const lineupNumbersRaw =
      columnIndexes.lineupNumbers >= 0 ? parts[columnIndexes.lineupNumbers]?.trim() ?? "" : ""
    const lineupNumbers = parseLineupNumbers(lineupNumbersRaw, lineup.length)
    const lineupCaptainsRaw =
      columnIndexes.lineupCaptains >= 0 ? parts[columnIndexes.lineupCaptains]?.trim() ?? "" : ""
    const lineupCaptains = parseLineupBinaryFlags(lineupCaptainsRaw, lineup.length)
    const lineupGoalsRaw = columnIndexes.lineupGoals >= 0 ? parts[columnIndexes.lineupGoals]?.trim() ?? "" : ""
    const lineupAssistsRaw =
      columnIndexes.lineupAssists >= 0 ? parts[columnIndexes.lineupAssists]?.trim() ?? "" : ""
    const lineupCardsRaw = columnIndexes.lineupCards >= 0 ? parts[columnIndexes.lineupCards]?.trim() ?? "" : ""
    const lineupYellowCardsRaw =
      columnIndexes.lineupYellowCards >= 0 ? parts[columnIndexes.lineupYellowCards]?.trim() ?? "" : ""
    const lineupRedCardsRaw = columnIndexes.lineupRedCards >= 0 ? parts[columnIndexes.lineupRedCards]?.trim() ?? "" : ""
    const lineupSubstitutionsRaw =
      columnIndexes.lineupSubstitutions >= 0 ? parts[columnIndexes.lineupSubstitutions]?.trim() ?? "" : ""
    const sourceMatchId = columnIndexes.sourceMatchId >= 0 ? parts[columnIndexes.sourceMatchId]?.trim() ?? "" : ""
    const lineupGoals = parseLineupStatCounts(lineupGoalsRaw, lineup.length)
    const lineupAssists = parseLineupStatCounts(lineupAssistsRaw, lineup.length)
    const lineupCards = parseLineupStatCounts(lineupCardsRaw, lineup.length)
    const hasColoredCardColumns = columnIndexes.lineupYellowCards >= 0 || columnIndexes.lineupRedCards >= 0
    const parsedLineupYellowCards = parseLineupStatCounts(lineupYellowCardsRaw, lineup.length)
    const parsedLineupRedCards = parseLineupStatCounts(lineupRedCardsRaw, lineup.length)
    const coloredCardTotal =
      parsedLineupYellowCards.reduce((sum, count) => sum + count, 0) +
      parsedLineupRedCards.reduce((sum, count) => sum + count, 0)
    const legacyCardTotal = lineupCards.reduce((sum, count) => sum + count, 0)
    const hasColoredCards = hasColoredCardColumns && (coloredCardTotal > 0 || legacyCardTotal === 0)
    const lineupYellowCards = hasColoredCards ? parsedLineupYellowCards : []
    const lineupRedCards = hasColoredCards ? parsedLineupRedCards : []
    const lineupSubstitutions = parseLineupStatCounts(lineupSubstitutionsRaw, lineup.length)

    return [{
      game,
      team,
      formation: parts[columnIndexes.formation]?.trim() ?? "",
      lineup,
      lineupNumbers,
      lineupCaptains,
      lineupGoals,
      lineupAssists,
      hasColoredCards,
      lineupCards,
      lineupYellowCards,
      lineupRedCards,
      lineupSubstitutions,
      sourceMatchId,
    }]
  })

  if (rows.length === 0) {
    throw new Error(`No valid ${expectedDifficulty} rows found in pool file`)
  }

  return rows
}

function isIlk11RuntimeRow(row: unknown): row is Ilk11GameRow {
  return Boolean(
    row &&
    typeof row === "object" &&
    Array.isArray((row as Ilk11GameRow).lineup) &&
    (row as Ilk11GameRow).lineup.length === 11
  )
}

function decodeCompactRuntimeRow(row: CompactIlk11GameRow): Ilk11GameRow {
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
  }
}

export function decodeIlk11RuntimePool(
  payload: Ilk11RuntimePoolFile,
  expectedDifficulty: Difficulty
): Ilk11GameRow[] {
  if (payload.d && payload.d !== expectedDifficulty) {
    throw new Error(`${expectedDifficulty}.json has difficulty "${payload.d}"`)
  }

  if (Array.isArray(payload.r)) {
    const rows = payload.r.map(decodeCompactRuntimeRow).filter(isIlk11RuntimeRow)
    if (rows.length > 0) return rows
  }

  if (Array.isArray(payload.rows)) {
    const rows = payload.rows.filter(isIlk11RuntimeRow)
    if (rows.length > 0) return rows
  }

  throw new Error(`${expectedDifficulty}.json has no valid rows`)
}

function isIlk11GameData(value: unknown, difficulty: Difficulty, dateKey: string): value is Ilk11GameData {
  const game = value as Ilk11GameData
  return Boolean(
    game &&
    typeof game === "object" &&
    game.difficulty === difficulty &&
    game.dateKey === dateKey &&
    typeof game.game === "string" &&
    typeof game.team === "string" &&
    typeof game.formation === "string" &&
    Array.isArray(game.lineup) &&
    game.lineup.length === 11 &&
    Number.isInteger(game.gameId)
  )
}

export function decodeIlk11DailyPayload(payload: unknown, expectedDateKey: string): Ilk11DailyPayload {
  const daily = payload as Ilk11DailyPayload
  if (!daily || typeof daily !== "object") {
    throw new Error("daily payload is invalid")
  }

  if (daily.dateKey !== expectedDateKey) {
    throw new Error(`daily payload date is "${daily.dateKey}"`)
  }

  if (
    !isIlk11GameData(daily.ilk11?.easy, "easy", expectedDateKey) ||
    !isIlk11GameData(daily.ilk11?.hard, "hard", expectedDateKey)
  ) {
    throw new Error(`${expectedDateKey}.json has no valid ilk11 games`)
  }

  return daily
}

function pickDailyPairLegacy(pools: DailyPools, dayIndex: number): {
  easyRow: Ilk11GameRow
  hardRow: Ilk11GameRow
} {
  const dateKey = dayIndexToDateKey(dayIndex)
  const seed = fnv1a32(`${GAME_TIME_ZONE}:${dateKey}:pair`)
  const rng = mulberry32(seed)
  const easyRow = pools.easy[Math.floor(rng() * pools.easy.length)]
  const hardRow = pools.hard[Math.floor(rng() * pools.hard.length)]
  return { easyRow, hardRow }
}

export function pickDailyPair(pools: DailyPools, date = new Date()): {
  dayIndex: number
  easyRow: Ilk11GameRow
  hardRow: Ilk11GameRow
} {
  if (pools.easy.length === 0 || pools.hard.length === 0) {
    throw new Error("Need at least one easy and one hard game row")
  }

  const dayIndex = getTurkeyDayIndex(date)

  const [ey, em, ed] = DEDUP_EPOCH.split("-").map(Number)
  const epochDayIndex = Math.floor(Date.UTC(ey, em - 1, ed) / MS_PER_DAY)

  if (dayIndex < epochDayIndex) {
    const { easyRow, hardRow } = pickDailyPairLegacy(pools, dayIndex)
    return { dayIndex, easyRow, hardRow }
  }

  const easyHistory = new Map<number, string>()
  const hardHistory = new Map<number, string>()

  for (let di = epochDayIndex - DEDUP_WINDOW; di < epochDayIndex; di++) {
    const { easyRow, hardRow } = pickDailyPairLegacy(pools, di)
    easyHistory.set(di, getTeamSeasonCombo(easyRow))
    hardHistory.set(di, getTeamSeasonCombo(hardRow))
  }

  let easyRow: Ilk11GameRow = pools.easy[0]
  let hardRow: Ilk11GameRow = pools.hard[0]

  for (let di = epochDayIndex; di <= dayIndex; di++) {
    const dk = dayIndexToDateKey(di)

    const recentEasy = new Set<string>()
    for (let j = 1; j <= DEDUP_WINDOW; j++) {
      const combo = easyHistory.get(di - j)
      if (combo) recentEasy.add(combo)
    }
    const easyRng = mulberry32(fnv1a32(`${GAME_TIME_ZONE}:${dk}:v2:easy`))
    easyRow = pickWithDedup(pools.easy, easyRng, recentEasy)
    easyHistory.set(di, getTeamSeasonCombo(easyRow))

    const recentHard = new Set<string>()
    for (let j = 1; j <= DEDUP_WINDOW; j++) {
      const combo = hardHistory.get(di - j)
      if (combo) recentHard.add(combo)
    }
    const hardRng = mulberry32(fnv1a32(`${GAME_TIME_ZONE}:${dk}:v2:hard`))
    hardRow = pickWithDedup(pools.hard, hardRng, recentHard)
    hardHistory.set(di, getTeamSeasonCombo(hardRow))
  }

  return { dayIndex, easyRow, hardRow }
}

export function getGameForDifficulty(pools: DailyPools, difficulty: Difficulty, date = new Date()): Ilk11GameData {
  const { dayIndex, easyRow, hardRow } = pickDailyPair(pools, date)
  const selected = difficulty === "easy" ? easyRow : hardRow

  const gameId = dayIndex * 2 + (difficulty === "easy" ? 0 : 1)
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
    gameId,
  }
}

function normalizeTeamLabel(team: string): string {
  return team
    .replace(/_/g, " ")
    .replace(/\bBasaksehir\b/g, "Başakşehir")
    .replace(/\bBesiktas\b/g, "Beşiktaş")
    .replace(/\bFenerbahce\b/g, "Fenerbahçe")
    .replace(/\bGenclerbirligi\b/g, "Gençlerbirliği")
    .replace(/\bGoztepe\b/g, "Göztepe")
    .replace(/\bIstanbul\b/g, "İstanbul")
    .replace(/\bKonyaspor\b/g, "Konyaspor")
    .replace(/\bRizespor\b/g, "Rizespor")
    .replace(/\bSivasspor\b/g, "Sivasspor")
    .replace(/\bTrabzonspor\b/g, "Trabzonspor")
}

export function formatIlk11MatchLabel(row: Pick<Ilk11GameRow, "game" | "team">): string {
  const year = extractGameYear(row.game)
  const matchName = row.game.replace(/\s+\d{4}\s*$/, "").trim()
  const [team1, team2] = matchName.split(/\s*-\s*/, 2)
  const left = team1 ? normalizeTeamLabel(team1) : normalizeTeamLabel(row.team)
  const right = team2 ? normalizeTeamLabel(team2) : "?"
  return year ? `${left} - ${right} | ${year}` : `${left} - ${right}`
}
