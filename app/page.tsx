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

  // Checkbox reads "ON" (auto-redirect enabled), which is the inverse of the stored `disabled` flag.
  const autoRedirectOn = !autoRedirectDisabled

  const handleToggleAutoRedirect = () => {
    try {
      const nextDisabled = autoRedirectOn
      setAutoRedirectDisabled(nextDisabled)
      localStorage.setItem(AUTO_REDIRECT_DISABLED_KEY, nextDisabled ? "1" : "0")
    } catch {
      // ignore
    }
  }

  return (
    <main className="min-h-screen relative gradient-dark text-white flex flex-col">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.10),transparent_55%)]" />

      <div className="relative mx-auto w-full max-w-md sm:max-w-lg px-5 pt-8 sm:pt-12 pb-6 flex-1 flex flex-col gap-6">
        <header className="flex items-center justify-between">
          <h1 className="text-lg sm:text-xl font-extrabold font-mono tracking-tight">
            <span className="text-emerald-400">otaliptus</span>
            <span className="text-slate-400"> · play</span>
          </h1>
          <Button
            onClick={() => setShowLeaderboard(true)}
            className="bg-slate-800/70 hover:bg-slate-700 active:bg-slate-800 border border-white/10 text-white rounded-full text-sm h-9 px-3"
            size="sm"
          >
            <Trophy className="h-4 w-4 mr-1.5 text-emerald-400" />
            Skor
          </Button>
        </header>

        <section>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-100 leading-tight">
            Bugün hangisi?
          </h2>
          <p className="text-sm text-slate-400 mt-1.5">
            İki günlük oyun, bir tercih. Hadi başlayalım.
          </p>
        </section>

        <section className="grid grid-cols-1 gap-3">
          <Link
            href={ILK11_PATH}
            className="group relative overflow-hidden rounded-2xl border border-sky-400/25 bg-gradient-to-br from-sky-950/60 via-slate-900/70 to-slate-900/90 p-5 transition-all duration-150 hover:border-sky-400/60 active:scale-[0.98]"
          >
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-sky-400/40 bg-sky-400/10 text-lg font-extrabold font-mono text-sky-300">
                11
              </span>
              <div className="flex-1 min-w-0">
                <h3 className="text-xl font-extrabold font-mono">İlk 11</h3>
                <p className="text-sm text-slate-300 mt-1 leading-snug">
                  Bugünkü Süper Lig maçının ilk 11&apos;ini tahmin et.
                </p>
                {ilk11Teaser && (
                  <div className="mt-3">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-400/10 border border-sky-400/25 px-2.5 py-1 text-[11px] font-mono text-sky-200">
                      <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                      Bugün · {ilk11Teaser}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </Link>

          <Link
            href={ILK10_PATH}
            className="group relative overflow-hidden rounded-2xl border border-emerald-400/25 bg-gradient-to-br from-emerald-950/60 via-slate-900/70 to-slate-900/90 p-5 transition-all duration-150 hover:border-emerald-400/60 active:scale-[0.98]"
          >
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-400/40 bg-emerald-400/10 text-lg font-extrabold font-mono text-emerald-300">
                10
              </span>
              <div className="flex-1 min-w-0">
                <h3 className="text-xl font-extrabold font-mono">İlk 10</h3>
                <p className="text-sm text-slate-300 mt-1 leading-snug">
                  Günlük sıralama: 10 kişilik listeyi 5 canla bul.
                </p>
                {ilk10Teaser && (
                  <div className="mt-3">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 border border-emerald-400/25 px-2.5 py-1 text-[11px] font-mono text-emerald-200">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      Bugün · {ilk10Teaser}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </Link>
        </section>

        <section>
          <label className="flex items-center justify-center gap-2.5 text-xs text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoRedirectOn}
              onChange={handleToggleAutoRedirect}
              className="h-4 w-4 accent-emerald-500 cursor-pointer"
            />
            <span>Son oynadığım oyuna otomatik git</span>
          </label>
        </section>

        <footer className="mt-auto pt-6 flex justify-center">
          <div className="flex items-center gap-4 rounded-full border border-white/15 bg-black/35 px-3 py-1.5 text-sm leading-none text-slate-200 backdrop-blur-sm">
            <a
              href="https://github.com/otaliptus/ilk11"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 hover:text-white transition-colors"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-current">
                <path d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2.2c-3.2.69-3.87-1.35-3.87-1.35-.52-1.32-1.28-1.67-1.28-1.67-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.72-1.54-2.56-.29-5.25-1.28-5.25-5.72 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11.02 11.02 0 0 1 5.77 0c2.2-1.49 3.16-1.18 3.16-1.18.63 1.59.24 2.76.12 3.05.73.81 1.17 1.84 1.17 3.1 0 4.45-2.69 5.43-5.26 5.72.41.36.78 1.06.78 2.14v3.17c0 .31.21.66.8.55A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
              </svg>
              GitHub
            </a>
            <a
              href="https://x.com/otaliptus"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 hover:text-white transition-colors"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-current">
                <path d="M18.901 1.153h3.68l-8.04 9.188L24 22.847h-7.406l-5.8-7.584-6.639 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932 6.064-6.933zM17.61 20.644h2.039L6.486 3.24H4.298l13.312 17.404z" />
              </svg>
              @otaliptus
            </a>
          </div>
        </footer>
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
