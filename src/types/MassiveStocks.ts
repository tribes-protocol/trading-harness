import { z } from 'zod'

export function normalizeMassiveStocksTicker(raw: string): string {
  return decodeURIComponent(raw).toUpperCase().trim()
}

export const MassiveStocksTickerSchema = z
  .string()
  .transform(normalizeMassiveStocksTicker)
  .pipe(z.string().min(1))
export type MassiveStocksTicker = z.infer<typeof MassiveStocksTickerSchema>
