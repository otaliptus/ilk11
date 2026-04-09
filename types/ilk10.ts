export type Ilk10EntityType = "player" | "coach" | "referee" | "team"

export type Ilk10QuestionCategory =
  | "club-overlap"
  | "all-time"
  | "derby"
  | "title-race"
  | "europe"
  | "season-stats"

export interface Ilk10Answer {
  value: string
  entityId?: string
  aliases?: string[]
  sourceIds?: Record<string, string>
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
  entityId?: string
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
