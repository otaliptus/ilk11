export const GAME_TIME_ZONE = "Europe/Istanbul"

const TURKEY_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: GAME_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

export function getTurkeyDateParts(date = new Date()): { year: number; month: number; day: number } {
  const parts = TURKEY_DATE_FORMATTER.formatToParts(date)
  const year = Number(parts.find((part) => part.type === "year")?.value ?? NaN)
  const month = Number(parts.find((part) => part.type === "month")?.value ?? NaN)
  const day = Number(parts.find((part) => part.type === "day")?.value ?? NaN)

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new Error("Failed to resolve Turkey date parts")
  }

  return { year, month, day }
}

const MS_PER_DAY = 1000 * 60 * 60 * 24

export function getTurkeyDayIndex(date = new Date()): number {
  const { year, month, day } = getTurkeyDateParts(date)
  return Math.floor(Date.UTC(year, month - 1, day) / MS_PER_DAY)
}

export function getTurkeyDateKey(date = new Date()): string {
  const { year, month, day } = getTurkeyDateParts(date)
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

export function getLastNDates(n: number): string[] {
  const dates: string[] = []
  const now = new Date()
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getTime() - i * MS_PER_DAY)
    dates.push(getTurkeyDateKey(d))
  }
  return dates
}

export function formatDateForDisplay(dateStr: string): {
  dayName: string
  dayNumber: number
  monthLabel: string
} {
  const [y, m, d] = dateStr.split("-").map(Number)
  const date = new Date(y, m - 1, d)
  const dayName = new Intl.DateTimeFormat("tr-TR", { weekday: "short" }).format(date)
  const monthLabel = new Intl.DateTimeFormat("tr-TR", { month: "short" }).format(date)
  return { dayName, dayNumber: d, monthLabel }
}
