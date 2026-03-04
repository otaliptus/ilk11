export interface ScoreSubmission {
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

export interface LeaderboardEntry {
  rank: number
  nickname: string
  difficulty: "easy" | "hard"
  solved: number
  total_attempts: number
  failed: number
  is_complete: boolean
}

export interface LeaderboardResponse {
  date: string
  matches: {
    easy: string | null
    hard: string | null
  }
  rankings: LeaderboardEntry[]
}
