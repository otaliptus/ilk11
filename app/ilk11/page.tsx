"use client"

import { useEffect, useMemo, useState } from "react"
import { Formation } from "@/components/formation"
import { DifficultySelectionModal } from "@/components/team-selection-modal"
import { assignPositions } from "@/lib/api"
import {
  type DailyPools,
  type Difficulty,
  type Ilk11DailyPayload,
  type Ilk11RuntimePoolFile,
  type Ilk11GameData,
  decodeIlk11DailyPayload,
  decodeIlk11RuntimePool,
  formatIlk11MatchLabel,
  getGameForDifficulty,
} from "@/lib/ilk11"
import { getTurkeyDateKey } from "@/lib/date"
import { ILK10_PATH } from "@/lib/routes"

const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev"
const EASY_POOL_URL = `/data/ilk11/easy.json?v=${encodeURIComponent(BUILD_ID)}`
const HARD_POOL_URL = `/data/ilk11/hard.json?v=${encodeURIComponent(BUILD_ID)}`

function dailyUrl(dateKey: string) {
  return `/data/daily/${dateKey}.json?v=${encodeURIComponent(BUILD_ID)}`
}

export default function Home() {
  const [dailyPayload, setDailyPayload] = useState<Ilk11DailyPayload | null>(null)
  const [dailyPools, setDailyPools] = useState<DailyPools | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null)
  const [gameData, setGameData] = useState<Ilk11GameData | null>(null)

  useEffect(() => {
    let isMounted = true
    const load = async () => {
      try {
        const today = getTurkeyDateKey(new Date())
        const dailyRes = await fetch(dailyUrl(today))
        if (dailyRes.ok) {
          const daily = decodeIlk11DailyPayload(await dailyRes.json(), today)
          if (isMounted) {
            setDailyPayload(daily)
            setDailyPools(null)
            setError(null)
          }
          return
        }

        const [easyRes, hardRes] = await Promise.all([
          fetch(EASY_POOL_URL),
          fetch(HARD_POOL_URL),
        ])
        if (!easyRes.ok) throw new Error(`easy.json yüklenemedi (${easyRes.status})`)
        if (!hardRes.ok) throw new Error(`hard.json yüklenemedi (${hardRes.status})`)

        const [easyPool, hardPool] = await Promise.all([
          easyRes.json() as Promise<Ilk11RuntimePoolFile>,
          hardRes.json() as Promise<Ilk11RuntimePoolFile>,
        ])
        const easyRows = decodeIlk11RuntimePool(easyPool, "easy")
        const hardRows = decodeIlk11RuntimePool(hardPool, "hard")

        if (isMounted) {
          setDailyPayload(null)
          setDailyPools({ easy: easyRows, hard: hardRows })
          setError(null)
        }
      } catch (err) {
        if (!isMounted) return
        setError(err instanceof Error ? err.message : "Bilinmeyen hata")
      }
    }
    load()
    return () => { isMounted = false }
  }, [])

  useEffect(() => {
    if (!difficulty) return
    if (dailyPayload) {
      setGameData(dailyPayload.ilk11[difficulty])
      return
    }
    if (!dailyPools) return
    try {
      const data = getGameForDifficulty(dailyPools, difficulty)
      setGameData(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bilinmeyen hata")
    }
  }, [dailyPayload, dailyPools, difficulty])

  const selectionDescriptions = useMemo(() => {
    if (dailyPayload) {
      return {
        easy: formatIlk11MatchLabel(dailyPayload.ilk11.easy),
        hard: formatIlk11MatchLabel(dailyPayload.ilk11.hard),
      }
    }

    if (!dailyPools) return null

    try {
      return {
        easy: formatIlk11MatchLabel(getGameForDifficulty(dailyPools, "easy")),
        hard: formatIlk11MatchLabel(getGameForDifficulty(dailyPools, "hard")),
      }
    } catch {
      return null
    }
  }, [dailyPayload, dailyPools])

  const players = useMemo(() => {
    if (!gameData) return []
    return assignPositions(
      gameData.formation,
      gameData.lineup,
      gameData.lineupNumbers,
      gameData.lineupCaptains,
      gameData.lineupGoals,
      gameData.lineupAssists,
      gameData.hasColoredCards,
      gameData.lineupYellowCards,
      gameData.lineupRedCards,
      gameData.lineupCards,
      gameData.lineupSubstitutions
    )
  }, [gameData])

  if (error) {
    return (
      <main className="min-h-screen gradient-dark text-white p-2 sm:p-4">
        <div className="container mx-auto flex flex-col items-center justify-center h-[calc(100vh-1rem)] sm:h-[calc(100vh-2rem)]">
          <div className="glass rounded-2xl p-6 text-center">
            <p className="text-red-400 font-medium">Oyun yüklenemedi: {error}</p>
          </div>
        </div>
      </main>
    )
  }

  const showDifficultySelection = !difficulty
  const showLoading = !!difficulty && !gameData

  return (
    <main className="min-h-screen h-screen gradient-dark text-white p-1 sm:p-2 flex flex-col overflow-hidden">
      {showDifficultySelection ? (
        <DifficultySelectionModal
          onSelect={setDifficulty}
          descriptions={selectionDescriptions}
        />
      ) : (
        <div className="h-full w-full min-h-0 flex-1 flex items-center justify-center">
          {showLoading && (
            <div className="glass rounded-2xl p-6 text-center">
              <div className="animate-pulse flex flex-col items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-emerald-500/30" />
                <p className="text-slate-300">Oyun yükleniyor...</p>
              </div>
            </div>
          )}

          {gameData && (
            <div className="h-full w-full max-w-[90vw] sm:max-w-[80vw] md:max-w-[720px]">
              <Formation
                formation={gameData.formation}
                players={players}
                game={gameData.game}
                team={gameData.team}
                gameId={gameData.gameId}
                gameDate={gameData.dateKey}
                difficulty={difficulty}
              />
            </div>
          )}
        </div>
      )}

      <footer className="pt-2 pb-1 flex justify-center">
        <div className="flex items-center gap-4 rounded-full border border-white/15 bg-black/35 px-3 py-1.5 text-sm leading-none text-slate-200 backdrop-blur-sm">
          <a
            href="/"
            className="inline-flex items-center gap-1.5 hover:text-white transition-colors"
            aria-label="Ana sayfaya dön"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-current">
              <path d="M12 3L2 12h3v8h6v-6h2v6h6v-8h3L12 3z" />
            </svg>
            Ana Sayfa
          </a>
          <a
            href={ILK10_PATH}
            className="inline-flex items-center gap-1.5 hover:text-white transition-colors"
          >
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-emerald-400/50 text-[10px] font-bold text-emerald-300">
              10
            </span>
            İlk10
          </a>
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
    </main>
  )
}
