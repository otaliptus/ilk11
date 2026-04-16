"use client"

import { useEffect, useMemo, useState } from "react"
import { Formation } from "@/components/formation"
import { DifficultySelectionModal } from "@/components/team-selection-modal"
import { assignPositions } from "@/lib/api"
import { GAME_TIME_ZONE, getTurkeyDayIndex } from "@/lib/date"
import { ILK10_PATH } from "@/lib/routes"

type Difficulty = "easy" | "hard"

type GameData = {
  game: string
  team: string
  difficulty: string
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

const EASY_MIN_YEAR = 2010
const EASY_TEAMS = new Set(["Besiktas", "Trabzonspor", "Fenerbahce", "Galatasaray"])
const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev"
const EASY_CSV_URL = `/easy.csv?v=${encodeURIComponent(BUILD_ID)}`
const HARD_CSV_URL = `/hard.csv?v=${encodeURIComponent(BUILD_ID)}`

const MS_PER_DAY = 86_400_000
const DEDUP_WINDOW = 30
const DEDUP_EPOCH = "2026-03-18"

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

type GameRow = {
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

type DailyPools = {
  easy: GameRow[]
  hard: GameRow[]
}

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
  } else {
    const shortCurr = String(year).slice(-2)
    return `${year - 1}-${shortCurr}`
  }
}

function dayIndexToDateKey(dayIndex: number): string {
  const d = new Date(dayIndex * MS_PER_DAY)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
}

function getTeamSeasonCombo(row: GameRow): string {
  return `${row.team}|${getSeasonFromGame(row.game)}`
}

function pickWithDedup(pool: GameRow[], rng: () => number, recentCombos: Set<string>): GameRow {
  let firstCandidate: GameRow | null = null
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

function parsePoolRows(csvText: string, expectedDifficulty: Difficulty): GameRow[] {
  const allLines = csvText.trim().split(/\r?\n/)
  if (allLines.length < 2) {
    throw new Error(`${expectedDifficulty}.csv is empty`)
  }

  const columnIndexes = getCsvColumnIndexes(allLines[0])
  const rows = allLines.slice(1).flatMap((line): GameRow[] => {
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

function pickDailyPairLegacy(pools: DailyPools, dayIndex: number): {
  easyRow: GameRow
  hardRow: GameRow
} {
  const dateKey = dayIndexToDateKey(dayIndex)
  const seed = fnv1a32(`${GAME_TIME_ZONE}:${dateKey}:pair`)
  const rng = mulberry32(seed)
  const easyRow = pools.easy[Math.floor(rng() * pools.easy.length)]
  const hardRow = pools.hard[Math.floor(rng() * pools.hard.length)]
  return { easyRow, hardRow }
}

function pickDailyPair(pools: DailyPools, date = new Date()): {
  dayIndex: number
  easyRow: GameRow
  hardRow: GameRow
} {
  if (pools.easy.length === 0 || pools.hard.length === 0) {
    throw new Error("Need at least one easy and one hard game row")
  }

  const dayIndex = getTurkeyDayIndex(date)

  // Compute epoch day index
  const [ey, em, ed] = DEDUP_EPOCH.split("-").map(Number)
  const epochDayIndex = Math.floor(Date.UTC(ey, em - 1, ed) / MS_PER_DAY)

  // Before epoch: use legacy (purely random) selection
  if (dayIndex < epochDayIndex) {
    const { easyRow, hardRow } = pickDailyPairLegacy(pools, dayIndex)
    return { dayIndex, easyRow, hardRow }
  }

  // Build sliding-window dedup history.
  // Seed with legacy picks for DEDUP_WINDOW days before epoch.
  const easyHistory = new Map<number, string>()
  const hardHistory = new Map<number, string>()

  for (let di = epochDayIndex - DEDUP_WINDOW; di < epochDayIndex; di++) {
    const { easyRow, hardRow } = pickDailyPairLegacy(pools, di)
    easyHistory.set(di, getTeamSeasonCombo(easyRow))
    hardHistory.set(di, getTeamSeasonCombo(hardRow))
  }

  // From epoch through target day, compute each day with dedup
  let easyRow: GameRow = pools.easy[0]
  let hardRow: GameRow = pools.hard[0]

  for (let di = epochDayIndex; di <= dayIndex; di++) {
    const dk = dayIndexToDateKey(di)

    // Easy: collect recent combos and pick avoiding them
    const recentEasy = new Set<string>()
    for (let j = 1; j <= DEDUP_WINDOW; j++) {
      const combo = easyHistory.get(di - j)
      if (combo) recentEasy.add(combo)
    }
    const easyRng = mulberry32(fnv1a32(`${GAME_TIME_ZONE}:${dk}:v2:easy`))
    easyRow = pickWithDedup(pools.easy, easyRng, recentEasy)
    easyHistory.set(di, getTeamSeasonCombo(easyRow))

    // Hard: collect recent combos and pick avoiding them
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

function getGameForDifficulty(pools: DailyPools, difficulty: Difficulty): GameData {
  const { dayIndex, easyRow, hardRow } = pickDailyPair(pools)
  const selected = difficulty === "easy" ? easyRow : hardRow

  const gameId = dayIndex * 2 + (difficulty === "easy" ? 0 : 1)
  return {
    game: selected.game,
    team: selected.team,
    difficulty,
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

export default function Home() {
  const [dailyPools, setDailyPools] = useState<DailyPools | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null)
  const [gameData, setGameData] = useState<GameData | null>(null)

  // Load easy/hard pools once
  useEffect(() => {
    let isMounted = true
    const load = async () => {
      try {
        const [easyRes, hardRes] = await Promise.all([
          fetch(EASY_CSV_URL),
          fetch(HARD_CSV_URL),
        ])
        if (!easyRes.ok) throw new Error(`Failed to load easy.csv (${easyRes.status})`)
        if (!hardRes.ok) throw new Error(`Failed to load hard.csv (${hardRes.status})`)

        const [easyCsvText, hardCsvText] = await Promise.all([easyRes.text(), hardRes.text()])
        const easyRows = parsePoolRows(easyCsvText, "easy")
        const hardRows = parsePoolRows(hardCsvText, "hard")

        if (isMounted) {
          setDailyPools({ easy: easyRows, hard: hardRows })
          setError(null)
        }
      } catch (err) {
        if (!isMounted) return
        setError(err instanceof Error ? err.message : "Unknown error")
      }
    }
    load()
    return () => { isMounted = false }
  }, [])

  const handleDifficultySelect = (d: Difficulty) => {
    setDifficulty(d)
  }

  // When both CSV and difficulty are ready, compute game data
  useEffect(() => {
    if (!dailyPools || !difficulty) return
    try {
      const data = getGameForDifficulty(dailyPools, difficulty)
      setGameData(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    }
  }, [dailyPools, difficulty])

  const players = useMemo(() => {
    if (!gameData) return []
    return assignPositions(
      gameData.formation,
      gameData.lineup,
      gameData.lineupNumbers,
      gameData.lineupCaptains,
      gameData.lineupGoals,
      gameData.lineupAssists,
      gameData.hasColoredCards,
      gameData.lineupYellowCards,
      gameData.lineupRedCards,
      gameData.lineupCards,
      gameData.lineupSubstitutions
    )
  }, [gameData])

  if (error) {
    return (
      <main className="min-h-screen gradient-dark text-white p-2 sm:p-4">
        <div className="container mx-auto flex flex-col items-center justify-center h-[calc(100vh-1rem)] sm:h-[calc(100vh-2rem)]">
          <div className="glass rounded-2xl p-6 text-center">
            <p className="text-red-400 font-medium">Failed to load game: {error}</p>
          </div>
        </div>
      </main>
    )
  }

  const showDifficultySelection = !difficulty
  const showLoading = !!difficulty && !gameData

  return (
    <main className="min-h-screen h-screen gradient-dark text-white p-1 sm:p-2 flex flex-col overflow-hidden">
      {showDifficultySelection ? (
        <DifficultySelectionModal onSelect={handleDifficultySelect} />
      ) : (
      <div className="h-full w-full min-h-0 flex-1 flex items-center justify-center">
        {showLoading && (
          <div className="glass rounded-2xl p-6 text-center">
            <div className="animate-pulse flex flex-col items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-emerald-500/30" />
              <p className="text-slate-300">Loading game...</p>
            </div>
          </div>
        )}

        {gameData && (
          <div className="h-full w-full max-w-[90vw] sm:max-w-[80vw] md:max-w-[720px]">
            <Formation
              formation={gameData.formation}
              players={players}
              game={gameData.game}
              team={gameData.team}
              gameId={gameData.gameId}
              difficulty={difficulty!}
            />
          </div>
        )}
      </div>
      )}

      <footer className="pt-2 pb-1 flex justify-center">
        <div className="flex items-center gap-4 rounded-full border border-white/15 bg-black/35 px-3 py-1.5 text-sm leading-none text-slate-200 backdrop-blur-sm">
          <a
            href={ILK10_PATH}
            className="inline-flex items-center gap-1.5 hover:text-white transition-colors"
          >
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-emerald-400/50 text-[10px] font-bold text-emerald-300">
              10
            </span>
            İlk10
          </a>
          <a
            href="https://github.com/otaliptus/ilk11"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 hover:text-white transition-colors"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-current">
              <path d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2.2c-3.2.69-3.87-1.35-3.87-1.35-.52-1.32-1.28-1.67-1.28-1.67-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.72-1.54-2.56-.29-5.25-1.28-5.25-5.72 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11.02 11.02 0 0 1 5.77 0c2.2-1.49 3.16-1.18 3.16-1.18.63 1.59.24 2.76.12 3.05.73.81 1.17 1.84 1.17 3.1 0 4.45-2.69 5.43-5.26 5.72.41.36.78 1.06.78 2.14v3.17c0 .31.21.66.8.55A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
            </svg>
            GitHub
          </a>
          <a
            href="https://x.com/otaliptus"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 hover:text-white transition-colors"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-current">
              <path d="M18.901 1.153h3.68l-8.04 9.188L24 22.847h-7.406l-5.8-7.584-6.639 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932 6.064-6.933zM17.61 20.644h2.039L6.486 3.24H4.298l13.312 17.404z" />
            </svg>
            @otaliptus
          </a>
        </div>
      </footer>
    </main>
  )
}
