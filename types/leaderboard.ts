export type GameKey = "ilk10" | "ilk11"

// ---- ilk11 ----

export interface Ilk11ScoreSubmission {
  game: "ilk11"
  nickname: string
  game_date: string
  difficulty: "easy" | "hard"
  game_id: number
  match_name: string
  solved: number
  total_attempts: number
  failed: number
  is_complete: boolean
}

export interface Ilk11LeaderboardEntry {
  game: "ilk11"
  rank: number
  nickname: string
  difficulty: "easy" | "hard"
  solved: number
  total_attempts: number
  failed: number
  is_complete: boolean
}

// ---- ilk10 ----

export interface Ilk10ScoreSubmission {
  game: "ilk10"
  nickname: string
  game_date: string
  question_id: string
  question_label: string
  found: number
  lives_used: number
  is_complete: boolean
}

export interface Ilk10LeaderboardEntry {
  game: "ilk10"
  rank: number
  nickname: string
  found: number
  lives_used: number
  is_complete: boolean
}

// ---- union types ----

export type ScoreSubmission = Ilk11ScoreSubmission | Ilk10ScoreSubmission
export type LeaderboardEntry = Ilk11LeaderboardEntry | Ilk10LeaderboardEntry

export interface Ilk11LeaderboardResponse {
  game: "ilk11"
  date: string
  matches: { easy: string | null; hard: string | null }
  rankings: Ilk11LeaderboardEntry[]
}

export interface Ilk10LeaderboardResponse {
  game: "ilk10"
  date: string
  question_label: string | null
  rankings: Ilk10LeaderboardEntry[]
}

export type LeaderboardResponse = Ilk11LeaderboardResponse | Ilk10LeaderboardResponse
