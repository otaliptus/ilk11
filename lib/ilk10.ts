import type { Ilk10GuessEvent, Ilk10Question, Ilk10StoredState } from "@/types/ilk10"
import { GAME_TIME_ZONE, getTurkeyDateKey, getTurkeyDayIndex } from "@/lib/date"
import { ILK10_SHARE_DOMAIN } from "@/lib/site"

const MAX_LIVES = 3
const GOALKEEPER_DEDUP_EPOCH = "2026-04-11"

const CHARACTER_MAP: Record<string, string> = {
  C: "C",
  c: "C",
  G: "G",
  g: "G",
  I: "I",
  i: "I",
  O: "O",
  o: "O",
  S: "S",
  s: "S",
  U: "U",
  u: "U",
  Ç: "C",
  ç: "C",
  Ğ: "G",
  ğ: "G",
  İ: "I",
  ı: "I",
  Ö: "O",
  ö: "O",
  Ş: "S",
  ş: "S",
  Ü: "U",
  ü: "U",
}

function normalizeCharacters(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split("")
    .map((character) => CHARACTER_MAP[character] ?? character)
    .join("")
}

export function normalizeIlk10Answer(input: string): string {
  return normalizeCharacters(input)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
}

function fnv1a32(input: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
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

function dayIndexToDateKey(dayIndex: number): string {
  const date = new Date(dayIndex * 86_400_000)
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`
}

function buildQuestionOrder(questions: Ilk10Question[], rng: () => number): Ilk10Question[] {
  const orderedQuestions = [...questions]
  for (let index = orderedQuestions.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1))
    ;[orderedQuestions[index], orderedQuestions[swapIndex]] = [orderedQuestions[swapIndex], orderedQuestions[index]]
  }
  return orderedQuestions
}

function isGoalkeeperQuestion(question: Ilk10Question): boolean {
  return question.id.includes("-gk-") || /\bgoalkeepers?\b/i.test(question.prompt)
}

function pickLegacyIlk10Question(questions: Ilk10Question[], dateKey: string): Ilk10Question {
  const seed = fnv1a32(`${GAME_TIME_ZONE}:${dateKey}:ilk10`)
  const rng = mulberry32(seed)
  return questions[Math.floor(rng() * questions.length)]
}

function pickGoalkeeperSafeIlk10Question(
  questions: Ilk10Question[],
  dateKey: string,
  previousQuestion: Ilk10Question | null
): Ilk10Question {
  const orderedQuestions = buildQuestionOrder(
    questions,
    mulberry32(fnv1a32(`${GAME_TIME_ZONE}:${dateKey}:ilk10:v2`))
  )

  if (!previousQuestion || !isGoalkeeperQuestion(previousQuestion)) {
    return orderedQuestions[0]
  }

  return orderedQuestions.find((question) => !isGoalkeeperQuestion(question)) ?? orderedQuestions[0]
}

export function pickDailyIlk10Question(
  questions: Ilk10Question[],
  date = new Date(),
  questionIdOverrides: Record<string, string> = {}
): { question: Ilk10Question; dayIndex: number; dateKey: string } {
  if (questions.length === 0) {
    throw new Error("No ilk10 questions configured")
  }

  const dayIndex = getTurkeyDayIndex(date)
  const dateKey = getTurkeyDateKey(date)
  const overrideQuestionId = questionIdOverrides[dateKey]
  if (overrideQuestionId) {
    const overriddenQuestion = questions.find((question) => question.id === overrideQuestionId)
    if (overriddenQuestion) {
      return {
        question: overriddenQuestion,
        dayIndex,
        dateKey,
      }
    }
  }

  const [epochYear, epochMonth, epochDay] = GOALKEEPER_DEDUP_EPOCH.split("-").map(Number)
  const epochDayIndex = Math.floor(Date.UTC(epochYear, epochMonth - 1, epochDay) / 86_400_000)

  let question: Ilk10Question

  if (dayIndex < epochDayIndex) {
    question = pickLegacyIlk10Question(questions, dateKey)
  } else {
    let previousQuestion = pickLegacyIlk10Question(questions, dayIndexToDateKey(epochDayIndex - 1))
    question = previousQuestion

    for (let currentDayIndex = epochDayIndex; currentDayIndex <= dayIndex; currentDayIndex += 1) {
      const currentDateKey = dayIndexToDateKey(currentDayIndex)
      question = pickGoalkeeperSafeIlk10Question(questions, currentDateKey, previousQuestion)
      previousQuestion = question
    }
  }

  return {
    question,
    dayIndex,
    dateKey,
  }
}

export function getIlk10QuestionCacheToken(question: Ilk10Question): string {
  const fingerprint = [
    question.id,
    question.shortLabel,
    question.prompt,
    question.entityType,
    question.category,
    ...question.answers.map((answer) =>
      [
        answer.value,
        answer.entityId ?? "",
        ...(answer.aliases ?? []),
      ].join("|")
    ),
  ].join("::")

  return fnv1a32(fingerprint).toString(36)
}

export function getIlk10StorageKey(questionId: string, dateKey: string, cacheToken?: string): string {
  return cacheToken
    ? `ilk10:${questionId}:${dateKey}:${cacheToken}`
    : `ilk10:${questionId}:${dateKey}`
}

export function createInitialIlk10State(): Ilk10StoredState {
  return {
    foundIndexes: [],
    missCount: 0,
    guessEvents: [],
  }
}

export function getRemainingLives(state: Ilk10StoredState): number {
  return Math.max(0, MAX_LIVES - state.missCount)
}

export function isIlk10Solved(question: Ilk10Question, state: Ilk10StoredState): boolean {
  return state.foundIndexes.length >= question.answers.length
}

export function isIlk10Finished(question: Ilk10Question, state: Ilk10StoredState): boolean {
  return isIlk10Solved(question, state) || getRemainingLives(state) === 0
}

export function matchIlk10Answer(
  question: Ilk10Question,
  rawGuess: string,
  foundIndexes: number[],
  guessedEntityId?: string
): { answerIndex: number; normalizedGuess: string } | null {
  const normalizedGuess = normalizeIlk10Answer(rawGuess)
  if (!normalizedGuess) {
    return null
  }

  const foundSet = new Set(foundIndexes)

  for (let answerIndex = 0; answerIndex < question.answers.length; answerIndex += 1) {
    if (foundSet.has(answerIndex)) continue

    const answer = question.answers[answerIndex]
    if (guessedEntityId && answer.entityId === guessedEntityId) {
      return { answerIndex, normalizedGuess }
    }
    const candidates = [answer.value, ...(answer.aliases ?? [])]
    if (candidates.some((candidate) => normalizeIlk10Answer(candidate) === normalizedGuess)) {
      return { answerIndex, normalizedGuess }
    }
  }

  return null
}

export function applyIlk10Guess(
  question: Ilk10Question,
  state: Ilk10StoredState,
  rawGuess: string,
  date = new Date(),
  guessedEntityId?: string
): {
  nextState: Ilk10StoredState
  guessEvent: Ilk10GuessEvent | null
  status: "empty" | "duplicate" | "correct" | "incorrect"
} {
  const normalizedGuess = normalizeIlk10Answer(rawGuess)
  if (!normalizedGuess) {
    return { nextState: state, guessEvent: null, status: "empty" }
  }

  const duplicateGuess = state.guessEvents.some(
    (event) =>
      event.normalizedGuess === normalizedGuess ||
      (Boolean(guessedEntityId) && Boolean(event.entityId) && event.entityId === guessedEntityId)
  )
  if (duplicateGuess) {
    return { nextState: state, guessEvent: null, status: "duplicate" }
  }

  const match = matchIlk10Answer(question, rawGuess, state.foundIndexes, guessedEntityId)
  const guessEvent: Ilk10GuessEvent = {
    guess: rawGuess.trim(),
    normalizedGuess,
    entityId: guessedEntityId,
    correct: Boolean(match),
    answerIndex: match?.answerIndex,
    timestamp: date.toISOString(),
  }

  const nextState: Ilk10StoredState = {
    ...state,
    foundIndexes: match
      ? [...state.foundIndexes, match.answerIndex].sort((left, right) => left - right)
      : state.foundIndexes,
    missCount: match ? state.missCount : state.missCount + 1,
    guessEvents: [...state.guessEvents, guessEvent],
  }

  if (isIlk10Finished(question, nextState) && !nextState.completedAt) {
    nextState.completedAt = date.toISOString()
  }

  return {
    nextState,
    guessEvent,
    status: match ? "correct" : "incorrect",
  }
}

export function buildIlk10ShareText(
  question: Ilk10Question,
  state: Ilk10StoredState,
  gameNumber: number
): string {
  const foundSet = new Set(state.foundIndexes)
  const slotEmojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"]
  const answerLine = question.answers
    .map((_, index) => (foundSet.has(index) ? slotEmojis[index] ?? "✅" : "❌"))
    .join("")
  const guessesLeft = getRemainingLives(state)
  const expandedShortLabel = question.shortLabel.replace(
    /^(\d{4})-(\d{2}|\d{4})\s+(.+)$/,
    (_, startYearText: string, endYearText: string, suffix: string) => {
      const startYear = Number(startYearText)
      if (!Number.isInteger(startYear)) {
        return question.shortLabel
      }

      let endYear = Number(endYearText)
      if (!Number.isInteger(endYear)) {
        return question.shortLabel
      }

      if (endYearText.length === 2) {
        endYear += Math.floor(startYear / 100) * 100
        if (endYear < startYear) {
          endYear += 100
        }
      }

      return `${startYear} - ${endYear} ${suffix}`
    }
  )
  const shareUrl = /^https?:\/\//.test(ILK10_SHARE_DOMAIN) ? ILK10_SHARE_DOMAIN : `https://${ILK10_SHARE_DOMAIN}`

  return [
    shareUrl,
    `Top10 #${gameNumber}`,
    expandedShortLabel,
    `${state.foundIndexes.length}/10 correct - ${guessesLeft} ${guessesLeft === 1 ? "guess" : "guesses"} left`,
    answerLine,
  ].join("\n")
}

export function getIlk10StatusMessage(status: "empty" | "duplicate" | "correct" | "incorrect"): string {
  switch (status) {
    case "empty":
      return "Enter a guess."
    case "duplicate":
      return "Already tried that."
    case "correct":
      return "Correct!"
    case "incorrect":
      return "Not on the list."
    default:
      return ""
  }
}

export const ILK10_MAX_LIVES = MAX_LIVES
