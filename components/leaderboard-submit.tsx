"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { CheckCircle2, Send } from "lucide-react"
import {
  submitScore,
  getStoredNickname,
  setStoredNickname,
  isAlreadySubmitted,
  markAsSubmitted,
} from "@/lib/leaderboard"
import { getTurkeyDateKey } from "@/lib/date"

interface LeaderboardSubmitProps {
  gameId: number
  difficulty: "easy" | "hard"
  matchName: string
  solved: number
  totalAttempts: number
  failed: number
  isComplete: boolean
}

export function LeaderboardSubmit({
  gameId,
  difficulty,
  matchName,
  solved,
  totalAttempts,
  failed,
  isComplete,
}: LeaderboardSubmitProps) {
  const [nickname, setNickname] = useState(getStoredNickname() ?? "")
  const [submitted, setSubmitted] = useState(isAlreadySubmitted(gameId, difficulty))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    const trimmed = nickname.trim()
    if (!trimmed || trimmed.length > 20) {
      setError("Rumuz 1-20 karakter olmali")
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      await submitScore({
        nickname: trimmed,
        game_date: getTurkeyDateKey(),
        difficulty,
        game_id: gameId,
        match_name: matchName,
        solved,
        total_attempts: totalAttempts,
        failed,
        is_complete: isComplete,
      })
      setStoredNickname(trimmed)
      markAsSubmitted(gameId, difficulty)
      setSubmitted(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gonderme hatasi")
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="flex items-center justify-center gap-2 text-emerald-400 text-sm mt-3">
        <CheckCircle2 className="h-4 w-4" />
        <span>Skor gonderildi!</span>
      </div>
    )
  }

  return (
    <div className="mt-4 pt-4 border-t border-white/10 w-full">
      <p className="text-xs text-slate-400 text-center mb-2">Skor Tablosu</p>
      <div className="flex gap-2">
        <input
          type="text"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="Rumuz"
          maxLength={20}
          className="flex-1 bg-slate-800/60 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
        />
        <Button
          onClick={handleSubmit}
          disabled={submitting || !nickname.trim()}
          className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm px-3 disabled:opacity-50"
          size="sm"
        >
          {submitting ? (
            <span className="animate-pulse">...</span>
          ) : (
            <>
              <Send className="h-3.5 w-3.5 mr-1" />
              Gonder
            </>
          )}
        </Button>
      </div>
      {error && <p className="text-xs text-red-400 text-center mt-1">{error}</p>}
    </div>
  )
}
