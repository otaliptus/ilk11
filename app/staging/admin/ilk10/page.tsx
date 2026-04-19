"use client"

import { Suspense } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Ilk10GamePage } from "@/components/ilk10-game-page"

function StagingAdminIlk10Content() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const forcedDateKey = searchParams.get("date")

  const handleForcedDateChange = (dateKey: string) => {
    const trimmed = dateKey.trim()
    const nextParams = new URLSearchParams(searchParams.toString())

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      nextParams.set("date", trimmed)
    } else {
      nextParams.delete("date")
    }

    const nextQuery = nextParams.toString()
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false })
  }

  return (
    <Ilk10GamePage
      adminMode
      forcedDateKey={forcedDateKey}
      onForcedDateChange={handleForcedDateChange}
    />
  )
}

export default function StagingAdminIlk10Page() {
  return (
    <Suspense fallback={<Ilk10GamePage adminMode />}>
      <StagingAdminIlk10Content />
    </Suspense>
  )
}
