"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ILK10_QUESTIONS } from "@/data/ilk10-questions"
import AUTOCOMPLETE_DATA from "@/registry/output/autocomplete.json"
import {
  ILK10_MAX_LIVES,
  applyIlk10Guess,
  buildIlk10ShareText,
  createInitialIlk10State,
  getIlk10QuestionCacheToken,
  getIlk10StatusMessage,
  getIlk10StorageKey,
  getRemainingLives,
  isIlk10Finished,
  isIlk10Solved,
  normalizeIlk10Answer,
  pickDailyIlk10Question,
} from "@/lib/ilk10"
import { getTurkeyDateKey } from "@/lib/date"
import { ILK11_PATH } from "@/lib/routes"
import type { Ilk10Answer, Ilk10EntityType, Ilk10StoredState } from "@/types/ilk10"
import { LeaderboardModal } from "@/components/leaderboard-modal"
import { LeaderboardSubmit } from "@/components/leaderboard-submit"
import { Copy, Heart, Trophy } from "lucide-react"
const AUTOCOMPLETE_LIMIT = 8

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
  entityType: Exclude<Ilk10EntityType, "team">
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
  entityType: Exclude<Ilk10EntityType, "team">,
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

const AUTOCOMPLETE_BY_ENTITY = Object.fromEntries(
  Object.entries((AUTOCOMPLETE_DATA.byEntityType ?? {}) as Record<string, AutocompleteSuggestion[]>).map(
    ([entityType, suggestions]) => [
      entityType,
      suggestions.map((suggestion) => ({
        ...suggestion,
        resolvedEntityId: suggestion.id,
        searchTerms: uniqueTerms([
          suggestion.searchKey,
          normalizeIlk10Answer(suggestion.label),
          ...suggestion.aliases.map((alias) => normalizeIlk10Answer(alias)),
          ...getSearchTokens(suggestion.label),
          ...suggestion.aliases.flatMap((alias) => getSearchTokens(alias)),
        ]),
      })),
    ]
  )
) as Record<Exclude<Ilk10EntityType, "team">, IndexedAutocompleteSuggestion[]>

function enrichQuestionsWithEntityIds(questions: typeof ILK10_QUESTIONS): typeof ILK10_QUESTIONS {
  return questions.map((question) => {
    if (question.entityType === "team") {
      return question
    }

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

function isAllowedLiveQuestion(question: (typeof ILK10_QUESTIONS)[number]): boolean {
  if (question.entityType === "coach" || question.entityType === "referee") {
    return true
  }

  const searchableText = `${question.shortLabel} ${question.prompt}`
  return /\bGoals\b/i.test(searchableText) ||
    /\bAssists\b/i.test(searchableText) ||
    /\bOn Target\b/i.test(searchableText) ||
    /\bxG\b/i.test(searchableText)
}

const ENRICHED_QUESTIONS = enrichQuestionsWithEntityIds(ILK10_QUESTIONS)
const LIVE_QUESTIONS = ENRICHED_QUESTIONS.filter(
  (question) => !question.designExample && isAllowedLiveQuestion(question)
)
const ILK10_DATE_OVERRIDES: Record<string, string> = {
  "2026-04-12": "super-lig-title-coaches",
  "2026-04-19": "turkish-super-cup-winning-coaches",
}
const DAILY_PICK = pickDailyIlk10Question(LIVE_QUESTIONS, new Date(), ILK10_DATE_OVERRIDES)
const DAILY_QUESTION = DAILY_PICK.question
const DAILY_CACHE_TOKEN = getIlk10QuestionCacheToken(DAILY_QUESTION)
const DAILY_STORAGE_KEY = getIlk10StorageKey(DAILY_QUESTION.id, DAILY_PICK.dateKey, DAILY_CACHE_TOKEN)
const DAILY_GAME_NUMBER = DAILY_PICK.dayIndex

function loadStoredState(): Ilk10StoredState {
  if (typeof window === "undefined") {
    return createInitialIlk10State()
  }

  try {
    const rawValue = localStorage.getItem(DAILY_STORAGE_KEY)
    if (!rawValue) return createInitialIlk10State()

    const parsed = JSON.parse(rawValue) as Partial<Ilk10StoredState>
    return {
      foundIndexes: Array.isArray(parsed.foundIndexes) ? parsed.foundIndexes : [],
      missCount: typeof parsed.missCount === "number" ? parsed.missCount : 0,
      guessEvents: Array.isArray(parsed.guessEvents) ? parsed.guessEvents : [],
      completedAt: typeof parsed.completedAt === "string" ? parsed.completedAt : undefined,
    }
  } catch {
    return createInitialIlk10State()
  }
}

export default function Ilk10Page() {
  const [gameState, setGameState] = useState<Ilk10StoredState>(createInitialIlk10State)
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

  useEffect(() => {
    const storedState = loadStoredState()
    setGameState(storedState)
    if (isIlk10Finished(DAILY_QUESTION, storedState)) {
      setShowSummary(true)
    }
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    return () => {
      if (boardFxTimeoutRef.current) window.clearTimeout(boardFxTimeoutRef.current)
      if (scanTimerRef.current) window.clearTimeout(scanTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return

    const reloadIfDateChanged = () => {
      if (getTurkeyDateKey(new Date()) !== DAILY_PICK.dateKey) {
        window.location.reload()
      }
    }

    const intervalId = window.setInterval(reloadIfDateChanged, 60_000)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        reloadIfDateChanged()
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("focus", reloadIfDateChanged)

    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("focus", reloadIfDateChanged)
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(DAILY_STORAGE_KEY, JSON.stringify(gameState))
    } catch {
      // ignore storage errors
    }
  }, [gameState])

  const remainingLives = getRemainingLives(gameState)
  const solved = isIlk10Solved(DAILY_QUESTION, gameState)
  const finished = isIlk10Finished(DAILY_QUESTION, gameState)
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
    if (DAILY_QUESTION.entityType === "team") {
      return []
    }

    const entityType = DAILY_QUESTION.entityType
    const basePool = AUTOCOMPLETE_BY_ENTITY[entityType] ?? []
    const normalizedBaseLabels = new Set(
      basePool.flatMap((suggestion) => [
        normalizeIlk10Answer(suggestion.label),
        ...suggestion.aliases.map((alias) => normalizeIlk10Answer(alias)),
      ])
    )
    const syntheticSuggestions = DAILY_QUESTION.answers
      .map((answer, index) => {
        const normalizedValue = normalizeIlk10Answer(answer.value)
        if (!normalizedValue || normalizedBaseLabels.has(normalizedValue)) {
          return null
        }

        return createSyntheticSuggestion(
          `answer:${DAILY_QUESTION.id}:${index}`,
          entityType,
          answer.value,
          answer.aliases ?? [],
          answer.entityId
        )
      })
      .filter((suggestion): suggestion is IndexedAutocompleteSuggestion => Boolean(suggestion))

    return [...syntheticSuggestions, ...basePool]
  }, [])
  const autocompleteSuggestions = useMemo(() => {
    const normalizedGuess = normalizeIlk10Answer(guess)
    if (!normalizedGuess || finished || DAILY_QUESTION.entityType === "team") {
      return []
    }

    const ranked = entityAutocompletePool
      .map((suggestion) => {
        const exactMatch = suggestion.searchTerms.some((term) => term === normalizedGuess)
        const prefixMatch = suggestion.searchTerms.some((term) => term.startsWith(normalizedGuess))
        const containsMatch = suggestion.searchTerms.some((term) => term.includes(normalizedGuess))
        if (!exactMatch && !prefixMatch && !containsMatch) return null

        return {
          suggestion,
          rank: exactMatch ? 0 : prefixMatch ? 1 : 2,
        }
      })
      .filter((entry): entry is { suggestion: IndexedAutocompleteSuggestion; rank: number } => Boolean(entry))
      .sort((left, right) => {
        if (left.rank !== right.rank) return left.rank - right.rank
        return left.suggestion.label.localeCompare(right.suggestion.label)
      })

    return ranked.slice(0, AUTOCOMPLETE_LIMIT).map((entry) => entry.suggestion)
  }, [entityAutocompletePool, finished, guess])
  const shareText = useMemo(
    () => buildIlk10ShareText(DAILY_QUESTION, gameState, DAILY_GAME_NUMBER),
    [gameState]
  )

  useEffect(() => {
    setActiveSuggestionIndex(autocompleteSuggestions.length > 0 ? 0 : -1)
  }, [autocompleteSuggestions])

  const submitGuess = (rawGuess = guess, guessedEntityId?: string) => {
    if (interactionLocked) return

    const resolvedGuess = resolveGuessToAnswerValue(DAILY_QUESTION.answers, rawGuess)
    const normalizedRaw = normalizeIlk10Answer(resolvedGuess)
    const resolvedEntityId = guessedEntityId ?? getExactUniqueSuggestionEntityId(entityAutocompletePool, normalizedRaw)
    const matchesAnswerDirectly = DAILY_QUESTION.answers.some((answer) =>
      getExactAnswerTerms(answer).includes(normalizedRaw)
    )
    const isInPool = getExactMatchingSuggestions(entityAutocompletePool, normalizedRaw).length > 0
    if (!isInPool && !matchesAnswerDirectly) {
      setFeedback("Listeden bir isim seç")
      return
    }

    const outcome = applyIlk10Guess(DAILY_QUESTION, gameState, resolvedGuess, new Date(), resolvedEntityId)

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
    const matchingAnswerIndexes = getMatchingAnswerIndexesBySuggestion(DAILY_QUESTION.answers, suggestion)
    const suggestionEntityId = getSuggestionResolvedEntityId(suggestion)

    if (matchingAnswerIndexes.length === 1) {
      submitGuess(DAILY_QUESTION.answers[matchingAnswerIndexes[0]].value, suggestionEntityId)
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
        {/* Hearts + title at top */}
        <header className="flex flex-col items-center gap-2 pt-2 pb-4">
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center gap-2">
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
            <Button
              onClick={() => setShowLeaderboard(true)}
              className="bg-slate-800/70 hover:bg-slate-700 border border-white/10 text-white rounded-xl text-sm"
              size="sm"
            >
              <Trophy className="h-4 w-4 mr-2 text-emerald-400" />
              Skor Tablosu
            </Button>
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
            {DAILY_QUESTION.answers.map((answer, index) => {
              const found = foundSet.has(index)
              const missedReveal = finished && !found
              const revealed = found || missedReveal
              const waveDelay = `${(DAILY_QUESTION.answers.length - 1 - index) * 70}ms`
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
                        ? (revealedAnswerLabels.get(index) ?? answer.value)
                        : answer.value
                      : "• • •"}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>

        {/* Prompt below board */}
        <p className="text-slate-300 text-base text-center px-2 leading-snug mx-auto pt-3 pb-1">
          {DAILY_QUESTION.prompt}
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
              placeholder={`${getEntityTypeLabel(DAILY_QUESTION.entityType)} ara...`}
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
              {DAILY_QUESTION.prompt}
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
            <LeaderboardSubmit
              game="ilk10"
              submissionKey={`${DAILY_QUESTION.id}_${DAILY_PICK.dateKey}`}
              payload={{
                question_id: DAILY_QUESTION.id,
                question_label: DAILY_QUESTION.shortLabel,
                found: gameState.foundIndexes.length,
                lives_used: gameState.missCount,
                is_complete: isIlk10Solved(DAILY_QUESTION, gameState),
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
      <LeaderboardModal
        open={showLeaderboard}
        onOpenChange={setShowLeaderboard}
        activeGame="ilk10"
        isGameComplete={isIlk10Finished(DAILY_QUESTION, gameState)}
      />
    </main>
  )
}
