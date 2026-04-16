import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "ilk10!",
  description: "Turkish football Top 10 quiz game for players, coaches, referees, and clubs.",
}

export default function Ilk10Layout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return children
}
