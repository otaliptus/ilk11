import type {
  GameKey,
  Ilk10ScoreSubmission,
  Ilk11ScoreSubmission,
  LeaderboardResponse,
  ScoreSubmission,
} from "@/types/leaderboard"

const NICKNAME_KEY = "leaderboard_nickname"

export function getStoredNickname(): string | null {
  try {
    return localStorage.getItem(NICKNAME_KEY)
  } catch {
    return null
  }
}

export function setStoredNickname(name: string): void {
  try {
    localStorage.setItem(NICKNAME_KEY, name)
  } catch {
    // ignore storage errors
  }
}

function submissionKey(game: GameKey, key: string): string {
  return `leaderboard_submitted_${game}_${key}`
}

export function isAlreadySubmitted(game: GameKey, key: string): boolean {
  try {
    return localStorage.getItem(submissionKey(game, key)) === "1"
  } catch {
    return false
  }
}

export function markAsSubmitted(game: GameKey, key: string): void {
  try {
    localStorage.setItem(submissionKey(game, key), "1")
  } catch {
    // ignore storage errors
  }
}

export async function submitScore(data: ScoreSubmission): Promise<{ success: boolean }> {
  const res = await fetch("/api/scores", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error ?? `Gönderme başarısız (${res.status})`)
  }
  return res.json()
}

export async function fetchLeaderboard(game: GameKey, date: string): Promise<LeaderboardResponse> {
  const url = `/api/scores?date=${encodeURIComponent(date)}&game=${encodeURIComponent(game)}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Skor tablosu yüklenemedi (${res.status})`)
  }
  return res.json()
}

// Narrow helper types for callers that already know their game.
export type Ilk11SubmissionInput = Omit<Ilk11ScoreSubmission, "game">
export type Ilk10SubmissionInput = Omit<Ilk10ScoreSubmission, "game">

export function submitIlk11Score(input: Ilk11SubmissionInput) {
  return submitScore({ game: "ilk11", ...input })
}

export function submitIlk10Score(input: Ilk10SubmissionInput) {
  return submitScore({ game: "ilk10", ...input })
}
