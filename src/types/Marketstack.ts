import { z } from 'zod'

// Marketstack v2 direct-API types (base https://api.marketstack.com, paths under /v2).
// Raw API: list endpoints wrap rows in {pagination, data}; single-resource endpoints
// (/v2/tickers/{symbol}) return a bare object without pagination. Prices and volumes
// arrive as JSON numbers and stay numbers. Timestamps: provider date strings
// (ISO-8601 with a '+0000' offset, e.g. '2024-09-27T00:00:00+0000') pass through
// unchanged as strings in both raw and normalized shapes.

const MarketstackPaginationSchema = z.object({
  limit: z.number(),
  offset: z.number(),
  count: z.number(),
  total: z.number()
})

// --- GET /v2/eod and /v2/eod/latest ---

const MarketstackRawEodBarSchema = z.object({
  symbol: z.string().min(1),
  date: z.string().min(1),
  open: z.number().nullish(),
  high: z.number().nullish(),
  low: z.number().nullish(),
  close: z.number().nullish(),
  volume: z.number().nullish(),
  adj_close: z.number().nullish(),
  split_factor: z.number().nullish(),
  dividend: z.number().nullish(),
  exchange_code: z.string().nullish(),
  price_currency: z.string().nullish()
})

export const MarketstackEodResponseSchema = z.object({
  pagination: MarketstackPaginationSchema,
  data: MarketstackRawEodBarSchema.array()
})
export type MarketstackEodResponse = z.infer<typeof MarketstackEodResponseSchema>

const MarketstackEodBarSchema = z.object({
  symbol: z.string().min(1),
  date: z.string().min(1),
  open: z.number().nullish(),
  high: z.number().nullish(),
  low: z.number().nullish(),
  close: z.number().nullish(),
  volume: z.number().nullish(),
  adj_close: z.number().nullish(),
  split_factor: z.number().nullish(),
  dividend: z.number().nullish(),
  exchange_code: z.string().nullish(),
  price_currency: z.string().nullish()
})

export const MarketstackEodSeriesSchema = z.object({
  source: z.literal('marketstack'),
  pagination: MarketstackPaginationSchema,
  bars: MarketstackEodBarSchema.array()
})
export type MarketstackEodSeries = z.infer<typeof MarketstackEodSeriesSchema>

// --- GET /v2/intraday and /v2/intraday/latest ---
// IEX TOPS quote fields (last, bid/ask) are null without IEX entitlement; only
// OHLCV plus marketstack_last are reliable, so every quote field is nullable.

const MarketstackRawIntradayBarSchema = z.object({
  symbol: z.string().min(1),
  date: z.string().min(1),
  open: z.number().nullish(),
  high: z.number().nullish(),
  low: z.number().nullish(),
  close: z.number().nullish(),
  volume: z.number().nullish(),
  last: z.number().nullish(),
  marketstack_last: z.number().nullish()
})

export const MarketstackIntradayResponseSchema = z.object({
  pagination: MarketstackPaginationSchema,
  data: MarketstackRawIntradayBarSchema.array()
})
export type MarketstackIntradayResponse = z.infer<typeof MarketstackIntradayResponseSchema>

const MarketstackIntradayBarSchema = z.object({
  symbol: z.string().min(1),
  date: z.string().min(1),
  open: z.number().nullish(),
  high: z.number().nullish(),
  low: z.number().nullish(),
  close: z.number().nullish(),
  volume: z.number().nullish(),
  last: z.number().nullish(),
  marketstack_last: z.number().nullish()
})

export const MarketstackIntradaySeriesSchema = z.object({
  source: z.literal('marketstack'),
  pagination: MarketstackPaginationSchema,
  bars: MarketstackIntradayBarSchema.array()
})
export type MarketstackIntradaySeries = z.infer<typeof MarketstackIntradaySeriesSchema>

const MarketstackIntradayIntervalSchema = z.enum([
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
export type MarketstackIntradayInterval = z.infer<typeof MarketstackIntradayIntervalSchema>

// --- GET /v2/tickerslist (the v2 ticker-search endpoint) ---
// NOTE: rows name the symbol field 'ticker' (not 'symbol' as /v2/eod rows do).

const MarketstackRawTickerSearchRowSchema = z.object({
  name: z.string().nullish(),
  ticker: z.string().nullish(),
  has_intraday: z.boolean().nullish(),
  has_eod: z.boolean().nullish(),
  stock_exchange: z
    .object({
      name: z.string().nullish(),
      acronym: z.string().nullish(),
      mic: z.string().nullish()
    })
    .nullish()
})

export const MarketstackTickersListResponseSchema = z.object({
  pagination: MarketstackPaginationSchema,
  data: MarketstackRawTickerSearchRowSchema.array()
})
export type MarketstackTickersListResponse = z.infer<typeof MarketstackTickersListResponseSchema>

const MarketstackTickerSearchResultSchema = z.object({
  name: z.string().nullish(),
  ticker: z.string().nullish(),
  has_intraday: z.boolean().nullish(),
  has_eod: z.boolean().nullish(),
  exchange: z
    .object({
      name: z.string().nullish(),
      acronym: z.string().nullish(),
      mic: z.string().nullish()
    })
    .nullish()
})

export const MarketstackTickerSearchResultsSchema = z.object({
  source: z.literal('marketstack'),
  results: MarketstackTickerSearchResultSchema.array()
})
export type MarketstackTickerSearchResults = z.infer<typeof MarketstackTickerSearchResultsSchema>

// --- GET /v2/tickers/{symbol} (bare object, no pagination) ---
// The docs are ambiguous between 'ticker' and 'symbol' for the identifier field,
// and CIK values are sometimes numeric — accept both and normalize.

export const MarketstackTickerProfileResponseSchema = z.object({
  name: z.string().nullish(),
  ticker: z.string().nullish(),
  symbol: z.string().nullish(),
  cik: z.union([z.string(), z.number()]).nullish(),
  isin: z.string().nullish(),
  sector: z.string().nullish(),
  industry: z.string().nullish(),
  stock_exchange: z
    .object({
      name: z.string().nullish(),
      acronym: z.string().nullish(),
      mic: z.string().nullish(),
      country: z.string().nullish()
    })
    .nullish()
})
export type MarketstackTickerProfileResponse = z.infer<
  typeof MarketstackTickerProfileResponseSchema
>

export const MarketstackTickerProfileSchema = z.object({
  source: z.literal('marketstack'),
  name: z.string().nullish(),
  ticker: z.string().nullish(),
  cik: z.string().nullish(),
  isin: z.string().nullish(),
  sector: z.string().nullish(),
  industry: z.string().nullish(),
  exchange: z
    .object({
      name: z.string().nullish(),
      acronym: z.string().nullish(),
      mic: z.string().nullish(),
      country: z.string().nullish()
    })
    .nullish()
})
export type MarketstackTickerProfile = z.infer<typeof MarketstackTickerProfileSchema>

// --- CLI command options ---
// Request date params accept YYYY-MM-DD or full ISO-8601, so only the date prefix
// is validated here.

const MARKETSTACK_DATE_PREFIX = /^\d{4}-\d{2}-\d{2}/

export const MarketstackEodCommandOptionsSchema = z.object({
  symbols: z.string().trim().min(1, 'symbols must be a comma-separated list, e.g. AAPL,MSFT'),
  dateFrom: z
    .string()
    .trim()
    .regex(MARKETSTACK_DATE_PREFIX, 'use YYYY-MM-DD or ISO-8601')
    .nullish(),
  dateTo: z.string().trim().regex(MARKETSTACK_DATE_PREFIX, 'use YYYY-MM-DD or ISO-8601').nullish(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  latest: z.boolean().default(false),
  out: z.string().nullish()
})
export type MarketstackEodCommandOptions = z.infer<typeof MarketstackEodCommandOptionsSchema>

export const MarketstackIntradayCommandOptionsSchema = z.object({
  symbols: z.string().trim().min(1, 'symbols must be a comma-separated list, e.g. AAPL,MSFT'),
  interval: MarketstackIntradayIntervalSchema.default('1hour'),
  dateFrom: z
    .string()
    .trim()
    .regex(MARKETSTACK_DATE_PREFIX, 'use YYYY-MM-DD or ISO-8601')
    .nullish(),
  dateTo: z.string().trim().regex(MARKETSTACK_DATE_PREFIX, 'use YYYY-MM-DD or ISO-8601').nullish(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  latest: z.boolean().default(false),
  out: z.string().nullish()
})
export type MarketstackIntradayCommandOptions = z.infer<
  typeof MarketstackIntradayCommandOptionsSchema
>

export const MarketstackSearchCommandOptionsSchema = z.object({
  query: z.string().trim().min(1, 'query must be a ticker or company-name fragment'),
  limit: z.coerce.number().int().min(1).max(1000).default(20),
  out: z.string().nullish()
})
export type MarketstackSearchCommandOptions = z.infer<typeof MarketstackSearchCommandOptionsSchema>

export const MarketstackTickerCommandOptionsSchema = z.object({
  symbol: z.string().trim().min(1, 'symbol must be a single ticker, e.g. AAPL'),
  out: z.string().nullish()
})
export type MarketstackTickerCommandOptions = z.infer<typeof MarketstackTickerCommandOptionsSchema>
