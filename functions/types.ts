export interface Env {
  DB: D1Database
}

export interface ScoreRow {
  id: number
  nickname: string
  game_date: string
  difficulty: "easy" | "hard"
  game_id: number
  match_name: string
  solved: number
  total_attempts: number
  failed: number
  is_complete: number // SQLite stores booleans as 0/1
  submitted_at: string
}
