import { z } from 'zod'

import { StockTimeframeSchema } from '@/types/MarketStack'

const TickerSchema = z.string().trim().min(1, 'ticker is required').max(12)
const OutSchema = z.string().nullish()

export const StockSnapshotCommandOptionsSchema = z.object({
  ticker: TickerSchema,
  out: OutSchema
})
export const StockDetailsCommandOptionsSchema = z.object({
  ticker: TickerSchema,
  out: OutSchema
})
export const StockMarketSnapshotCommandOptionsSchema = z.object({
  tickers: z.string().trim().min(1, 'tickers is required'),
  out: OutSchema
})
export const StockSearchCommandOptionsSchema = z.object({
  query: z.string().trim().min(1, 'query is required').max(200),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  out: OutSchema
})
export const StockCandlesCommandOptionsSchema = z.object({
  ticker: TickerSchema,
  timeframe: StockTimeframeSchema,
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'from must be YYYY-MM-DD'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'to must be YYYY-MM-DD'),
  limit: z.coerce.number().int().min(1).max(5000).nullish(),
  out: OutSchema
})
