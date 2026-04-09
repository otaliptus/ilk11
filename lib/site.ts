const isProduction = process.env.NODE_ENV === "production"

export const ILK11_PUBLIC_URL =
  process.env.NEXT_PUBLIC_ILK11_URL ?? (isProduction ? "https://ilk11.otaliptus.com" : "/")

export const ILK10_PUBLIC_URL =
  process.env.NEXT_PUBLIC_ILK10_URL ?? (isProduction ? "https://ilk10.otaliptus.com" : "/ilk10")

export const ILK10_SHARE_DOMAIN =
  process.env.NEXT_PUBLIC_ILK10_SHARE_DOMAIN ?? "ilk10.otaliptus.com"
