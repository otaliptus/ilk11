import type { ScoreSubmission, LeaderboardResponse } from "@/types/leaderboard"

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

function submissionKey(gameId: number, difficulty: string): string {
  return `leaderboard_submitted_${gameId}_${difficulty}`
}

export function isAlreadySubmitted(gameId: number, difficulty: string): boolean {
  try {
    return localStorage.getItem(submissionKey(gameId, difficulty)) === "1"
  } catch {
    return false
  }
}

export function markAsSubmitted(gameId: number, difficulty: string): void {
  try {
    localStorage.setItem(submissionKey(gameId, difficulty), "1")
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
    throw new Error((body as { error?: string }).error ?? `Submit failed (${res.status})`)
  }
  return res.json()
}

export async function fetchLeaderboard(date: string): Promise<LeaderboardResponse> {
  const res = await fetch(`/api/scores?date=${encodeURIComponent(date)}`)
  if (!res.ok) {
    throw new Error(`Failed to load leaderboard (${res.status})`)
  }
  return res.json()
}
