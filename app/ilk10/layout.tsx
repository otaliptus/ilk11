import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Top 10!",
  description: "Turkish football Top 10 quiz engine for players, coaches, referees, and clubs.",
}

export default function Ilk10Layout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return children
}
