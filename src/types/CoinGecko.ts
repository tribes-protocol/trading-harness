import { z } from 'zod'

// CoinGecko Pro (direct API) types.
// Raw API notes: /simple/price returns an object keyed by coin id with per-currency
// suffixed fields; /global wraps its payload in a {data: {...}} envelope;
// /search/trending nests coins[].item and mixes numbers with formatted strings
// inside item.data (parse those defensively); /coins/{id}/ohlc returns flat
// [timestamp_ms, open, high, low, close] tuples.
// Timestamp conventions in the normalized shapes: unix-second numbers where the
// provider sends them (last_updated_at, updated_at), epoch-millisecond numbers for
// OHLC candles (time_ms) and ISO 8601 strings for *_date fields.

// --- Raw provider schemas (defensive: nullish wherever the API may omit) ---

export const CoinGeckoSimplePriceResponseSchema = z.record(z.record(z.number().nullish()))

const CoinGeckoRawMarketRowSchema = z.object({
  id: z.string().min(1),
  symbol: z.string().nullish(),
  name: z.string().nullish(),
  current_price: z.number().nullish(),
  market_cap: z.number().nullish(),
  market_cap_rank: z.number().nullish(),
  total_volume: z.number().nullish(),
  high_24h: z.number().nullish(),
  low_24h: z.number().nullish(),
  price_change_percentage_24h: z.number().nullish(),
  circulating_supply: z.number().nullish(),
  price_change_percentage_1h_in_currency: z.number().nullish(),
  price_change_percentage_24h_in_currency: z.number().nullish(),
  price_change_percentage_7d_in_currency: z.number().nullish()
})
export const CoinGeckoMarketsResponseSchema = CoinGeckoRawMarketRowSchema.array()

export const CoinGeckoGlobalResponseSchema = z.object({
  data: z.object({
    active_cryptocurrencies: z.number().nullish(),
    markets: z.number().nullish(),
    total_market_cap: z.record(z.number().nullish()).nullish(),
    total_volume: z.record(z.number().nullish()).nullish(),
    market_cap_percentage: z.record(z.number().nullish()).nullish(),
    market_cap_change_percentage_24h_usd: z.number().nullish(),
    updated_at: z.number().nullish()
  })
})

// item.data.price is a number on current responses, but several sibling fields
// (market_cap, total_volume, price_btc) are formatted display strings — keep the
// whole block unknown-typed and let the service surface only reliable numbers.
const CoinGeckoRawTrendingItemSchema = z.object({
  id: z.string().min(1),
  symbol: z.string().nullish(),
  name: z.string().nullish(),
  market_cap_rank: z.number().nullish(),
  data: z
    .object({
      price: z.unknown(),
      price_change_percentage_24h: z.record(z.unknown()).nullish()
    })
    .nullish()
})
export const CoinGeckoTrendingResponseSchema = z.object({
  coins: z.object({ item: CoinGeckoRawTrendingItemSchema }).array().nullish()
})

const CoinGeckoRawCoinMarketDataSchema = z.object({
  current_price: z.record(z.number().nullish()).nullish(),
  market_cap: z.record(z.number().nullish()).nullish(),
  fully_diluted_valuation: z.record(z.number().nullish()).nullish(),
  total_volume: z.record(z.number().nullish()).nullish(),
  price_change_percentage_24h: z.number().nullish(),
  price_change_percentage_7d: z.number().nullish(),
  price_change_percentage_30d: z.number().nullish(),
  ath: z.record(z.number().nullish()).nullish(),
  ath_date: z.record(z.string().nullish()).nullish(),
  atl: z.record(z.number().nullish()).nullish(),
  atl_date: z.record(z.string().nullish()).nullish(),
  circulating_supply: z.number().nullish(),
  total_supply: z.number().nullish(),
  max_supply: z.number().nullish()
})
export const CoinGeckoCoinResponseSchema = z.object({
  id: z.string().min(1),
  symbol: z.string().nullish(),
  name: z.string().nullish(),
  description: z.record(z.string().nullish()).nullish(),
  links: z.object({ homepage: z.string().nullish().array().nullish() }).nullish(),
  categories: z.string().nullish().array().nullish(),
  market_cap_rank: z.number().nullish(),
  platforms: z.record(z.string().nullish()).nullish(),
  market_data: CoinGeckoRawCoinMarketDataSchema.nullish(),
  sentiment_votes_up_percentage: z.number().nullish(),
  genesis_date: z.string().nullish()
})

export const CoinGeckoOhlcResponseSchema = z
  .tuple([z.number(), z.number(), z.number(), z.number(), z.number()])
  .rest(z.number())
  .array()

export const CoinGeckoSearchResponseSchema = z.object({
  coins: z
    .object({
      id: z.string().min(1),
      symbol: z.string().nullish(),
      name: z.string().nullish(),
      market_cap_rank: z.number().nullish()
    })
    .array()
    .nullish()
})

// --- Normalized internal schemas ---

const CoinGeckoPriceRowSchema = z.object({
  id: z.string().min(1),
  vs: z.string().min(1),
  price: z.number().nullish(),
  market_cap: z.number().nullish(),
  volume_24h: z.number().nullish(),
  change_24h_pct: z.number().nullish(),
  last_updated_at: z.number().nullish()
})
export const CoinGeckoPricesSchema = z.object({
  source: z.literal('coingecko'),
  prices: CoinGeckoPriceRowSchema.array()
})
export type CoinGeckoPrices = z.infer<typeof CoinGeckoPricesSchema>

const CoinGeckoTopCoinRowSchema = z.object({
  id: z.string().min(1),
  symbol: z.string().nullish(),
  name: z.string().nullish(),
  current_price: z.number().nullish(),
  market_cap: z.number().nullish(),
  market_cap_rank: z.number().nullish(),
  total_volume: z.number().nullish(),
  high_24h: z.number().nullish(),
  low_24h: z.number().nullish(),
  price_change_percentage_24h: z.number().nullish(),
  circulating_supply: z.number().nullish(),
  change_1h_pct: z.number().nullish(),
  change_24h_pct: z.number().nullish(),
  change_7d_pct: z.number().nullish()
})
export const CoinGeckoTopCoinsSchema = z.object({
  source: z.literal('coingecko'),
  vs: z.string().min(1),
  coins: CoinGeckoTopCoinRowSchema.array()
})
export type CoinGeckoTopCoins = z.infer<typeof CoinGeckoTopCoinsSchema>

export const CoinGeckoGlobalSnapshotSchema = z.object({
  source: z.literal('coingecko'),
  active_cryptocurrencies: z.number().nullish(),
  markets: z.number().nullish(),
  total_market_cap_usd: z.number().nullish(),
  total_volume_usd: z.number().nullish(),
  btc_dominance_pct: z.number().nullish(),
  eth_dominance_pct: z.number().nullish(),
  market_cap_change_percentage_24h_usd: z.number().nullish(),
  updated_at: z.number().nullish()
})
export type CoinGeckoGlobalSnapshot = z.infer<typeof CoinGeckoGlobalSnapshotSchema>

const CoinGeckoTrendingCoinRowSchema = z.object({
  id: z.string().min(1),
  symbol: z.string().nullish(),
  name: z.string().nullish(),
  market_cap_rank: z.number().nullish(),
  price_usd: z.number().nullish(),
  change_24h_usd_pct: z.number().nullish()
})
export const CoinGeckoTrendingCoinsSchema = z.object({
  source: z.literal('coingecko'),
  coins: CoinGeckoTrendingCoinRowSchema.array()
})
export type CoinGeckoTrendingCoins = z.infer<typeof CoinGeckoTrendingCoinsSchema>

const CoinGeckoCoinMarketSchema = z.object({
  price_usd: z.number().nullish(),
  market_cap_usd: z.number().nullish(),
  fdv_usd: z.number().nullish(),
  volume_24h_usd: z.number().nullish(),
  change_24h_pct: z.number().nullish(),
  change_7d_pct: z.number().nullish(),
  change_30d_pct: z.number().nullish(),
  ath_usd: z.number().nullish(),
  ath_date: z.string().nullish(),
  atl_usd: z.number().nullish(),
  atl_date: z.string().nullish(),
  circulating_supply: z.number().nullish(),
  total_supply: z.number().nullish(),
  max_supply: z.number().nullish()
})
export const CoinGeckoCoinProfileSchema = z.object({
  source: z.literal('coingecko'),
  id: z.string().min(1),
  symbol: z.string().nullish(),
  name: z.string().nullish(),
  description: z.string().nullish(),
  homepage: z.string().nullish(),
  categories: z.string().array(),
  market_cap_rank: z.number().nullish(),
  platforms: z.record(z.string()),
  market: CoinGeckoCoinMarketSchema,
  sentiment_votes_up_percentage: z.number().nullish(),
  genesis_date: z.string().nullish()
})
export type CoinGeckoCoinProfile = z.infer<typeof CoinGeckoCoinProfileSchema>

const CoinGeckoOhlcCandleSchema = z.object({
  time_ms: z.number(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number()
})
export const CoinGeckoOhlcSeriesSchema = z.object({
  source: z.literal('coingecko'),
  id: z.string().min(1),
  vs: z.string().min(1),
  days: z.string().min(1),
  candles: CoinGeckoOhlcCandleSchema.array()
})
export type CoinGeckoOhlcSeries = z.infer<typeof CoinGeckoOhlcSeriesSchema>

const CoinGeckoSearchCoinRowSchema = z.object({
  id: z.string().min(1),
  symbol: z.string().nullish(),
  name: z.string().nullish(),
  market_cap_rank: z.number().nullish()
})
export const CoinGeckoSearchResultsSchema = z.object({
  source: z.literal('coingecko'),
  query: z.string().min(1),
  coins: CoinGeckoSearchCoinRowSchema.array()
})
export type CoinGeckoSearchResults = z.infer<typeof CoinGeckoSearchResultsSchema>

// --- CLI command option schemas ---

const CoinGeckoOrderSchema = z.enum([
  'market_cap_desc',
  'market_cap_asc',
  'volume_desc',
  'volume_asc',
  'id_asc',
  'id_desc'
])
export type CoinGeckoOrder = z.infer<typeof CoinGeckoOrderSchema>

const CoinGeckoChangeWindowSchema = z.enum(['1h', '24h', '7d'])
export type CoinGeckoChangeWindow = z.infer<typeof CoinGeckoChangeWindowSchema>

const CoinGeckoOhlcDaysSchema = z.enum(['1', '7', '14', '30', '90', '180', '365', 'max'])
export type CoinGeckoOhlcDays = z.infer<typeof CoinGeckoOhlcDaysSchema>

export const CoinGeckoPricesCommandOptionsSchema = z.object({
  ids: z
    .string()
    .trim()
    .min(1)
    .transform((value) =>
      value
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
    )
    .pipe(z.string().min(1).array().min(1)),
  vs: z.string().trim().min(1).default('usd'),
  out: z.string().nullish()
})

export const CoinGeckoTopCommandOptionsSchema = z.object({
  vs: z.string().trim().min(1).default('usd'),
  limit: z.coerce.number().int().min(1).max(250).default(100),
  page: z.coerce.number().int().min(1).default(1),
  category: z.string().trim().min(1).nullish(),
  change: z
    .string()
    .trim()
    .min(1)
    .transform((value) => value.split(',').map((part) => part.trim()))
    .pipe(CoinGeckoChangeWindowSchema.array().min(1))
    .nullish(),
  order: CoinGeckoOrderSchema.default('market_cap_desc'),
  out: z.string().nullish()
})

export const CoinGeckoGlobalCommandOptionsSchema = z.object({
  out: z.string().nullish()
})

export const CoinGeckoTrendingCommandOptionsSchema = z.object({
  out: z.string().nullish()
})

export const CoinGeckoCoinCommandOptionsSchema = z.object({
  id: z.string().trim().min(1),
  out: z.string().nullish()
})

export const CoinGeckoOhlcCommandOptionsSchema = z.object({
  id: z.string().trim().min(1),
  days: CoinGeckoOhlcDaysSchema,
  vs: z.string().trim().min(1).default('usd'),
  out: z.string().nullish()
})

export const CoinGeckoSearchCommandOptionsSchema = z.object({
  query: z.string().trim().min(1),
  out: z.string().nullish()
})
