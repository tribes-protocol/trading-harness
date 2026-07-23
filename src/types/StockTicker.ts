import { z } from 'zod'

export function normalizeStockTicker(raw: string): string {
  return decodeURIComponent(raw).toUpperCase().trim()
}

export const StockTickerSchema = z.string().transform(normalizeStockTicker).pipe(z.string().min(1))
export type StockTicker = z.infer<typeof StockTickerSchema>
