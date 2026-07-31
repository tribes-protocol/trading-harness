import { z } from 'zod'

// ---------------------------------------------------------------------------
// Raw Marketstack v2 payloads (api.marketstack.com). Shaped from the official
// v2 docs (https://marketstack.com/documentation_v2 — "End-of-Day Data" and
// "Tickers"); only the fields the harness surfaces are modeled.
// ---------------------------------------------------------------------------

// OHLC legs are nullish: live EOD rows carry `close: null` on some sessions
// (observed on AAPL history), and a required number there rejects the whole
// page. Rows missing a leg are dropped at mapping time rather than back-filled.
export const MarketstackEodRowSchema = z.object({
  date: z.string(),
  open: z.number().nullish(),
  high: z.number().nullish(),
  low: z.number().nullish(),
  close: z.number().nullish(),
  volume: z.number().nullish()
})
export type MarketstackEodRow = z.infer<typeof MarketstackEodRowSchema>

export const MarketstackEodResponseSchema = z.object({
  data: z.array(MarketstackEodRowSchema).nullish()
})
export type MarketstackEodResponse = z.infer<typeof MarketstackEodResponseSchema>

// GET /v2/intraday — the intervals Marketstack serves natively. Anything else
// (notably 4h) is rolled up locally from a finer one; see stockCandlePlan in
// routing/Adapters and the rollups in utils/Candles.
export const MarketstackIntervalSchema = z.enum([
  '1min',
  '5min',
  '10min',
  '15min',
  '30min',
  '1hour',
  '3hour',
  '6hour',
  '12hour',
  '24hour'
])
export type MarketstackInterval = z.infer<typeof MarketstackIntervalSchema>

// Intraday rows carry the same OHLCV block as EOD plus quote-side fields the
// harness ignores. open/high/low/close are nullish here: on lower plan tiers
// Marketstack reports session-level values rather than per-bar ones.
export const MarketstackIntradayRowSchema = z.object({
  date: z.string(),
  open: z.number().nullish(),
  high: z.number().nullish(),
  low: z.number().nullish(),
  close: z.number().nullish(),
  volume: z.number().nullish()
})
export type MarketstackIntradayRow = z.infer<typeof MarketstackIntradayRowSchema>

export const MarketstackIntradayResponseSchema = z.object({
  data: z.array(MarketstackIntradayRowSchema).nullish()
})
export type MarketstackIntradayResponse = z.infer<typeof MarketstackIntradayResponseSchema>

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

// GET /v2/tickerslist?search=<q> — ticker search. Rows carry `ticker` (not
// `symbol`) and a nested stock_exchange with no `country`. The v1-style
// /v2/tickers?search= route 404s ("Route not found") on v2.
export const MarketstackTickersListRowSchema = z.object({
  ticker: z.string(),
  name: z.string().nullish(),
  stock_exchange: MarketstackStockExchangeSchema.nullish()
})
export type MarketstackTickersListRow = z.infer<typeof MarketstackTickersListRowSchema>

export const MarketstackTickersListResponseSchema = z.object({
  data: z.array(MarketstackTickersListRowSchema).nullish()
})
export type MarketstackTickersListResponse = z.infer<typeof MarketstackTickersListResponseSchema>

// GET /v2/stockprice — real-time price; the docs example returns price as a
// numeric string, so both forms are accepted and coalesced at mapping time.
export const MarketstackStockPriceResponseSchema = z.object({
  data: z
    .array(
      z.object({
        ticker: z.string().nullish(),
        price: z.union([z.number(), z.string()]).nullish(),
        currency: z.string().nullish(),
        trade_last: z.string().nullish()
      })
    )
    .nullish()
})
export type MarketstackStockPriceResponse = z.infer<typeof MarketstackStockPriceResponseSchema>

// ---------------------------------------------------------------------------
// Agent-facing output shapes printed by `tribes-cli stocks`.
// ---------------------------------------------------------------------------

export const StockCandleSchema = z.object({
  t: z.number(),
  o: z.number(),
  h: z.number(),
  l: z.number(),
  c: z.number(),
  v: z.number().nullish()
})
export type StockCandle = z.infer<typeof StockCandleSchema>

export const StocksCandlesSchema = z.object({
  source: z.literal('marketstack'),
  symbol: z.string(),
  candles: z.array(StockCandleSchema)
})
export type StocksCandles = z.infer<typeof StocksCandlesSchema>

export const StocksPriceSchema = z.object({
  source: z.literal('marketstack'),
  symbol: z.string(),
  price: z.number().nullish(),
  currency: z.string().nullish(),
  trade_last: z.string().nullish()
})
export type StocksPrice = z.infer<typeof StocksPriceSchema>

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

// ---------------------------------------------------------------------------
// `tribes-cli stocks` command options.
// ---------------------------------------------------------------------------

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
