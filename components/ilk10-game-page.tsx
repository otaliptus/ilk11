"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ILK10_QUESTIONS } from "@/data/ilk10-questions"
import { ILK11_TEAM_AUTOCOMPLETE } from "@/data/ilk11-team-autocomplete"
import AUTOCOMPLETE_DATA from "@/registry/output/autocomplete.json"
import {
  ILK10_MAX_LIVES,
  ILK10_DATE_INSERTIONS,
  ILK10_DATE_OVERRIDES,
  applyIlk10Guess,
  buildIlk10ShareText,
  createInitialIlk10State,
  getIlk10QuestionCacheToken,
  getIlk10StatusMessage,
  getIlk10StorageKey,
  getRemainingLives,
  isAllowedLiveQuestion,
  isIlk10Finished,
  isIlk10Solved,
  normalizeIlk10Answer,
  pickDailyIlk10Question,
} from "@/lib/ilk10"
import { getTurkeyDateKey } from "@/lib/date"
import { ILK11_PATH } from "@/lib/routes"
import type { Ilk10Answer, Ilk10EntityType, Ilk10Question, Ilk10StoredState } from "@/types/ilk10"
import { LeaderboardModal } from "@/components/leaderboard-modal"
import { LeaderboardSubmit } from "@/components/leaderboard-submit"
import { Copy, Heart, Share2, Trophy } from "lucide-react"

const AUTOCOMPLETE_LIMIT = 8
const ADMIN_STORAGE_PREFIX = "staging-admin:"

type Ilk10GamePageProps = {
  adminMode?: boolean
  forcedDateKey?: string | null
  onForcedDateChange?: (dateKey: string) => void
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text
  const normalizedQuery = normalizeIlk10Answer(query)
  if (!normalizedQuery) return text

  // Build a mapping from normalized positions back to original positions.
  // Each original char either maps to a normalized char or is skipped (spaces, hyphens, etc.)
  const normToOrig: number[] = []
  for (let i = 0; i < text.length; i++) {
    const charNorm = normalizeIlk10Answer(text[i])
    for (let j = 0; j < charNorm.length; j++) {
      normToOrig.push(i)
    }
  }

  const normalizedText = normalizeIlk10Answer(text)
  const matchStart = normalizedText.indexOf(normalizedQuery)
  if (matchStart === -1) return text

  const matchEnd = matchStart + normalizedQuery.length - 1
  const origStart = normToOrig[matchStart]
  const origEnd = normToOrig[matchEnd]
  if (origStart === undefined || origEnd === undefined) return text

  const before = text.slice(0, origStart)
  const match = text.slice(origStart, origEnd + 1)
  const after = text.slice(origEnd + 1)
  return (
    <>
      {before}
      <span className="font-bold text-white">{match}</span>
      {after}
    </>
  )
}

type AutocompleteSuggestion = {
  id: string
  entityType: Ilk10EntityType
  label: string
  labelWithMeta: string
  searchKey: string
  aliases: string[]
  provisional: boolean
  resolvedEntityId?: string
}

type IndexedAutocompleteSuggestion = AutocompleteSuggestion & {
  searchTerms: string[]
}

function getEntityTypeLabel(entityType: Ilk10EntityType): string {
  switch (entityType) {
    case "player":
      return "oyuncu"
    case "coach":
      return "teknik direktör"
    case "referee":
      return "hakem"
    case "team":
      return "takım"
    default:
      return "isim"
  }
}

function getSearchTokens(input: string): string[] {
  return String(input ?? "")
    .split(/[\s\-'.’`]+/)
    .map((token) => normalizeIlk10Answer(token))
    .filter(Boolean)
}

function uniqueTerms(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

function createSyntheticSuggestion(
  id: string,
  entityType: Ilk10EntityType,
  label: string,
  aliases: string[] = [],
  resolvedEntityId?: string
): IndexedAutocompleteSuggestion {
  return {
    id,
    entityType,
    label,
    labelWithMeta: label,
    searchKey: normalizeIlk10Answer(label),
    aliases,
    provisional: false,
    resolvedEntityId,
    searchTerms: uniqueTerms([
      normalizeIlk10Answer(label),
      ...aliases.map((alias) => normalizeIlk10Answer(alias)),
      ...getSearchTokens(label),
      ...aliases.flatMap((alias) => getSearchTokens(alias)),
    ]),
  }
}

function getExactAnswerTerms(answer: Ilk10Answer): string[] {
  return uniqueTerms(
    [answer.value, ...(answer.aliases ?? [])].map((candidate) => normalizeIlk10Answer(candidate))
  )
}

function getSuggestionResolvedEntityId(suggestion: IndexedAutocompleteSuggestion): string | undefined {
  return suggestion.resolvedEntityId ?? suggestion.id
}

function getExactSuggestionTerms(suggestion: IndexedAutocompleteSuggestion): string[] {
  return uniqueTerms([
    normalizeIlk10Answer(suggestion.label),
    ...suggestion.aliases.map((alias) => normalizeIlk10Answer(alias)),
  ])
}

function getExactMatchingSuggestions(
  suggestions: IndexedAutocompleteSuggestion[],
  normalizedGuess: string
): IndexedAutocompleteSuggestion[] {
  return suggestions.filter((suggestion) => getExactSuggestionTerms(suggestion).includes(normalizedGuess))
}

function getExactUniqueSuggestionEntityId(
  suggestions: IndexedAutocompleteSuggestion[],
  normalizedGuess: string
): string | undefined {
  const uniqueEntityIds = Array.from(
    new Set(
      getExactMatchingSuggestions(suggestions, normalizedGuess)
        .map((suggestion) => getSuggestionResolvedEntityId(suggestion))
        .filter((entityId): entityId is string => Boolean(entityId))
    )
  )

  return uniqueEntityIds.length === 1 ? uniqueEntityIds[0] : undefined
}

function getSuggestionMatchRank(
  suggestion: IndexedAutocompleteSuggestion,
  normalizedGuess: string
): number | null {
  const normalizedLabel = normalizeIlk10Answer(suggestion.label)
  const normalizedAliases = suggestion.aliases.map((alias) => normalizeIlk10Answer(alias))
  const labelTokens = getSearchTokens(suggestion.label)
  const aliasTokens = suggestion.aliases.flatMap((alias) => getSearchTokens(alias))

  if (normalizedLabel === normalizedGuess) return 0
  if (normalizedAliases.includes(normalizedGuess)) return 1
  if (labelTokens.includes(normalizedGuess)) return 2
  if (aliasTokens.includes(normalizedGuess)) return 3
  if (normalizedLabel.startsWith(normalizedGuess)) return 4
  if (normalizedAliases.some((alias) => alias.startsWith(normalizedGuess))) return 5
  if (labelTokens.some((token) => token.startsWith(normalizedGuess))) return 6
  if (aliasTokens.some((token) => token.startsWith(normalizedGuess))) return 7
  if (normalizedLabel.includes(normalizedGuess)) return 8
  if (normalizedAliases.some((alias) => alias.includes(normalizedGuess))) return 9
  if (labelTokens.some((token) => token.includes(normalizedGuess))) return 10
  if (aliasTokens.some((token) => token.includes(normalizedGuess))) return 11

  return null
}

function getMatchingAnswerIndexesBySuggestion(
  questionAnswers: Ilk10Answer[],
  suggestion: IndexedAutocompleteSuggestion
): number[] {
  const suggestionEntityId = getSuggestionResolvedEntityId(suggestion)
  if (suggestionEntityId) {
    const entityMatches = questionAnswers.flatMap((answer, index) =>
      answer.entityId === suggestionEntityId ? [index] : []
    )
    if (entityMatches.length > 0) {
      return entityMatches
    }
  }

  return questionAnswers.flatMap((answer, index) =>
    getExactAnswerTerms(answer).some((candidate) => getExactSuggestionTerms(suggestion).includes(candidate))
      ? [index]
      : []
  )
}

function resolveGuessToAnswerValue(questionAnswers: Ilk10Answer[], rawGuess: string): string {
  const normalizedGuess = normalizeIlk10Answer(rawGuess)
  if (!normalizedGuess) {
    return rawGuess
  }

  const directMatchingAnswerIndexes = questionAnswers.flatMap((answer, index) =>
    [answer.value, ...(answer.aliases ?? [])]
      .map((candidate) => normalizeIlk10Answer(candidate))
      .includes(normalizedGuess)
      ? [index]
      : []
  )
  return directMatchingAnswerIndexes.length === 1
    ? questionAnswers[directMatchingAnswerIndexes[0]].value
    : rawGuess
}

function indexAutocompleteSuggestions(
  suggestions: AutocompleteSuggestion[]
): IndexedAutocompleteSuggestion[] {
  return suggestions.map((suggestion) => ({
    ...suggestion,
    resolvedEntityId: suggestion.resolvedEntityId ?? suggestion.id,
    searchTerms: uniqueTerms([
      suggestion.searchKey,
      normalizeIlk10Answer(suggestion.label),
      ...suggestion.aliases.map((alias) => normalizeIlk10Answer(alias)),
      ...getSearchTokens(suggestion.label),
      ...suggestion.aliases.flatMap((alias) => getSearchTokens(alias)),
    ]),
  }))
}

function buildTeamAutocompleteSuggestions(
  questions: typeof ILK10_QUESTIONS
): IndexedAutocompleteSuggestion[] {
  const suggestions = new Map<string, AutocompleteSuggestion>()
  const addCandidate = (candidate: string, aliases: string[] = []) => {
    const normalizedCandidate = normalizeIlk10Answer(candidate)
    if (!normalizedCandidate) {
      return
    }

    const existing = suggestions.get(normalizedCandidate)
    if (existing) {
      existing.aliases = uniqueTerms([...existing.aliases, ...aliases])
      return
    }

    suggestions.set(normalizedCandidate, {
      id: `team:${normalizedCandidate}`,
      entityType: "team",
      label: candidate,
      labelWithMeta: candidate,
      searchKey: normalizedCandidate,
      aliases: uniqueTerms(aliases),
      provisional: false,
    })
  }

  for (const seed of ILK11_TEAM_AUTOCOMPLETE) {
    addCandidate(seed.label, seed.aliases ?? [])
  }

  for (const question of questions) {
    if (question.entityType !== "team") {
      continue
    }

    for (const answer of question.answers) {
      const candidates = uniqueTerms([answer.value, ...(answer.aliases ?? [])])
      for (const candidate of candidates) {
        const aliases = candidates.filter((value) => value !== candidate)
        addCandidate(candidate, aliases)
      }
    }
  }

  return indexAutocompleteSuggestions(Array.from(suggestions.values())).sort((left, right) =>
    left.label.localeCompare(right.label)
  )
}

const baseAutocompleteByEntity = Object.fromEntries(
  Object.entries((AUTOCOMPLETE_DATA.byEntityType ?? {}) as Record<string, AutocompleteSuggestion[]>).map(
    ([entityType, suggestions]) => [entityType, indexAutocompleteSuggestions(suggestions)]
  )
) as Partial<Record<Ilk10EntityType, IndexedAutocompleteSuggestion[]>>

const AUTOCOMPLETE_BY_ENTITY: Record<Ilk10EntityType, IndexedAutocompleteSuggestion[]> = {
  player: baseAutocompleteByEntity.player ?? [],
  coach: baseAutocompleteByEntity.coach ?? [],
  referee: baseAutocompleteByEntity.referee ?? [],
  team: buildTeamAutocompleteSuggestions(ILK10_QUESTIONS),
}

function enrichQuestionsWithEntityIds(questions: typeof ILK10_QUESTIONS): typeof ILK10_QUESTIONS {
  return questions.map((question) => {
    const basePool = AUTOCOMPLETE_BY_ENTITY[question.entityType] ?? []
    return {
      ...question,
      answers: question.answers.map((answer) => {
        if (answer.entityId) {
          return answer
        }

        const matchedEntityIds = Array.from(
          new Set(
            getExactAnswerTerms(answer)
              .flatMap((term) => getExactMatchingSuggestions(basePool, term))
              .map((suggestion) => getSuggestionResolvedEntityId(suggestion))
              .filter((entityId): entityId is string => Boolean(entityId))
          )
        )

        return matchedEntityIds.length === 1
          ? { ...answer, entityId: matchedEntityIds[0] }
          : answer
      }),
    }
  })
}

const ENRICHED_QUESTIONS = enrichQuestionsWithEntityIds(ILK10_QUESTIONS)
const LIVE_QUESTIONS = ENRICHED_QUESTIONS.filter(
  (question) => !question.designExample && isAllowedLiveQuestion(question)
)

function parseStoredState(rawValue: string | null): Ilk10StoredState | null {
  try {
    if (!rawValue) return null

    const parsed = JSON.parse(rawValue) as Partial<Ilk10StoredState>
    return {
      foundIndexes: Array.isArray(parsed.foundIndexes) ? parsed.foundIndexes : [],
      missCount: typeof parsed.missCount === "number" ? parsed.missCount : 0,
      guessEvents: Array.isArray(parsed.guessEvents) ? parsed.guessEvents : [],
      completedAt: typeof parsed.completedAt === "string" ? parsed.completedAt : undefined,
    }
  } catch {
    return null
  }
}

function rehydrateStoredState(question: Ilk10Question, storedState: Ilk10StoredState): Ilk10StoredState {
  let nextState = createInitialIlk10State()

  for (const event of storedState.guessEvents) {
    const outcome = applyIlk10Guess(
      question,
      nextState,
      event.guess,
      event.timestamp ? new Date(event.timestamp) : new Date(),
      event.entityId
    )

    if (outcome.status === "correct" || outcome.status === "incorrect") {
      nextState = outcome.nextState
    }
  }

  if (!nextState.completedAt && storedState.completedAt && isIlk10Finished(question, nextState)) {
    nextState.completedAt = storedState.completedAt
  }

  return nextState
}

function compareStoredStates(
  question: Ilk10Question,
  left: Ilk10StoredState,
  right: Ilk10StoredState
): number {
  const leftFinished = Number(isIlk10Finished(question, left))
  const rightFinished = Number(isIlk10Finished(question, right))
  if (leftFinished !== rightFinished) return leftFinished - rightFinished

  if (left.foundIndexes.length !== right.foundIndexes.length) {
    return left.foundIndexes.length - right.foundIndexes.length
  }

  if (left.guessEvents.length !== right.guessEvents.length) {
    return left.guessEvents.length - right.guessEvents.length
  }

  if (left.missCount !== right.missCount) {
    return right.missCount - left.missCount
  }

  return (Date.parse(left.completedAt ?? "") || 0) - (Date.parse(right.completedAt ?? "") || 0)
}

function loadStoredState(
  question: Ilk10Question,
  questionId: string,
  dateKey: string,
  storageKey: string,
  storagePrefix = ""
): Ilk10StoredState {
  if (typeof window === "undefined") {
    return createInitialIlk10State()
  }

  const legacyStorageKey = `${storagePrefix}${getIlk10StorageKey(questionId, dateKey)}`
  const candidateKeys = new Set<string>([storageKey, legacyStorageKey])
  const versionedPrefix = `${storagePrefix}ilk10:${questionId}:${dateKey}:`

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)
    if (!key) continue
    if (key === storageKey || key === legacyStorageKey || key.startsWith(versionedPrefix)) {
      candidateKeys.add(key)
    }
  }

  let bestState: Ilk10StoredState | null = null

  for (const candidateKey of Array.from(candidateKeys)) {
    const parsed = parseStoredState(localStorage.getItem(candidateKey))
    if (!parsed) continue

    const rehydrated = rehydrateStoredState(question, parsed)
    if (!bestState || compareStoredStates(question, rehydrated, bestState) > 0) {
      bestState = rehydrated
    }
  }

  return bestState ?? createInitialIlk10State()
}

function parseDateKeyInput(dateKey: string | null | undefined): Date | null {
  if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return null
  }

  const [year, month, day] = dateKey.split("-").map(Number)
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null
  }

  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
}

function shiftDateKey(dateKey: string, dayDelta: number): string {
  const baseDate = parseDateKeyInput(dateKey)
  if (!baseDate) {
    return dateKey
  }

  const shifted = new Date(baseDate.getTime())
  shifted.setUTCDate(shifted.getUTCDate() + dayDelta)
  return getTurkeyDateKey(shifted)
}

export function Ilk10GamePage({
  adminMode = false,
  forcedDateKey = null,
  onForcedDateChange,
}: Ilk10GamePageProps) {
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const selectedDate = useMemo(
    () => (adminMode ? parseDateKeyInput(forcedDateKey) ?? currentDate : currentDate),
    [adminMode, currentDate, forcedDateKey]
  )
  const dailyPick = useMemo(
    () => pickDailyIlk10Question(LIVE_QUESTIONS, selectedDate, ILK10_DATE_OVERRIDES, ILK10_DATE_INSERTIONS),
    [selectedDate]
  )
  const dailyQuestion = dailyPick.question
  const dailyCacheToken = useMemo(
    () => getIlk10QuestionCacheToken(dailyQuestion),
    [dailyQuestion]
  )
  const storagePrefix = adminMode ? ADMIN_STORAGE_PREFIX : ""
  const dailyStorageKey = useMemo(
    () => `${storagePrefix}${getIlk10StorageKey(dailyQuestion.id, dailyPick.dateKey, dailyCacheToken)}`,
    [dailyCacheToken, dailyPick.dateKey, dailyQuestion.id, storagePrefix]
  )
  const dailyGameNumber = dailyPick.dayIndex
  const [gameState, setGameState] = useState<Ilk10StoredState>(createInitialIlk10State)
  const [loadedStorageKey, setLoadedStorageKey] = useState<string | null>(null)
  const [guess, setGuess] = useState("")
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1)
  const [feedback, setFeedback] = useState("")
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const [showSummary, setShowSummary] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  const [boardFx, setBoardFx] = useState<{ kind: "success" | "error"; key: number; answerIndex?: number } | null>(
    null
  )
  const inputRef = useRef<HTMLInputElement | null>(null)
  const boardFxTimeoutRef = useRef<number | null>(null)

  // Scan animation: sweeps rows 9→0 (bottom to top) with yellow highlight
  const SCAN_STEP_MS = 250
  const [scanRow, setScanRow] = useState(-1) // -1 = inactive, 0-9 = current highlighted row
  const scanDataRef = useRef<{
    matchRow: number // answer index on hit, -1 on miss
    outcome: ReturnType<typeof applyIlk10Guess>
  } | null>(null)
  const scanTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (scanRow < 0 || !scanDataRef.current) return

    const { matchRow, outcome } = scanDataRef.current

    // Hit: hold green on the matched row, then resolve
    if (scanRow === matchRow) {
      scanTimerRef.current = window.setTimeout(() => {
        setScanRow(-1)
        setGameState(outcome.nextState)
        setFeedback(getIlk10StatusMessage(outcome.status))
        scanDataRef.current = null
        setBoardFx({ kind: "success", key: Date.now(), answerIndex: matchRow })
        boardFxTimeoutRef.current = window.setTimeout(() => {
          setBoardFx(null)
          inputRef.current?.focus()
        }, 600)
      }, 400)
      return () => { if (scanTimerRef.current) window.clearTimeout(scanTimerRef.current) }
    }

    // Advance to next row, or resolve miss if past row 0
    scanTimerRef.current = window.setTimeout(() => {
      const nextRow = scanRow - 1
      if (nextRow < 0 && matchRow === -1) {
        setScanRow(-1)
        setGameState(outcome.nextState)
        setFeedback(getIlk10StatusMessage(outcome.status))
        scanDataRef.current = null
        setBoardFx({ kind: "error", key: Date.now() })
        boardFxTimeoutRef.current = window.setTimeout(() => {
          setBoardFx(null)
          inputRef.current?.focus()
        }, 450)
      } else {
        setScanRow(nextRow)
      }
    }, SCAN_STEP_MS)

    return () => { if (scanTimerRef.current) window.clearTimeout(scanTimerRef.current) }
  }, [scanRow])

  useLayoutEffect(() => {
    const storedState = loadStoredState(
      dailyQuestion,
      dailyQuestion.id,
      dailyPick.dateKey,
      dailyStorageKey,
      storagePrefix
    )
    setGameState(storedState)
    setLoadedStorageKey(dailyStorageKey)
    setShowSummary(isIlk10Finished(dailyQuestion, storedState))
    setGuess("")
    setFeedback("")
    setShareCopied(false)
    inputRef.current?.focus()
  }, [dailyPick.dateKey, dailyQuestion, dailyStorageKey, storagePrefix])

  useEffect(() => {
    return () => {
      if (boardFxTimeoutRef.current) window.clearTimeout(boardFxTimeoutRef.current)
      if (scanTimerRef.current) window.clearTimeout(scanTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (adminMode) return
    if (typeof window === "undefined") return

    const refreshCurrentDate = () => setCurrentDate(new Date())

    const intervalId = window.setInterval(refreshCurrentDate, 60_000)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        refreshCurrentDate()
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("focus", refreshCurrentDate)

    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("focus", refreshCurrentDate)
    }
  }, [adminMode])

  useEffect(() => {
    if (loadedStorageKey !== dailyStorageKey) return

    try {
      localStorage.setItem(dailyStorageKey, JSON.stringify(gameState))
    } catch {
      // ignore storage errors
    }
  }, [dailyStorageKey, gameState, loadedStorageKey])

  const remainingLives = getRemainingLives(gameState)
  const solved = isIlk10Solved(dailyQuestion, gameState)
  const finished = isIlk10Finished(dailyQuestion, gameState)
  const interactionLocked = finished || Boolean(boardFx) || scanRow >= 0

  useEffect(() => {
    if (finished) {
      setShowSummary(true)
    }
  }, [finished])

  const foundSet = useMemo(() => new Set(gameState.foundIndexes), [gameState.foundIndexes])
  const wrongGuesses = useMemo(
    () => gameState.guessEvents.filter((event) => !event.correct).map((event) => event.guess),
    [gameState.guessEvents]
  )
  const revealedAnswerLabels = useMemo(() => {
    const labels = new Map<number, string>()
    for (const event of gameState.guessEvents) {
      if (!event.correct || event.answerIndex === undefined) continue
      labels.set(event.answerIndex, event.guess)
    }
    return labels
  }, [gameState.guessEvents])
  const entityAutocompletePool = useMemo(() => {
    const entityType = dailyQuestion.entityType
    const basePool = AUTOCOMPLETE_BY_ENTITY[entityType] ?? []
    const normalizedBaseLabels = new Set(
      basePool.flatMap((suggestion) => [
        normalizeIlk10Answer(suggestion.label),
        ...suggestion.aliases.map((alias) => normalizeIlk10Answer(alias)),
      ])
    )
    const syntheticSuggestions = dailyQuestion.answers
      .map((answer, index) => {
        const normalizedValue = normalizeIlk10Answer(answer.value)
        if (!normalizedValue || normalizedBaseLabels.has(normalizedValue)) {
          return null
        }

        return createSyntheticSuggestion(
          `answer:${dailyQuestion.id}:${index}`,
          entityType,
          answer.value,
          answer.aliases ?? [],
          answer.entityId
        )
      })
      .filter((suggestion): suggestion is IndexedAutocompleteSuggestion => Boolean(suggestion))

    return [...syntheticSuggestions, ...basePool]
  }, [dailyQuestion])
  const autocompleteSuggestions = useMemo(() => {
    const normalizedGuess = normalizeIlk10Answer(guess)
    if (!normalizedGuess || finished) {
      return []
    }

    const ranked = entityAutocompletePool
      .map((suggestion) => {
        const rank = getSuggestionMatchRank(suggestion, normalizedGuess)
        if (rank === null) return null

        return {
          suggestion,
          rank,
        }
      })
      .filter((entry): entry is { suggestion: IndexedAutocompleteSuggestion; rank: number } => Boolean(entry))
      .sort((left, right) => {
        if (left.rank !== right.rank) return left.rank - right.rank
        if (left.suggestion.label.length !== right.suggestion.label.length) {
          return left.suggestion.label.length - right.suggestion.label.length
        }
        return left.suggestion.label.localeCompare(right.suggestion.label)
      })

    return ranked.slice(0, AUTOCOMPLETE_LIMIT).map((entry) => entry.suggestion)
  }, [entityAutocompletePool, finished, guess])
  const shareText = useMemo(
    () => buildIlk10ShareText(dailyQuestion, gameState, dailyGameNumber),
    [dailyGameNumber, dailyQuestion, gameState]
  )
  const adminDateValue = forcedDateKey ?? dailyPick.dateKey

  const getRevealedAnswerLabel = (answer: Ilk10Answer, index: number) => {
    if (answer.displayValue) {
      return answer.displayValue
    }

    return revealedAnswerLabels.get(index) ?? answer.value
  }

  useEffect(() => {
    setActiveSuggestionIndex(autocompleteSuggestions.length > 0 ? 0 : -1)
  }, [autocompleteSuggestions])

  const submitGuess = (rawGuess = guess, guessedEntityId?: string) => {
    if (interactionLocked) return

    const resolvedGuess = resolveGuessToAnswerValue(dailyQuestion.answers, rawGuess)
    const normalizedRaw = normalizeIlk10Answer(resolvedGuess)
    const resolvedEntityId = guessedEntityId ?? getExactUniqueSuggestionEntityId(entityAutocompletePool, normalizedRaw)
    const matchesAnswerDirectly = dailyQuestion.answers.some((answer) =>
      getExactAnswerTerms(answer).includes(normalizedRaw)
    )
    const isInPool = getExactMatchingSuggestions(entityAutocompletePool, normalizedRaw).length > 0
    if (!isInPool && !matchesAnswerDirectly) {
      setFeedback("Listeden bir isim seç")
      return
    }

    const outcome = applyIlk10Guess(dailyQuestion, gameState, resolvedGuess, new Date(), resolvedEntityId)

    // For correct/incorrect guesses, start scan animation (delays state update)
    if (
      (outcome.status === "correct" && outcome.guessEvent?.answerIndex !== undefined) ||
      outcome.status === "incorrect"
    ) {
      setGuess("")
      setActiveSuggestionIndex(-1)
      setFeedback("")
      if (boardFxTimeoutRef.current) window.clearTimeout(boardFxTimeoutRef.current)

      const matchRow =
        outcome.status === "correct" ? (outcome.guessEvent!.answerIndex ?? -1) : -1
      scanDataRef.current = { matchRow, outcome }
      setScanRow(9) // start from bottom
      return
    }

    // Other statuses (invalid, already_found, etc.) — apply immediately
    setGameState(outcome.nextState)
    setGuess("")
    setActiveSuggestionIndex(-1)
    setFeedback(getIlk10StatusMessage(outcome.status))
    inputRef.current?.focus()
  }

  const chooseSuggestion = (suggestion: IndexedAutocompleteSuggestion) => {
    const matchingAnswerIndexes = getMatchingAnswerIndexesBySuggestion(dailyQuestion.answers, suggestion)
    const suggestionEntityId = getSuggestionResolvedEntityId(suggestion)

    if (matchingAnswerIndexes.length === 1) {
      submitGuess(dailyQuestion.answers[matchingAnswerIndexes[0]].value, suggestionEntityId)
      return
    }

    submitGuess(suggestion.label, suggestionEntityId)
  }

  const copyShareText = async () => {
    try {
      await navigator.clipboard.writeText(shareText)
      setShareCopied(true)
      window.setTimeout(() => setShareCopied(false), 1800)
    } catch {
      setShareCopied(false)
    }
  }

  const clearAdminProgress = () => {
    if (!adminMode || typeof window === "undefined") return

    const storageKeysToRemove = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
      .filter((key): key is string => Boolean(key))
      .filter((key) => key.startsWith(`${ADMIN_STORAGE_PREFIX}ilk10:${dailyQuestion.id}:${dailyPick.dateKey}`))

    for (const key of storageKeysToRemove) {
      localStorage.removeItem(key)
    }

    const resetState = createInitialIlk10State()
    setGameState(resetState)
    setLoadedStorageKey(dailyStorageKey)
    setShowSummary(false)
    setGuess("")
    setFeedback("")
    setShareCopied(false)
    setActiveSuggestionIndex(-1)
    setScanRow(-1)
    scanDataRef.current = null
    setBoardFx(null)
    inputRef.current?.focus()
  }

  return (
    <main className="relative min-h-screen gradient-dark text-white p-3 sm:p-6 flex flex-col overflow-y-auto">
      {boardFx && (
        <div
          key={boardFx.key}
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 z-10 ${
            boardFx.kind === "success" ? "ilk10-board-flash-success" : "ilk10-board-flash-error"
          }`}
        />
      )}
      <div className="w-full max-w-md sm:max-w-lg mx-auto flex flex-col">
        {adminMode && (
          <div className="mb-4 rounded-2xl border border-amber-400/20 bg-black/30 p-3 text-sm text-slate-200">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="font-mono text-xs uppercase tracking-[0.2em] text-amber-300">Staging Admin</span>
              <span className="text-xs text-slate-400">{dailyPick.dateKey}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                className="bg-slate-800/70 hover:bg-slate-700 border border-white/10 text-white"
                onClick={() => onForcedDateChange?.(shiftDateKey(adminDateValue, -1))}
              >
                Onceki Gun
              </Button>
              <input
                type="date"
                value={adminDateValue}
                onChange={(event) => onForcedDateChange?.(event.target.value)}
                className="h-9 rounded-lg border border-white/10 bg-slate-900/70 px-3 text-sm text-white outline-none focus:border-amber-400/50"
              />
              <Button
                type="button"
                size="sm"
                className="bg-slate-800/70 hover:bg-slate-700 border border-white/10 text-white"
                onClick={() => onForcedDateChange?.(shiftDateKey(adminDateValue, 1))}
              >
                Sonraki Gun
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-red-900/40 hover:bg-red-800/50 border border-red-400/20 text-red-100"
                onClick={clearAdminProgress}
              >
                Testi Sifirla
              </Button>
            </div>
            <div className="mt-2 text-xs text-slate-400">
              <span className="font-mono text-slate-300">{dailyQuestion.id}</span>
              {" · "}
              <span>{dailyQuestion.shortLabel}</span>
            </div>
          </div>
        )}
        {/* Hearts + title at top */}
        <header className="flex flex-col items-center gap-2 pt-2 pb-4">
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center justify-center gap-2 sm:justify-start">
              {Array.from({ length: ILK10_MAX_LIVES }, (_, index) => (
                <Heart
                  key={index}
                  className={
                    index < remainingLives
                      ? "h-6 w-6 fill-red-500 text-red-500"
                      : "h-6 w-6 text-slate-600"
                  }
                />
              ))}
            </div>
            {!adminMode && (
              <div className="flex w-full flex-wrap items-center justify-center gap-2 sm:w-auto sm:justify-end">
                <Button
                  onClick={() => setShowLeaderboard(true)}
                  className="flex-1 bg-slate-800/70 hover:bg-slate-700 border border-white/10 text-white rounded-xl text-sm sm:flex-none"
                  size="sm"
                >
                  <Trophy className="h-4 w-4 mr-2 text-emerald-400" />
                  Skor Tablosu
                </Button>
                {finished && (
                  <Button
                    onClick={() => setShowSummary(true)}
                    className="flex-1 bg-emerald-700/80 hover:bg-emerald-600 border border-emerald-400/20 text-white rounded-xl text-sm sm:flex-none"
                    size="sm"
                  >
                    <Share2 className="h-4 w-4 mr-2" />
                    Paylaş
                  </Button>
                )}
              </div>
            )}
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight font-mono uppercase">
            ilk10!
          </h1>
        </header>

        {/* Wrong guesses */}
        {wrongGuesses.length > 0 && (
          <div className="flex flex-wrap gap-1.5 justify-center mb-2">
            {wrongGuesses.map((wrongGuess) => (
              <span
                key={wrongGuess}
                className="rounded-lg bg-red-900/30 border border-red-500/30 px-3 py-1 text-sm text-red-300 line-through"
              >
                {wrongGuess}
              </span>
            ))}
          </div>
        )}

        {/* Answer slots */}
        <div className="glass rounded-2xl p-2 sm:p-3">
          <ul className="flex flex-col gap-2">
            {dailyQuestion.answers.map((answer, index) => {
              const found = foundSet.has(index)
              const missedReveal = finished && !found
              const revealed = found || missedReveal
              const revealedScoreLabel = revealed ? answer.scoreLabel : undefined
              const waveDelay = `${(dailyQuestion.answers.length - 1 - index) * 70}ms`
              const slotWaveActive = boardFx?.kind === "success"
              const slotHit = boardFx?.kind === "success" && boardFx.answerIndex === index

              // Scan animation states
              const isScanTarget = scanRow === index
              const isScanHit = isScanTarget && scanDataRef.current?.matchRow === index

              // Slot color: scan states take priority
              let slotColor: string
              if (isScanHit) {
                slotColor = "bg-emerald-500/30 border-emerald-400/60 text-white"
              } else if (isScanTarget) {
                slotColor = "bg-yellow-500/20 border-yellow-400/40 text-yellow-200"
              } else if (missedReveal) {
                slotColor = "bg-yellow-500/20 border-yellow-400/40 text-yellow-100"
              } else if (revealed) {
                slotColor = "gradient-card-success border-emerald-400/30 text-white"
              } else {
                slotColor = "bg-slate-900/40 border-white/5 text-slate-500"
              }

              return (
                <li
                  key={answer.value}
                  style={{ ["--ilk10-wave-delay" as string]: waveDelay }}
                  className={`relative flex items-center gap-3 overflow-hidden rounded-lg px-4 py-3 border transition-colors duration-150 ${slotColor} ${slotWaveActive ? "ilk10-slot-wave" : ""} ${slotHit ? "ilk10-slot-hit" : ""}`}
                >
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-md font-mono text-sm font-bold transition-colors duration-150 ${
                      isScanHit
                        ? "bg-emerald-600/40 text-white"
                      : isScanTarget
                          ? "bg-yellow-500/30 text-yellow-100"
                          : missedReveal
                            ? "bg-yellow-500/30 text-yellow-100"
                          : revealed
                            ? "bg-black/25 text-emerald-100"
                            : "bg-slate-800/60 text-slate-500"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span className={`flex-1 text-base ${isScanHit ? "font-bold" : "font-semibold"}`}>
                    {revealed
                      ? found
                        ? getRevealedAnswerLabel(answer, index)
                        : (answer.displayValue ?? answer.value)
                      : "• • •"}
                  </span>
                  {revealedScoreLabel && (
                    <span
                      className={`shrink-0 rounded-md border px-2 py-1 font-mono text-xs font-bold ${
                        missedReveal
                          ? "border-yellow-300/50 bg-yellow-500/20 text-yellow-100"
                          : "border-emerald-300/35 bg-black/25 text-emerald-100"
                      }`}
                    >
                      {revealedScoreLabel}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>

        {/* Prompt below board */}
        <p className="text-slate-300 text-base text-center px-2 leading-snug mx-auto pt-3 pb-1">
          {dailyQuestion.prompt}
        </p>

        {/* Input area */}
        <div className="mt-2 flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={guess}
              onChange={(event) => setGuess(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" && autocompleteSuggestions.length > 0) {
                  event.preventDefault()
                  setActiveSuggestionIndex((current) => (current + 1) % autocompleteSuggestions.length)
                  return
                }

                if (event.key === "ArrowUp" && autocompleteSuggestions.length > 0) {
                  event.preventDefault()
                  setActiveSuggestionIndex((current) =>
                    current <= 0 ? autocompleteSuggestions.length - 1 : current - 1
                  )
                  return
                }

                if (
                  event.key === "Enter" &&
                  autocompleteSuggestions.length > 0 &&
                  activeSuggestionIndex >= 0
                ) {
                  event.preventDefault()
                  chooseSuggestion(autocompleteSuggestions[activeSuggestionIndex])
                  return
                }

                if (event.key === "Enter") submitGuess()
              }}
              disabled={interactionLocked}
              placeholder={`${getEntityTypeLabel(dailyQuestion.entityType)} ara...`}
              className="flex-1 h-12 rounded-xl glass px-4 text-base text-white placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-emerald-400/50 disabled:opacity-50"
            />
            <Button
              onClick={() => submitGuess()}
              disabled={interactionLocked}
              className="h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-6 text-base font-bold text-white border border-emerald-400/30 active:scale-[0.97]"
            >
              Tahmin
            </Button>
          </div>
          {autocompleteSuggestions.length > 0 && (
            <div className="glass-light rounded-xl border border-white/10 p-1.5">
              <ul className="flex max-h-52 flex-col gap-1 overflow-y-auto">
                {autocompleteSuggestions.map((suggestion, index) => (
                  <li key={suggestion.id}>
                    <button
                      type="button"
                      onClick={() => chooseSuggestion(suggestion)}
                      className={`w-full rounded-lg px-3 py-2.5 text-left text-base transition-colors ${
                        index === activeSuggestionIndex
                          ? "bg-emerald-500/20 text-white"
                          : "text-slate-200 hover:bg-white/5"
                      }`}
                    >
                      {highlightMatch(suggestion.labelWithMeta, guess)}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-sm text-center text-slate-400 min-h-[1.25rem]">{feedback}</p>
        </div>
      </div>

      {/* Footer - matches original game */}
      <footer className="pt-2 pb-1 flex justify-center">
        <div className="flex items-center gap-4 rounded-full border border-white/15 bg-black/35 px-3 py-1.5 text-sm leading-none text-slate-200 backdrop-blur-sm">
          <a
            href="/"
            className="inline-flex items-center gap-1.5 hover:text-white transition-colors"
            aria-label="Ana sayfaya dön"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-current">
              <path d="M12 3L2 12h3v8h6v-6h2v6h6v-8h3L12 3z" />
            </svg>
            Ana Sayfa
          </a>
          <a
            href={ILK11_PATH}
            className="inline-flex items-center gap-1.5 hover:text-white transition-colors"
          >
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-sky-400/50 text-[10px] font-bold text-sky-300">
              11
            </span>
            İlk11
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
            otaliptus/ilk11
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

      {/* Summary dialog */}
      <Dialog open={showSummary} onOpenChange={setShowSummary}>
        <DialogContent className="glass border-white/10 text-white sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-2xl font-extrabold font-mono text-center">
              {solved ? "Çözüldü!" : "Oyun bitti"}
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-400 text-center">
              {dailyQuestion.prompt}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 mt-2">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="glass-light rounded-lg p-2">
                <p className="text-[10px] uppercase tracking-wider text-slate-400">Skor</p>
                <p className="text-xl font-bold font-mono text-emerald-400">
                  {gameState.foundIndexes.length}/10
                </p>
              </div>
              <div className="glass-light rounded-lg p-2">
                <p className="text-[10px] uppercase tracking-wider text-slate-400">Can</p>
                <p className="text-xl font-bold font-mono text-red-400">{remainingLives}</p>
              </div>
              <div className="glass-light rounded-lg p-2">
                <p className="text-[10px] uppercase tracking-wider text-slate-400">Tahmin</p>
                <p className="text-xl font-bold font-mono text-slate-200">
                  {gameState.guessEvents.length}
                </p>
              </div>
            </div>

            <pre className="rounded-lg glass-light p-3 text-xs text-slate-200 font-mono whitespace-pre-wrap">
              {shareText}
            </pre>

            <Button
              onClick={copyShareText}
              className="rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold h-11 border border-emerald-400/30"
            >
              <Copy className="h-4 w-4 mr-2" />
              {shareCopied ? "Kopyalandı" : "Paylaş"}
            </Button>
            {!adminMode && (
              <LeaderboardSubmit
                game="ilk10"
                submissionKey={`${dailyQuestion.id}_${dailyPick.dateKey}`}
                gameDate={dailyPick.dateKey}
                payload={{
                  question_id: dailyQuestion.id,
                  question_label: dailyQuestion.shortLabel,
                  found: gameState.foundIndexes.length,
                  lives_used: gameState.missCount,
                  is_complete: isIlk10Solved(dailyQuestion, gameState),
                }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
      {!adminMode && (
        <LeaderboardModal
          open={showLeaderboard}
          onOpenChange={setShowLeaderboard}
          activeGame="ilk10"
          isGameComplete={isIlk10Finished(dailyQuestion, gameState)}
        />
      )}
    </main>
  )
}

export default function Ilk10Page() {
  return <Ilk10GamePage />
}
