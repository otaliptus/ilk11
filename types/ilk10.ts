export type Ilk10EntityType = "player" | "coach" | "referee" | "team"

export type Ilk10QuestionCategory =
  | "club-overlap"
  | "all-time"
  | "derby"
  | "title-race"
  | "europe"

export interface Ilk10Answer {
  value: string
  aliases?: string[]
}

export interface Ilk10Question {
  id: string
  prompt: string
  shortLabel: string
  entityType: Ilk10EntityType
  category: Ilk10QuestionCategory
  answers: Ilk10Answer[]
  sourceLabel: string
  sourceUrl?: string
  note?: string
  designExample?: boolean
}

export interface Ilk10GuessEvent {
  guess: string
  normalizedGuess: string
  correct: boolean
  answerIndex?: number
  timestamp: string
}

export interface Ilk10StoredState {
  foundIndexes: number[]
  missCount: number
  guessEvents: Ilk10GuessEvent[]
  completedAt?: string
}
