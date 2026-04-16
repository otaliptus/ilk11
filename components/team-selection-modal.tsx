"use client"

import { Trophy } from "lucide-react"

interface DifficultySelectionProps {
  onSelect: (difficulty: "easy" | "hard") => void
}

export function DifficultySelectionModal({ onSelect }: DifficultySelectionProps & { open?: boolean }) {
  return <DifficultySelection onSelect={onSelect} />
}

export function DifficultySelection({ onSelect }: DifficultySelectionProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 animate-in fade-in duration-500">
      {/* Pitch circle decoration */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
        <div className="w-[min(80vw,400px)] aspect-square rounded-full border border-white/[0.04]" />
        <div className="absolute w-[min(40vw,200px)] aspect-square rounded-full border border-white/[0.03]" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-6 w-full max-w-xs">
        {/* Logo area */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <Trophy className="h-12 w-12 text-emerald-400 drop-shadow-[0_0_12px_rgba(16,185,129,0.4)]" />
          </div>
          <h1 className="text-4xl font-extrabold text-white tracking-tight font-mono">
            İlk 11!
          </h1>
          <p className="text-slate-400 text-sm tracking-wide">
            Zorluk seviyesi seç
          </p>
        </div>

        {/* Buttons */}
        <div className="flex gap-3 w-full mt-2">
          <button
            onClick={() => onSelect("easy")}
            className="flex-1 group relative py-5 rounded-xl bg-emerald-600/60 hover:bg-emerald-500/70 border border-emerald-400/30 hover:border-emerald-400/50 text-white transition-all duration-200 flex flex-col items-center gap-1.5 active:scale-[0.97]"
          >
            <span className="text-lg leading-none">🟢</span>
            <span className="text-base font-bold tracking-wide">Kolay</span>
            <span className="text-[11px] font-normal text-emerald-200/70">Büyük kulüpler</span>
          </button>

          <button
            onClick={() => onSelect("hard")}
            className="flex-1 group relative py-5 rounded-xl bg-red-700/50 hover:bg-red-600/60 border border-red-500/30 hover:border-red-500/50 text-white transition-all duration-200 flex flex-col items-center gap-1.5 active:scale-[0.97]"
          >
            <span className="text-lg leading-none">🔴</span>
            <span className="text-base font-bold tracking-wide">Zor</span>
            <span className="text-[11px] font-normal text-red-200/70">Diğer takımlar</span>
          </button>
        </div>
      </div>
    </div>
  )
}
