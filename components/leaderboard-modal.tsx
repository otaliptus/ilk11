"use client"

import { useState, useEffect, useMemo } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Trophy } from "lucide-react"
import { fetchLeaderboard } from "@/lib/leaderboard"
import { getLastNDates, formatDateForDisplay } from "@/lib/date"
import type {
  GameKey,
  Ilk10LeaderboardEntry,
  Ilk10LeaderboardResponse,
  Ilk11LeaderboardEntry,
  Ilk11LeaderboardResponse,
  LeaderboardResponse,
} from "@/types/leaderboard"

interface LeaderboardModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The game the user is currently playing (determines default tab + spoiler-hide logic). */
  activeGame: GameKey
  /** Whether the player has completed today's instance of `activeGame`. */
  isGameComplete: boolean
  /** For ilk11 only: which difficulty the player is on. Ignored for ilk10. */
  ilk11Difficulty?: "easy" | "hard"
}

function isIlk11Response(res: LeaderboardResponse): res is Ilk11LeaderboardResponse {
  return res.game === "ilk11"
}

function isIlk10Response(res: LeaderboardResponse): res is Ilk10LeaderboardResponse {
  return res.game === "ilk10"
}

export function LeaderboardModal({
  open,
  onOpenChange,
  activeGame,
  isGameComplete,
  ilk11Difficulty,
}: LeaderboardModalProps) {
  const dates = getLastNDates(7)
  const [selectedDate, setSelectedDate] = useState(dates[0])
  const [selectedGame, setSelectedGame] = useState<GameKey>(activeGame)
  const [selectedDifficulty, setSelectedDifficulty] = useState<"easy" | "hard">(ilk11Difficulty ?? "easy")
  const [data, setData] = useState<LeaderboardResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    fetchLeaderboard(selectedGame, selectedDate)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Yükleme hatası"))
      .finally(() => setLoading(false))
  }, [open, selectedDate, selectedGame])

  const today = dates[0]

  // Hide today's scores until the user finishes (only for their active game).
  const hideScores =
    selectedDate === today &&
    (selectedGame === activeGame
      ? selectedGame === "ilk11"
        ? selectedDifficulty === (ilk11Difficulty ?? "easy") && !isGameComplete
        : !isGameComplete
      : true)

  const ilk11Rankings = useMemo<Ilk11LeaderboardEntry[]>(() => {
    if (!data || !isIlk11Response(data)) return []
    const filtered = data.rankings.filter((e) => e.difficulty === selectedDifficulty)
    let rank = 1
    return filtered.map((entry, i) => {
      if (i > 0) {
        const prev = filtered[i - 1]
        const isTie =
          entry.is_complete === prev.is_complete &&
          entry.solved === prev.solved &&
          entry.total_attempts === prev.total_attempts
        if (!isTie) rank = i + 1
      }
      return { ...entry, rank }
    })
  }, [data, selectedDifficulty])

  const ilk10Rankings = useMemo<Ilk10LeaderboardEntry[]>(() => {
    if (!data || !isIlk10Response(data)) return []
    return data.rankings
  }, [data])

  const ilk11MatchName =
    data && isIlk11Response(data) ? data.matches[selectedDifficulty] ?? null : null
  const ilk10QuestionLabel = data && isIlk10Response(data) ? data.question_label : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="font-mono sm:max-w-md glass rounded-2xl flex flex-col items-center min-h-[60vh] max-h-[85vh]">
        <DialogHeader className="w-full">
          <div className="flex items-center justify-center gap-2">
            <Trophy className="h-6 w-6 text-emerald-400" />
            <DialogTitle className="text-white text-lg">Skor Tablosu</DialogTitle>
          </div>
        </DialogHeader>

        {/* Game switcher */}
        <div className="flex gap-1 w-full">
          <button
            onClick={() => setSelectedGame("ilk11")}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              selectedGame === "ilk11"
                ? "bg-sky-600 text-white"
                : "bg-slate-700/50 text-slate-400 hover:bg-slate-600/50"
            }`}
          >
            İlk 11
          </button>
          <button
            onClick={() => setSelectedGame("ilk10")}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              selectedGame === "ilk10"
                ? "bg-emerald-600 text-white"
                : "bg-slate-700/50 text-slate-400 hover:bg-slate-600/50"
            }`}
          >
            İlk 10
          </button>
        </div>

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

        {/* ilk11 difficulty toggle (only when showing ilk11) */}
        {selectedGame === "ilk11" && (
          <div className="flex gap-1 w-full">
            <button
              onClick={() => setSelectedDifficulty("easy")}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                selectedDifficulty === "easy"
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-700/50 text-slate-400 hover:bg-slate-600/50"
              }`}
            >
              Kolay
            </button>
            <button
              onClick={() => setSelectedDifficulty("hard")}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                selectedDifficulty === "hard"
                  ? "bg-red-600 text-white"
                  : "bg-slate-700/50 text-slate-400 hover:bg-slate-600/50"
              }`}
            >
              Zor
            </button>
          </div>
        )}

        {/* Match / question subtitle */}
        {selectedGame === "ilk11" && ilk11MatchName && (
          <div className="w-full text-xs text-slate-300 px-1">
            <span className="block break-words">{ilk11MatchName}</span>
          </div>
        )}
        {selectedGame === "ilk10" && ilk10QuestionLabel && (
          <div className="w-full text-xs text-slate-300 px-1">
            <span className="block break-words">{ilk10QuestionLabel}</span>
          </div>
        )}

        {/* Rankings */}
        <div className="w-full overflow-y-auto flex-1 min-h-0 mt-1">
          {loading && (
            <div className="space-y-2 p-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-10 rounded-lg bg-slate-700/30 animate-pulse" />
              ))}
            </div>
          )}

          {!loading && error && (
            <div className="text-center py-8 text-sm text-red-400">{error}</div>
          )}

          {!loading && !error && selectedGame === "ilk11" && ilk11Rankings.length === 0 && (
            <div className="text-center py-8 text-sm text-slate-400">Henüz skor yok</div>
          )}
          {!loading && !error && selectedGame === "ilk10" && ilk10Rankings.length === 0 && (
            <div className="text-center py-8 text-sm text-slate-400">Henüz skor yok</div>
          )}

          {!loading && !error && selectedGame === "ilk11" &&
            ilk11Rankings.map((entry, i) => {
              const rankDisplay =
                entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : `${entry.rank}`
              return (
                <div
                  key={`${entry.nickname}-${i}`}
                  className={`flex items-center gap-2 px-2 py-2 ${i % 2 === 0 ? "bg-slate-800/20" : ""} rounded-lg`}
                >
                  <span className="w-8 text-center text-sm font-bold text-slate-400 flex-shrink-0">
                    {hideScores ? "-" : rankDisplay}
                  </span>
                  <span className="flex-1 text-sm text-white truncate font-medium">{entry.nickname}</span>
                  <span className="w-20 text-right text-sm flex-shrink-0">
                    {hideScores ? (
                      <span className="text-slate-500">•••</span>
                    ) : entry.is_complete ? (
                      <span className="text-emerald-300 font-bold">
                        {entry.solved}/11{" "}
                        <span className="text-slate-400 font-normal text-xs">({entry.total_attempts})</span>
                      </span>
                    ) : (
                      <span className="text-red-400">❌</span>
                    )}
                  </span>
                </div>
              )
            })}

          {!loading && !error && selectedGame === "ilk10" &&
            ilk10Rankings.map((entry, i) => {
              const rankDisplay =
                entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : `${entry.rank}`
              return (
                <div
                  key={`${entry.nickname}-${i}`}
                  className={`flex items-center gap-2 px-2 py-2 ${i % 2 === 0 ? "bg-slate-800/20" : ""} rounded-lg`}
                >
                  <span className="w-8 text-center text-sm font-bold text-slate-400 flex-shrink-0">
                    {hideScores ? "-" : rankDisplay}
                  </span>
                  <span className="flex-1 text-sm text-white truncate font-medium">{entry.nickname}</span>
                  <span className="w-20 text-right text-sm flex-shrink-0">
                    {hideScores ? (
                      <span className="text-slate-500">•••</span>
                    ) : entry.is_complete ? (
                      <span className="text-emerald-300 font-bold">
                        {entry.found}/10{" "}
                        <span className="text-slate-400 font-normal text-xs">(-{entry.lives_used}♥)</span>
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
