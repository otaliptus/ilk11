"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Trophy } from "lucide-react"
import { fetchLeaderboard } from "@/lib/leaderboard"
import { getLastNDates, formatDateForDisplay } from "@/lib/date"
import type { LeaderboardResponse } from "@/types/leaderboard"

interface LeaderboardModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function LeaderboardModal({ open, onOpenChange }: LeaderboardModalProps) {
  const dates = getLastNDates(7)
  const [selectedDate, setSelectedDate] = useState(dates[0])
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="font-mono sm:max-w-md glass rounded-2xl flex flex-col items-center max-h-[85vh]">
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

        {/* Match info */}
        {data && (data.matches.easy || data.matches.hard) && (
          <div className="w-full text-xs text-slate-300 space-y-1 px-1">
            {data.matches.easy && (
              <div className="flex items-center gap-2">
                <span className="bg-emerald-600/60 text-emerald-100 px-1.5 py-0.5 rounded text-[10px] font-bold flex-shrink-0">
                  Easy
                </span>
                <span className="truncate">{data.matches.easy}</span>
              </div>
            )}
            {data.matches.hard && (
              <div className="flex items-center gap-2">
                <span className="bg-red-700/60 text-red-100 px-1.5 py-0.5 rounded text-[10px] font-bold flex-shrink-0">
                  Hard
                </span>
                <span className="truncate">{data.matches.hard}</span>
              </div>
            )}
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

          {!loading && !error && data?.rankings.length === 0 && (
            <div className="text-center py-8 text-sm text-slate-400">
              Henuz skor yok
            </div>
          )}

          {!loading &&
            !error &&
            data?.rankings.map((entry, i) => {
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
                  key={`${entry.nickname}-${entry.difficulty}-${i}`}
                  className={`flex items-center gap-2 px-2 py-2 ${
                    i % 2 === 0 ? "bg-slate-800/20" : ""
                  } rounded-lg`}
                >
                  {/* Rank */}
                  <span className="w-8 text-center text-sm font-bold text-slate-400 flex-shrink-0">
                    {rankDisplay}
                  </span>

                  {/* Nickname */}
                  <span className="flex-1 text-sm text-white truncate font-medium">
                    {entry.nickname}
                  </span>

                  {/* Difficulty badge */}
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${
                      entry.difficulty === "easy"
                        ? "bg-emerald-600/40 text-emerald-200"
                        : "bg-red-700/40 text-red-200"
                    }`}
                  >
                    {entry.difficulty === "easy" ? "E" : "H"}
                  </span>

                  {/* Score */}
                  <span className="w-20 text-right text-sm flex-shrink-0">
                    {entry.is_complete ? (
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
