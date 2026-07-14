import { z } from 'zod'

// Wire schemas: only the ones a service parses a network response with are
// exported. The rest are composed into those, so the inferred type is the
// public surface.

export type MarketStackSort = 'ASC' | 'DESC'

const MarketStackPaginationSchema = z.object({
  limit: z.number().int().nullish(),
  offset: z.number().int().nullish(),
  count: z.number().int().nullish(),
  total: z.number().int().nullish()
})

const MarketStackStockExchangeSchema = z.object({
  name: z.string(),
  acronym: z.string().nullish(),
  mic: z.string().nullish(),
  country: z.string().nullish(),
  country_code: z.string().nullish(),
  city: z.string().nullish(),
  website: z.string().nullish()
})

export const MarketStackTickerSchema = z.object({
  name: z.string(),
  symbol: z.string(),
  cik: z.string().nullish(),
  isin: z.string().nullish(),
  cusip: z.string().nullish(),
  item_type: z.string().nullish(),
  sector: z.string().nullish(),
  industry: z.string().nullish(),
  sic_code: z.string().nullish(),
  sic_name: z.string().nullish(),
  stock_exchange: MarketStackStockExchangeSchema.nullish()
})
export type MarketStackTicker = z.infer<typeof MarketStackTickerSchema>

// Request-side enums: sent to Marketstack, never parsed back out of a response.
export type MarketStackIntradayInterval =
  | '1min'
  | '5min'
  | '10min'
  | '15min'
  | '30min'
  | '1hour'
  | '3hour'
  | '6hour'
  | '12hour'
  | '24hour'

const MarketStackIntradayBarSchema = z.object({
  open: z.number().nullish(),
  high: z.number().nullish(),
  low: z.number().nullish(),
  close: z.number().nullish(),
  volume: z.number().nullish(),
  symbol: z.string(),
  exchange: z.string().nullish(),
  date: z.string()
})
export type MarketStackIntradayBar = z.infer<typeof MarketStackIntradayBarSchema>

export const MarketStackIntradayResponseSchema = z.object({
  pagination: MarketStackPaginationSchema.nullish(),
  data: z.array(MarketStackIntradayBarSchema).nullish()
})
export type MarketStackIntradayResponse = z.infer<typeof MarketStackIntradayResponseSchema>

const MarketStackEodBarSchema = z.object({
  open: z.number().nullish(),
  high: z.number().nullish(),
  low: z.number().nullish(),
  close: z.number().nullish(),
  volume: z.number().nullish(),
  adj_close: z.number().nullish(),
  symbol: z.string(),
  exchange: z.string().nullish(),
  date: z.string()
})
export type MarketStackEodBar = z.infer<typeof MarketStackEodBarSchema>

export const MarketStackEodResponseSchema = z.object({
  pagination: MarketStackPaginationSchema.nullish(),
  data: z.array(MarketStackEodBarSchema)
})
export type MarketStackEodResponse = z.infer<typeof MarketStackEodResponseSchema>

const MarketStackTickersListItemSchema = z.object({
  name: z.string(),
  ticker: z.string(),
  has_intraday: z.boolean().nullish(),
  has_eod: z.boolean().nullish(),
  stock_exchange: z.object({
    name: z.string(),
    acronym: z.string().nullish(),
    mic: z.string().nullish()
  })
})

export const MarketStackTickersListResponseSchema = z.object({
  pagination: MarketStackPaginationSchema.nullish(),
  data: z.array(MarketStackTickersListItemSchema)
})
export type MarketStackTickersListResponse = z.infer<typeof MarketStackTickersListResponseSchema>

const MarketStackStockPriceItemSchema = z.object({
  exchange_code: z.string().nullish(),
  exchange_name: z.string().nullish(),
  country: z.string().nullish(),
  ticker: z.string(),
  price: z.coerce.number(),
  currency: z.string().nullish(),
  trade_last: z.string().nullish()
})
export type MarketStackStockPriceItem = z.infer<typeof MarketStackStockPriceItemSchema>

export const MarketStackStockPriceResponseSchema = z.object({
  data: z.array(MarketStackStockPriceItemSchema)
})
export type MarketStackStockPriceResponse = z.infer<typeof MarketStackStockPriceResponseSchema>

// Canonical timeframes the candles command accepts. Some map to a native
// Marketstack interval; the rest are rolled up from the nearest one by the
// aggregator in utils/MarketStack.
export const StockTimeframeSchema = z.enum([
  '1m',
  '3m',
  '5m',
  '15m',
  '30m',
  '1H',
  '2H',
  '4H',
  '6H',
  '8H',
  '12H',
  '1D',
  '3D',
  '1W',
  '1M'
])
export type StockTimeframe = z.infer<typeof StockTimeframeSchema>

// Fetch/rollup plans are built in code and never parsed from JSON, so they are
// plain types rather than schemas.
export type CandleAggregation =
  | { readonly kind: 'fixed'; readonly size: number }
  | { readonly kind: 'calendar'; readonly boundary: 'week' | 'month' }

export type StockFetchPlan = {
  readonly sourceKind: 'intraday' | 'eod'
  readonly interval?: MarketStackIntradayInterval
  readonly aggregation?: CandleAggregation
}

export const StockCandleSchema = z.object({
  t: z.number().int(),
  o: z.number(),
  h: z.number(),
  l: z.number(),
  c: z.number(),
  v: z.number()
})
export type StockCandle = z.infer<typeof StockCandleSchema>

export const StockSnapshotSchema = z.object({
  ticker: z.string(),
  price: z.number().nullish(),
  change: z.number().nullish(),
  change_pct: z.number().nullish(),
  day_open: z.number().nullish(),
  day_high: z.number().nullish(),
  day_low: z.number().nullish(),
  day_volume: z.number().nullish(),
  prev_close: z.number().nullish(),
  currency: z.string().nullish(),
  as_of: z.string().nullish()
})
export type StockSnapshot = z.infer<typeof StockSnapshotSchema>

export const StockMarketSnapshotRowSchema = z.object({
  ticker: z.string(),
  price: z.number().nullish(),
  change: z.number().nullish(),
  change_pct: z.number().nullish()
})
export type StockMarketSnapshotRow = z.infer<typeof StockMarketSnapshotRowSchema>

export const StockDetailsSchema = z.object({
  ticker: z.string(),
  name: z.string(),
  type: z.string().nullish(),
  exchange: z.string().nullish(),
  sector: z.string().nullish(),
  industry: z.string().nullish(),
  sic: z.string().nullish(),
  cik: z.string().nullish(),
  isin: z.string().nullish(),
  cusip: z.string().nullish(),
  country: z.string().nullish()
})
export type StockDetails = z.infer<typeof StockDetailsSchema>

export const StockSearchResultSchema = z.object({
  ticker: z.string(),
  name: z.string(),
  exchange: z.string().nullish(),
  has_eod: z.boolean(),
  has_intraday: z.boolean()
})
export type StockSearchResult = z.infer<typeof StockSearchResultSchema>

export const StockCandlesResultSchema = z.object({
  ticker: z.string(),
  timeframe: StockTimeframeSchema,
  from: z.string(),
  to: z.string(),
  count: z.number().int(),
  candles: z.array(StockCandleSchema)
})
export type StockCandlesResult = z.infer<typeof StockCandlesResultSchema>
