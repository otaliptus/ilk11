"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Trophy } from "lucide-react"
import { LeaderboardModal } from "@/components/leaderboard-modal"
import { ILK10_PATH, ILK11_PATH } from "@/lib/routes"
import { ILK10_QUESTIONS } from "@/data/ilk10-questions"
import { pickDailyIlk10Question } from "@/lib/ilk10"

const LAST_PLAYED_KEY = "last_played_game"
const AUTO_REDIRECT_DISABLED_KEY = "last_played_auto_redirect_disabled"

type GameKey = "ilk10" | "ilk11"

const ILK10_DATE_OVERRIDES: Record<string, string> = {
  "2026-04-12": "super-lig-title-coaches",
  "2026-04-19": "turkish-super-cup-winning-coaches",
}

function getIlk10TodayTeaser(): string {
  const live = ILK10_QUESTIONS.filter((q) => !q.designExample)
  const pick = pickDailyIlk10Question(live, new Date(), ILK10_DATE_OVERRIDES)
  return pick.question.shortLabel
}

export default function LandingPage() {
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const [ilk10Teaser, setIlk10Teaser] = useState<string | null>(null)
  const [ilk11Teaser, setIlk11Teaser] = useState<string | null>(null)
  const [autoRedirectDisabled, setAutoRedirectDisabled] = useState(false)

  useEffect(() => {
    setIlk10Teaser(getIlk10TodayTeaser())
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const disabled = localStorage.getItem(AUTO_REDIRECT_DISABLED_KEY) === "1"
      setAutoRedirectDisabled(disabled)
      if (disabled) return

      const stored = localStorage.getItem(LAST_PLAYED_KEY) as GameKey | null
      if (stored === "ilk10" || stored === "ilk11") {
        const path = stored === "ilk10" ? ILK10_PATH : ILK11_PATH
        window.location.replace(path)
      }
    } catch {
      // ignore storage errors
    }
  }, [])

  // ilk11 teaser: read the easy CSV head to find today's match name.
  useEffect(() => {
    const buildId = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev"
    fetch(`/easy.csv?v=${encodeURIComponent(buildId)}`)
      .then((res) => res.text())
      .then((text) => {
        const firstDataLine = text.split("\n")[1]?.trim()
        if (!firstDataLine) return
        const match = firstDataLine.split(",")[0]?.replace(/"/g, "").trim()
        if (match) setIlk11Teaser(match)
      })
      .catch(() => {
        // ignore — teaser is optional
      })
  }, [])

  const handleToggleAutoRedirect = () => {
    try {
      const next = !autoRedirectDisabled
      setAutoRedirectDisabled(next)
      localStorage.setItem(AUTO_REDIRECT_DISABLED_KEY, next ? "1" : "0")
    } catch {
      // ignore
    }
  }

  return (
    <main className="min-h-screen relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 text-white">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.08),transparent_60%)]" />

      <div className="relative mx-auto max-w-3xl px-4 py-10 flex flex-col gap-8">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-extrabold font-mono tracking-tight">
            <span className="text-emerald-400">otaliptus</span>
            <span className="text-slate-300"> · play</span>
          </h1>
          <Button
            onClick={() => setShowLeaderboard(true)}
            className="bg-slate-800/70 hover:bg-slate-700 border border-white/10 text-white rounded-xl text-sm"
            size="sm"
          >
            <Trophy className="h-4 w-4 mr-2 text-emerald-400" />
            Skor Tablosu
          </Button>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link
            href={ILK11_PATH}
            className="group rounded-2xl border border-sky-400/20 bg-slate-900/60 p-5 hover:border-sky-400/50 transition-colors flex flex-col gap-3 min-h-[180px]"
          >
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-sky-400/50 text-sm font-bold text-sky-300">
                11
              </span>
              <h2 className="text-xl font-extrabold font-mono">İlk 11</h2>
            </div>
            <p className="text-sm text-slate-300 leading-snug">
              Bugünkü Süper Lig maçının ilk 11&apos;ini tahmin et. Easy / Hard.
            </p>
            {ilk11Teaser && (
              <p className="text-xs text-slate-400 font-mono mt-auto">Bugün: {ilk11Teaser}</p>
            )}
          </Link>

          <Link
            href={ILK10_PATH}
            className="group rounded-2xl border border-emerald-400/20 bg-slate-900/60 p-5 hover:border-emerald-400/50 transition-colors flex flex-col gap-3 min-h-[180px]"
          >
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-emerald-400/50 text-sm font-bold text-emerald-300">
                10
              </span>
              <h2 className="text-xl font-extrabold font-mono">İlk 10</h2>
            </div>
            <p className="text-sm text-slate-300 leading-snug">
              Günlük sıralama: 10 kişilik listeyi 5 canla bul.
            </p>
            {ilk10Teaser && (
              <p className="text-xs text-slate-400 font-mono mt-auto">Bugün: {ilk10Teaser}</p>
            )}
          </Link>
        </section>

        <section className="text-center">
          <label className="inline-flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRedirectDisabled}
              onChange={handleToggleAutoRedirect}
              className="accent-emerald-500"
            />
            Son oynadığım oyuna otomatik yönlendirme
          </label>
        </section>
      </div>

      <LeaderboardModal
        open={showLeaderboard}
        onOpenChange={setShowLeaderboard}
        activeGame="ilk11"
        isGameComplete={false}
      />
    </main>
  )
}
