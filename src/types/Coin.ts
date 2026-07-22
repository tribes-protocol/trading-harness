import { z } from 'zod'

// ---------------------------------------------------------------------------
// Raw CoinGecko Pro payloads (pro-api.coingecko.com) for the single-coin
// endpoints. Only the fields the harness surfaces are modeled; everything
// else is ignored at parse time. Shapes follow the CoinGecko Pro API docs
// (https://docs.coingecko.com/reference).
// ---------------------------------------------------------------------------

// Per-currency maps occasionally carry nulls (e.g. thin markets), so record
// values are nullish even where the docs show numbers.
const CoinGeckoCurrencyNumberMapSchema = z.record(z.string(), z.number().nullish())
const CoinGeckoCurrencyStringMapSchema = z.record(z.string(), z.string().nullish())

export const CoinGeckoCoinMarketDataSchema = z.object({
  current_price: CoinGeckoCurrencyNumberMapSchema.nullish(),
  market_cap: CoinGeckoCurrencyNumberMapSchema.nullish(),
  fully_diluted_valuation: CoinGeckoCurrencyNumberMapSchema.nullish(),
  total_volume: CoinGeckoCurrencyNumberMapSchema.nullish(),
  high_24h: CoinGeckoCurrencyNumberMapSchema.nullish(),
  low_24h: CoinGeckoCurrencyNumberMapSchema.nullish(),
  price_change_percentage_24h: z.number().nullish(),
  price_change_percentage_7d: z.number().nullish(),
  price_change_percentage_30d: z.number().nullish(),
  ath: CoinGeckoCurrencyNumberMapSchema.nullish(),
  ath_change_percentage: CoinGeckoCurrencyNumberMapSchema.nullish(),
  ath_date: CoinGeckoCurrencyStringMapSchema.nullish(),
  atl: CoinGeckoCurrencyNumberMapSchema.nullish(),
  atl_change_percentage: CoinGeckoCurrencyNumberMapSchema.nullish(),
  atl_date: CoinGeckoCurrencyStringMapSchema.nullish(),
  circulating_supply: z.number().nullish(),
  total_supply: z.number().nullish(),
  max_supply: z.number().nullish()
})
export type CoinGeckoCoinMarketData = z.infer<typeof CoinGeckoCoinMarketDataSchema>

export const CoinGeckoCoinProfileResponseSchema = z.object({
  id: z.string(),
  symbol: z.string().nullish(),
  name: z.string().nullish(),
  market_cap_rank: z.number().nullish(),
  categories: z.array(z.string().nullish()).nullish(),
  description: z.object({ en: z.string().nullish() }).nullish(),
  links: z
    .object({
      homepage: z.array(z.string().nullish()).nullish(),
      twitter_screen_name: z.string().nullish(),
      subreddit_url: z.string().nullish(),
      repos_url: z.object({ github: z.array(z.string().nullish()).nullish() }).nullish()
    })
    .nullish(),
  sentiment_votes_up_percentage: z.number().nullish(),
  sentiment_votes_down_percentage: z.number().nullish(),
  market_data: CoinGeckoCoinMarketDataSchema.nullish(),
  community_data: z
    .object({
      twitter_followers: z.number().nullish(),
      reddit_subscribers: z.number().nullish()
    })
    .nullish(),
  developer_data: z
    .object({
      stars: z.number().nullish(),
      forks: z.number().nullish(),
      commit_count_4_weeks: z.number().nullish()
    })
    .nullish()
})
export type CoinGeckoCoinProfileResponse = z.infer<typeof CoinGeckoCoinProfileResponseSchema>

export const CoinGeckoMarketChartResponseSchema = z.object({
  prices: z.array(z.tuple([z.number(), z.number()])).nullish(),
  market_caps: z.array(z.tuple([z.number(), z.number()])).nullish(),
  total_volumes: z.array(z.tuple([z.number(), z.number()])).nullish()
})
export type CoinGeckoMarketChartResponse = z.infer<typeof CoinGeckoMarketChartResponseSchema>

// /coins/{id}/ohlc rows: [timestamp_ms, open, high, low, close] — no volume.
export const CoinGeckoOhlcResponseSchema = z.array(
  z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()])
)
export type CoinGeckoOhlcResponse = z.infer<typeof CoinGeckoOhlcResponseSchema>

export const CoinGeckoTickerRowSchema = z.object({
  base: z.string().nullish(),
  target: z.string().nullish(),
  market: z.object({ name: z.string().nullish() }).nullish(),
  last: z.number().nullish(),
  converted_last: CoinGeckoCurrencyNumberMapSchema.nullish(),
  converted_volume: CoinGeckoCurrencyNumberMapSchema.nullish(),
  trust_score: z.string().nullish()
})
export type CoinGeckoTickerRow = z.infer<typeof CoinGeckoTickerRowSchema>

export const CoinGeckoTickersResponseSchema = z.object({
  tickers: z.array(CoinGeckoTickerRowSchema).nullish()
})
export type CoinGeckoTickersResponse = z.infer<typeof CoinGeckoTickersResponseSchema>

export const CoinGeckoContractResponseSchema = z.object({
  id: z.string(),
  symbol: z.string().nullish(),
  name: z.string().nullish(),
  market_cap_rank: z.number().nullish(),
  contract_address: z.string().nullish(),
  market_data: CoinGeckoCoinMarketDataSchema.nullish()
})
export type CoinGeckoContractResponse = z.infer<typeof CoinGeckoContractResponseSchema>

// Pro-only /coins/{id}/circulating_supply_chart; supply values arrive as
// decimal strings per the Pro docs.
export const CoinGeckoSupplyChartResponseSchema = z.object({
  circulating_supply: z.array(z.tuple([z.number(), z.union([z.number(), z.string()])])).nullish()
})
export type CoinGeckoSupplyChartResponse = z.infer<typeof CoinGeckoSupplyChartResponseSchema>

export const CoinGeckoExchangeRatesResponseSchema = z.object({
  rates: z.record(
    z.string(),
    z.object({
      name: z.string().nullish(),
      unit: z.string().nullish(),
      value: z.number().nullish(),
      type: z.string().nullish()
    })
  )
})
export type CoinGeckoExchangeRatesResponse = z.infer<typeof CoinGeckoExchangeRatesResponseSchema>

// ---------------------------------------------------------------------------
// Agent-facing output shapes printed by `tribes-cli coin`.
// ---------------------------------------------------------------------------

export const CoinDaysSchema = z.enum(['1', '7', '14', '30', '90', '180', '365', 'max'])
export type CoinDays = z.infer<typeof CoinDaysSchema>

export const CoinProfileSchema = z.object({
  source: z.literal('coingecko'),
  id: z.string(),
  symbol: z.string().nullish(),
  name: z.string().nullish(),
  rank: z.number().nullish(),
  price_usd: z.number().nullish(),
  market_cap_usd: z.number().nullish(),
  fdv_usd: z.number().nullish(),
  volume_24h_usd: z.number().nullish(),
  high_24h_usd: z.number().nullish(),
  low_24h_usd: z.number().nullish(),
  change_24h_pct: z.number().nullish(),
  change_7d_pct: z.number().nullish(),
  change_30d_pct: z.number().nullish(),
  ath_usd: z.number().nullish(),
  ath_change_pct: z.number().nullish(),
  ath_date: z.string().nullish(),
  atl_usd: z.number().nullish(),
  atl_change_pct: z.number().nullish(),
  atl_date: z.string().nullish(),
  circulating_supply: z.number().nullish(),
  total_supply: z.number().nullish(),
  max_supply: z.number().nullish(),
  sentiment_up_pct: z.number().nullish(),
  sentiment_down_pct: z.number().nullish(),
  twitter_followers: z.number().nullish(),
  reddit_subscribers: z.number().nullish(),
  github_stars: z.number().nullish(),
  github_forks: z.number().nullish(),
  commits_4w: z.number().nullish(),
  categories: z.array(z.string()),
  links: z.object({
    homepage: z.string().nullish(),
    twitter: z.string().nullish(),
    subreddit: z.string().nullish(),
    github: z.string().nullish()
  }),
  description: z.string().nullish()
})
export type CoinProfile = z.infer<typeof CoinProfileSchema>

const CoinChartPointSchema = z.object({
  t: z.number(),
  usd: z.number()
})

export const CoinChartSchema = z.object({
  source: z.literal('coingecko'),
  id: z.string(),
  days: CoinDaysSchema,
  prices: z.array(CoinChartPointSchema),
  market_caps: z.array(CoinChartPointSchema),
  volumes: z.array(CoinChartPointSchema)
})
export type CoinChart = z.infer<typeof CoinChartSchema>

// Shared candle contract: t in epoch ms, v nullish (CoinGecko ohlc has no
// volume).
const CoinCandleSchema = z.object({
  t: z.number(),
  o: z.number(),
  h: z.number(),
  l: z.number(),
  c: z.number(),
  v: z.number().nullish()
})

export const CoinCandlesSchema = z.object({
  source: z.literal('coingecko'),
  candles: z.array(CoinCandleSchema)
})
export type CoinCandles = z.infer<typeof CoinCandlesSchema>

const CoinTickerSchema = z.object({
  market: z.string().nullish(),
  pair: z.string().nullish(),
  price_usd: z.number().nullish(),
  volume_24h_usd: z.number().nullish(),
  trust_score: z.string().nullish()
})

export const CoinTickersSchema = z.object({
  source: z.literal('coingecko'),
  id: z.string(),
  tickers: z.array(CoinTickerSchema)
})
export type CoinTickers = z.infer<typeof CoinTickersSchema>

export const CoinContractSchema = z.object({
  source: z.literal('coingecko'),
  id: z.string(),
  symbol: z.string().nullish(),
  name: z.string().nullish(),
  rank: z.number().nullish(),
  platform: z.string(),
  address: z.string().nullish(),
  price_usd: z.number().nullish(),
  market_cap_usd: z.number().nullish(),
  fdv_usd: z.number().nullish(),
  volume_24h_usd: z.number().nullish(),
  change_24h_pct: z.number().nullish()
})
export type CoinContract = z.infer<typeof CoinContractSchema>

const CoinSupplyPointSchema = z.object({
  t: z.number(),
  supply: z.number().nullish()
})

export const CoinSupplyHistorySchema = z.object({
  source: z.literal('coingecko'),
  id: z.string(),
  days: CoinDaysSchema,
  supply: z.array(CoinSupplyPointSchema)
})
export type CoinSupplyHistory = z.infer<typeof CoinSupplyHistorySchema>

const CoinExchangeRateSchema = z.object({
  id: z.string(),
  name: z.string().nullish(),
  unit: z.string().nullish(),
  value: z.number().nullish(),
  type: z.string().nullish()
})

export const CoinExchangeRatesSchema = z.object({
  source: z.literal('coingecko'),
  base: z.literal('btc'),
  rates: z.array(CoinExchangeRateSchema)
})
export type CoinExchangeRates = z.infer<typeof CoinExchangeRatesSchema>

// ---------------------------------------------------------------------------
// `tribes-cli coin` command options.
// ---------------------------------------------------------------------------

export const CoinProfileCommandOptionsSchema = z.object({
  id: z.string().min(1),
  out: z.string().nullish()
})
export type CoinProfileCommandOptions = z.infer<typeof CoinProfileCommandOptionsSchema>

export const CoinChartCommandOptionsSchema = z.object({
  id: z.string().min(1),
  days: CoinDaysSchema,
  out: z.string().nullish()
})
export type CoinChartCommandOptions = z.infer<typeof CoinChartCommandOptionsSchema>

export const CoinOhlcCommandOptionsSchema = z.object({
  id: z.string().min(1),
  days: CoinDaysSchema,
  out: z.string().nullish()
})
export type CoinOhlcCommandOptions = z.infer<typeof CoinOhlcCommandOptionsSchema>

export const CoinTickersCommandOptionsSchema = z.object({
  id: z.string().min(1),
  limit: z.number().int().min(1).max(100).nullish(),
  out: z.string().nullish()
})
export type CoinTickersCommandOptions = z.infer<typeof CoinTickersCommandOptionsSchema>

export const CoinContractCommandOptionsSchema = z.object({
  platform: z.string().min(1),
  address: z.string().min(1),
  out: z.string().nullish()
})
export type CoinContractCommandOptions = z.infer<typeof CoinContractCommandOptionsSchema>

export const CoinSupplyCommandOptionsSchema = z.object({
  id: z.string().min(1),
  days: CoinDaysSchema,
  out: z.string().nullish()
})
export type CoinSupplyCommandOptions = z.infer<typeof CoinSupplyCommandOptionsSchema>

export const CoinRatesCommandOptionsSchema = z.object({
  out: z.string().nullish()
})
export type CoinRatesCommandOptions = z.infer<typeof CoinRatesCommandOptionsSchema>
