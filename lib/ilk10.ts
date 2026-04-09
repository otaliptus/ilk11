import type { Ilk10GuessEvent, Ilk10Question, Ilk10StoredState } from "@/types/ilk10"
import { GAME_TIME_ZONE, getTurkeyDateKey, getTurkeyDayIndex } from "@/lib/date"

const MAX_LIVES = 3

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

export function pickDailyIlk10Question(
  questions: Ilk10Question[],
  date = new Date()
): { question: Ilk10Question; dayIndex: number; dateKey: string } {
  if (questions.length === 0) {
    throw new Error("No ilk10 questions configured")
  }

  const dayIndex = getTurkeyDayIndex(date)
  const dateKey = getTurkeyDateKey(date)
  const seed = fnv1a32(`${GAME_TIME_ZONE}:${dateKey}:ilk10`)
  const rng = mulberry32(seed)
  const questionIndex = Math.floor(rng() * questions.length)

  return {
    question: questions[questionIndex],
    dayIndex,
    dateKey,
  }
}

export function getIlk10StorageKey(questionId: string, dateKey: string): string {
  return `ilk10:${questionId}:${dateKey}`
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
  foundIndexes: number[]
): { answerIndex: number; normalizedGuess: string } | null {
  const normalizedGuess = normalizeIlk10Answer(rawGuess)
  if (!normalizedGuess) {
    return null
  }

  const foundSet = new Set(foundIndexes)

  for (let answerIndex = 0; answerIndex < question.answers.length; answerIndex += 1) {
    if (foundSet.has(answerIndex)) continue

    const answer = question.answers[answerIndex]
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
  date = new Date()
): {
  nextState: Ilk10StoredState
  guessEvent: Ilk10GuessEvent | null
  status: "empty" | "duplicate" | "correct" | "incorrect"
} {
  const normalizedGuess = normalizeIlk10Answer(rawGuess)
  if (!normalizedGuess) {
    return { nextState: state, guessEvent: null, status: "empty" }
  }

  const duplicateGuess = state.guessEvents.some((event) => event.normalizedGuess === normalizedGuess)
  if (duplicateGuess) {
    return { nextState: state, guessEvent: null, status: "duplicate" }
  }

  const match = matchIlk10Answer(question, rawGuess, state.foundIndexes)
  const guessEvent: Ilk10GuessEvent = {
    guess: rawGuess.trim(),
    normalizedGuess,
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
  const answerLine = question.answers
    .map((_, index) => (foundSet.has(index) ? "🟩" : "⬛"))
    .join("")
  const livesLeft = "♥".repeat(getRemainingLives(state)) || "0"

  return [
    `Top10 #${gameNumber}`,
    question.shortLabel,
    `${state.foundIndexes.length}/10 • ${livesLeft}`,
    answerLine,
    "ilk10.otalitpus.com",
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
