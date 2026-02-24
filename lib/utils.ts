import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const nonDecomposableMap: Record<string, string> = {
  'Ø': 'O', 'ø': 'O',
  'Ł': 'L', 'ł': 'L',
}

export function normalizePlayerName(name: string): string {
  // Strip all punctuation and spaces: apostrophes, hyphens, periods, backticks, spaces
  // This is the canonical normalization used for all comparisons,
  // length checks, and keyboard coloring
  return name
    .replace(/['\-\.` ]/g, '')
    .replace(/[ØøŁł]/g, ch => nonDecomposableMap[ch])
}

export function normalizeKeyInput(key: string): string | null {
  if (key.length !== 1) return null

  const normalized = key
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()

  return /^[A-Z]$/.test(normalized) ? normalized : null
}

export function getDisplayBoxes(name: string): { char: string; isSpecial: boolean }[] {
  return name.split('').map(char => ({
    char: char === ' ' ? ' ' : (nonDecomposableMap[char] ?? char),
    isSpecial: char === '-' || char === "'" || char === '.' || char === '`' || char === ' '
  }))
}