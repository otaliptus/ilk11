"use client"

import { useEffect, useState } from "react"
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
import type { Ilk10ScoreSubmission, Ilk11ScoreSubmission } from "@/types/leaderboard"

type Ilk11Props = {
  game: "ilk11"
  submissionKey: string
  gameDate?: string
  payload: Omit<Ilk11ScoreSubmission, "game" | "nickname" | "game_date">
}

type Ilk10Props = {
  game: "ilk10"
  submissionKey: string
  gameDate?: string
  payload: Omit<Ilk10ScoreSubmission, "game" | "nickname" | "game_date">
}

type LeaderboardSubmitProps = Ilk11Props | Ilk10Props

export function LeaderboardSubmit(props: LeaderboardSubmitProps) {
  const { game, submissionKey } = props
  const [nickname, setNickname] = useState(getStoredNickname() ?? "")
  const [submitted, setSubmitted] = useState(isAlreadySubmitted(game, submissionKey))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const gameDate = props.gameDate ?? getTurkeyDateKey()

  useEffect(() => {
    setSubmitted(isAlreadySubmitted(game, submissionKey))
    setError(null)
  }, [game, submissionKey])

  const handleSubmit = async () => {
    const trimmed = nickname.trim()
    if (!trimmed || trimmed.length > 20) {
      setError("Rumuz 1-20 karakter olmalı")
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      if (props.game === "ilk11") {
        await submitScore({
          game: "ilk11",
          nickname: trimmed,
          game_date: gameDate,
          ...props.payload,
        })
      } else {
        await submitScore({
          game: "ilk10",
          nickname: trimmed,
          game_date: gameDate,
          ...props.payload,
        })
      }
      setStoredNickname(trimmed)
      markAsSubmitted(game, submissionKey)
      setSubmitted(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gönderme hatası")
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="flex items-center justify-center gap-2 text-emerald-400 text-sm mt-3">
        <CheckCircle2 className="h-4 w-4" />
        <span>Skor gönderildi!</span>
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
          onFocus={(e) => {
            const target = e.target
            setTimeout(() => target.scrollIntoView({ behavior: "smooth", block: "center" }), 300)
          }}
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
              Gönder
            </>
          )}
        </Button>
      </div>
      {error && <p className="text-xs text-red-400 text-center mt-1">{error}</p>}
    </div>
  )
}
