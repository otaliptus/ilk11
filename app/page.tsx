"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Trophy } from "lucide-react"
import { LeaderboardModal } from "@/components/leaderboard-modal"
import { ILK10_PATH, ILK11_PATH } from "@/lib/routes"
import { ILK10_QUESTIONS } from "@/data/ilk10-questions"
import { pickDailyIlk10Question } from "@/lib/ilk10"

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

  useEffect(() => {
    setIlk10Teaser(getIlk10TodayTeaser())
  }, [])

  return (
    <main className="min-h-screen relative gradient-dark text-white flex flex-col">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.10),transparent_55%)]" />

      <div className="relative mx-auto w-full max-w-md sm:max-w-lg px-5 pt-8 sm:pt-12 pb-6 flex-1 flex flex-col">
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

        <section className="flex-1 flex flex-col justify-center gap-3 py-8">
          <Link
            href={ILK11_PATH}
            className="group relative py-6 rounded-xl bg-sky-700/50 hover:bg-sky-600/60 border border-sky-500/30 hover:border-sky-500/50 text-white transition-all duration-200 flex flex-col items-center gap-1.5 active:scale-[0.97]"
          >
            <span className="text-2xl font-extrabold font-mono tracking-wide">İlk 11</span>
          </Link>

          <Link
            href={ILK10_PATH}
            className="group relative py-6 rounded-xl bg-emerald-600/60 hover:bg-emerald-500/70 border border-emerald-400/30 hover:border-emerald-400/50 text-white transition-all duration-200 flex flex-col items-center gap-1.5 active:scale-[0.97]"
          >
            <span className="text-2xl font-extrabold font-mono tracking-wide">İlk 10</span>
            {ilk10Teaser && (
              <span className="text-[11px] font-normal text-emerald-100/80">Bugün · {ilk10Teaser}</span>
            )}
          </Link>
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
              otaliptus/ilk11
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
