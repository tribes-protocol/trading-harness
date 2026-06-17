import { z } from 'zod'

export function normalizeHyperliquidCoin(raw: string): string {
  const decoded = decodeURIComponent(raw)
  const colonIdx = decoded.indexOf(':')
  if (colonIdx === -1) {
    return decoded.toUpperCase()
  }
  const dex = decoded.slice(0, colonIdx)
  const symbol = decoded.slice(colonIdx + 1).toUpperCase()
  return `${dex}:${symbol}`
}

export const HyperliquidCoinSchema = z.string().min(1).transform(normalizeHyperliquidCoin)
export type HyperliquidCoin = z.infer<typeof HyperliquidCoinSchema>
