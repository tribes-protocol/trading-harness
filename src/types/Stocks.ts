import { z } from 'zod'

// ---------------------------------------------------------------------------
// Raw Marketstack v2 payloads (api.marketstack.com). Shaped from the official
// v2 docs (https://marketstack.com/documentation_v2 — "End-of-Day Data" and
// "Tickers"); only the fields the harness surfaces are modeled.
// ---------------------------------------------------------------------------

export const MarketstackEodRowSchema = z.object({
  date: z.string(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number().nullish()
})
export type MarketstackEodRow = z.infer<typeof MarketstackEodRowSchema>

export const MarketstackEodResponseSchema = z.object({
  data: z.array(MarketstackEodRowSchema).nullish()
})
export type MarketstackEodResponse = z.infer<typeof MarketstackEodResponseSchema>

const MarketstackStockExchangeSchema = z.object({
  name: z.string().nullish(),
  acronym: z.string().nullish(),
  mic: z.string().nullish(),
  country: z.string().nullish()
})

export const MarketstackTickerSchema = z.object({
  symbol: z.string(),
  name: z.string().nullish(),
  sector: z.string().nullish(),
  industry: z.string().nullish(),
  stock_exchange: MarketstackStockExchangeSchema.nullish()
})
export type MarketstackTicker = z.infer<typeof MarketstackTickerSchema>

export const MarketstackTickersResponseSchema = z.object({
  data: z.array(MarketstackTickerSchema).nullish()
})
export type MarketstackTickersResponse = z.infer<typeof MarketstackTickersResponseSchema>

// ---------------------------------------------------------------------------
// Raw control-plane stocks proxy payload (GET /stocks/snapshot/:ticker on the
// Tribes API, Massive-backed). The API serializes BigNumber fields through
// toJsonTree, so numeric fields arrive as decimal strings.
// ---------------------------------------------------------------------------

const StocksProxyNumberSchema = z.union([z.number(), z.string()]).nullish()

export const StocksProxySnapshotSchema = z.object({
  ticker: z.string(),
  name: z.string().nullish(),
  price: StocksProxyNumberSchema,
  change: StocksProxyNumberSchema,
  changePercent: StocksProxyNumberSchema,
  volume: StocksProxyNumberSchema,
  dayOpen: StocksProxyNumberSchema,
  dayHigh: StocksProxyNumberSchema,
  dayLow: StocksProxyNumberSchema,
  prevClose: StocksProxyNumberSchema,
  marketCap: StocksProxyNumberSchema,
  primaryExchange: z.string().nullish(),
  updated: z.number().nullish()
})
export type StocksProxySnapshot = z.infer<typeof StocksProxySnapshotSchema>

// ---------------------------------------------------------------------------
// Agent-facing output shapes printed by `tribes-cli stocks`.
// ---------------------------------------------------------------------------

const StockCandleSchema = z.object({
  t: z.number(),
  o: z.number(),
  h: z.number(),
  l: z.number(),
  c: z.number(),
  v: z.number().nullish()
})

export const StocksCandlesSchema = z.object({
  source: z.literal('marketstack'),
  symbol: z.string(),
  candles: z.array(StockCandleSchema)
})
export type StocksCandles = z.infer<typeof StocksCandlesSchema>

export const StocksDetailSchema = z.object({
  source: z.literal('marketstack'),
  symbol: z.string(),
  name: z.string().nullish(),
  sector: z.string().nullish(),
  industry: z.string().nullish(),
  exchange: z.string().nullish(),
  mic: z.string().nullish(),
  country: z.string().nullish()
})
export type StocksDetail = z.infer<typeof StocksDetailSchema>

const StocksSearchRowSchema = z.object({
  symbol: z.string(),
  name: z.string().nullish(),
  exchange: z.string().nullish(),
  mic: z.string().nullish(),
  country: z.string().nullish()
})

export const StocksSearchResultsSchema = z.object({
  source: z.literal('marketstack'),
  query: z.string(),
  results: z.array(StocksSearchRowSchema)
})
export type StocksSearchResults = z.infer<typeof StocksSearchResultsSchema>

export const StocksQuoteSchema = z.object({
  source: z.literal('massive'),
  symbol: z.string(),
  name: z.string().nullish(),
  price: z.number().nullish(),
  change: z.number().nullish(),
  change_pct: z.number().nullish(),
  volume: z.number().nullish(),
  day_open: z.number().nullish(),
  day_high: z.number().nullish(),
  day_low: z.number().nullish(),
  prev_close: z.number().nullish(),
  market_cap: z.number().nullish(),
  exchange: z.string().nullish(),
  updated_at: z.number().nullish()
})
export type StocksQuote = z.infer<typeof StocksQuoteSchema>

// ---------------------------------------------------------------------------
// `tribes-cli stocks` command options.
// ---------------------------------------------------------------------------

const StocksCandleIntervalSchema = z.enum(['1d'])

export const StocksCandlesCommandOptionsSchema = z.object({
  symbol: z.string().min(1),
  interval: StocksCandleIntervalSchema.nullish(),
  from: z.string().min(1).nullish(),
  to: z.string().min(1).nullish(),
  limit: z.number().int().min(1).max(1000).nullish(),
  out: z.string().nullish()
})
export type StocksCandlesCommandOptions = z.infer<typeof StocksCandlesCommandOptionsSchema>

export const StocksDetailCommandOptionsSchema = z.object({
  symbol: z.string().min(1),
  out: z.string().nullish()
})
export type StocksDetailCommandOptions = z.infer<typeof StocksDetailCommandOptionsSchema>

export const StocksSearchCommandOptionsSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(100).nullish(),
  out: z.string().nullish()
})
export type StocksSearchCommandOptions = z.infer<typeof StocksSearchCommandOptionsSchema>

export const StocksQuoteCommandOptionsSchema = z.object({
  symbol: z.string().min(1),
  out: z.string().nullish()
})
export type StocksQuoteCommandOptions = z.infer<typeof StocksQuoteCommandOptionsSchema>
