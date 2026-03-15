"use client"

import { useState, useEffect, useMemo } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Trophy } from "lucide-react"
import { fetchLeaderboard } from "@/lib/leaderboard"
import { getLastNDates, formatDateForDisplay } from "@/lib/date"
import type { LeaderboardResponse } from "@/types/leaderboard"

interface LeaderboardModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Whether the player has completed their current difficulty's game */
  isGameComplete: boolean
  /** The difficulty the player is currently playing */
  difficulty: "easy" | "hard"
}

export function LeaderboardModal({ open, onOpenChange, isGameComplete, difficulty }: LeaderboardModalProps) {
  const dates = getLastNDates(7)
  const [selectedDate, setSelectedDate] = useState(dates[0])
  const [selectedDifficulty, setSelectedDifficulty] = useState<"easy" | "hard">(difficulty)
  const [data, setData] = useState<LeaderboardResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return

    setLoading(true)
    setError(null)
    fetchLeaderboard(selectedDate)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Yukleme hatasi"))
      .finally(() => setLoading(false))
  }, [open, selectedDate])

  const today = dates[0]

  // Scores are hidden for today when:
  // - viewing your own difficulty and you haven't finished yet, OR
  // - viewing the other difficulty (you can't spoil scores you haven't played)
  const hideScores =
    selectedDate === today &&
    (selectedDifficulty === difficulty ? !isGameComplete : true)

  // Filter by difficulty and re-rank
  const filteredRankings = useMemo(() => {
    if (!data) return []
    const filtered = data.rankings.filter((e) => e.difficulty === selectedDifficulty)

    // Re-rank: complete games first sorted by solved DESC, attempts ASC
    let rank = 1
    return filtered.map((entry, i) => {
      if (i > 0) {
        const prev = filtered[i - 1]
        const isTie =
          (entry.is_complete === prev.is_complete) &&
          entry.solved === prev.solved &&
          entry.total_attempts === prev.total_attempts
        if (!isTie) rank = i + 1
      }
      return { ...entry, rank }
    })
  }, [data, selectedDifficulty])

  const matchName = data?.matches[selectedDifficulty] ?? null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="font-mono sm:max-w-md glass rounded-2xl flex flex-col items-center min-h-[60vh] max-h-[85vh]">
        <DialogHeader className="w-full">
          <div className="flex items-center justify-center gap-2">
            <Trophy className="h-6 w-6 text-emerald-400" />
            <DialogTitle className="text-white text-lg">Skor Tablosu</DialogTitle>
          </div>
        </DialogHeader>

        {/* Day selector */}
        <div className="grid grid-cols-7 gap-1 w-full py-1">
          {dates.map((date) => {
            const { dayName, dayNumber } = formatDateForDisplay(date)
            const isSelected = date === selectedDate
            const isToday = date === today
            return (
              <button
                key={date}
                onClick={() => setSelectedDate(date)}
                className={`flex flex-col items-center py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  isSelected
                    ? "bg-emerald-600 text-white"
                    : isToday
                      ? "bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30"
                      : "bg-slate-700/50 text-slate-300 hover:bg-slate-600/50"
                }`}
              >
                <span className="text-[10px] leading-none">{dayName}</span>
                <span className="text-sm leading-tight">{dayNumber}</span>
              </button>
            )
          })}
        </div>

        {/* Difficulty toggle */}
        <div className="flex gap-1 w-full">
          <button
            onClick={() => setSelectedDifficulty("easy")}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              selectedDifficulty === "easy"
                ? "bg-emerald-600 text-white"
                : "bg-slate-700/50 text-slate-400 hover:bg-slate-600/50"
            }`}
          >
            Easy
          </button>
          <button
            onClick={() => setSelectedDifficulty("hard")}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              selectedDifficulty === "hard"
                ? "bg-red-600 text-white"
                : "bg-slate-700/50 text-slate-400 hover:bg-slate-600/50"
            }`}
          >
            Hard
          </button>
        </div>

        {/* Match info */}
        {matchName && (
          <div className="w-full text-xs text-slate-300 px-1">
            <span className="block break-words">{matchName}</span>
          </div>
        )}

        {/* Rankings */}
        <div className="w-full overflow-y-auto flex-1 min-h-0 mt-1">
          {loading && (
            <div className="space-y-2 p-2">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="h-10 rounded-lg bg-slate-700/30 animate-pulse"
                />
              ))}
            </div>
          )}

          {!loading && error && (
            <div className="text-center py-8 text-sm text-red-400">{error}</div>
          )}

          {!loading && !error && filteredRankings.length === 0 && (
            <div className="text-center py-8 text-sm text-slate-400">
              Henuz skor yok
            </div>
          )}

          {!loading &&
            !error &&
            filteredRankings.map((entry, i) => {
              const rankDisplay =
                entry.rank === 1
                  ? "🥇"
                  : entry.rank === 2
                    ? "🥈"
                    : entry.rank === 3
                      ? "🥉"
                      : `${entry.rank}`

              return (
                <div
                  key={`${entry.nickname}-${i}`}
                  className={`flex items-center gap-2 px-2 py-2 ${
                    i % 2 === 0 ? "bg-slate-800/20" : ""
                  } rounded-lg`}
                >
                  {/* Rank */}
                  <span className="w-8 text-center text-sm font-bold text-slate-400 flex-shrink-0">
                    {hideScores ? "-" : rankDisplay}
                  </span>

                  {/* Nickname */}
                  <span className="flex-1 text-sm text-white truncate font-medium">
                    {entry.nickname}
                  </span>

                  {/* Score */}
                  <span className="w-20 text-right text-sm flex-shrink-0">
                    {hideScores ? (
                      <span className="text-slate-500">•••</span>
                    ) : entry.is_complete ? (
                      <span className="text-emerald-300 font-bold">
                        {entry.solved}/11{" "}
                        <span className="text-slate-400 font-normal text-xs">
                          ({entry.total_attempts})
                        </span>
                      </span>
                    ) : (
                      <span className="text-red-400">❌</span>
                    )}
                  </span>
                </div>
              )
            })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
