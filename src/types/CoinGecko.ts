import { z } from 'zod'

// ─── Wire schemas ───
// CoinGecko payloads are wide and loosely typed; only the fields the commands
// actually surface are modelled. Everything else is ignored on parse.

// Errors come back two ways: `{"error":"coin not found"}` and
// `{"status":{"error_code":…,"error_message":…}}`.
export const CoinGeckoErrorSchema = z.union([
  z.object({ error: z.string() }),
  z.object({
    status: z.object({
      error_code: z.number().nullish(),
      error_message: z.string().nullish()
    })
  })
])

const CoinGeckoMarketDataSchema = z.object({
  current_price: z.record(z.string(), z.number().nullish()).nullish(),
  market_cap: z.record(z.string(), z.number().nullish()).nullish(),
  total_volume: z.record(z.string(), z.number().nullish()).nullish(),
  price_change_percentage_24h: z.number().nullish(),
  circulating_supply: z.number().nullish(),
  total_supply: z.number().nullish(),
  max_supply: z.number().nullish()
})

const CoinGeckoCommunityDataSchema = z.object({
  twitter_followers: z.number().nullish(),
  reddit_subscribers: z.number().nullish(),
  telegram_channel_user_count: z.number().nullish()
})

const CoinGeckoDeveloperDataSchema = z.object({
  stars: z.number().nullish(),
  forks: z.number().nullish(),
  total_issues: z.number().nullish(),
  closed_issues: z.number().nullish(),
  commit_count_4_weeks: z.number().nullish()
})

const CoinGeckoLinksSchema = z.object({
  homepage: z.array(z.string()).nullish(),
  twitter_screen_name: z.string().nullish(),
  subreddit_url: z.string().nullish(),
  repos_url: z.record(z.string(), z.array(z.string()).nullish()).nullish()
})

export const CoinGeckoCoinDetailSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  name: z.string(),
  categories: z.array(z.string().nullish()).nullish(),
  description: z.record(z.string(), z.string().nullish()).nullish(),
  links: CoinGeckoLinksSchema.nullish(),
  country_origin: z.string().nullish(),
  genesis_date: z.string().nullish(),
  market_cap_rank: z.number().nullish(),
  market_data: CoinGeckoMarketDataSchema.nullish(),
  community_data: CoinGeckoCommunityDataSchema.nullish(),
  developer_data: CoinGeckoDeveloperDataSchema.nullish(),
  last_updated: z.string().nullish()
})
export type CoinGeckoCoinDetail = z.infer<typeof CoinGeckoCoinDetailSchema>

export const CoinGeckoCoinHistorySchema = z.object({
  id: z.string(),
  symbol: z.string(),
  name: z.string(),
  market_data: CoinGeckoMarketDataSchema.nullish()
})

export const CoinGeckoMarketChartSchema = z.object({
  prices: z.array(z.tuple([z.number(), z.number()])).nullish(),
  market_caps: z.array(z.tuple([z.number(), z.number()])).nullish(),
  total_volumes: z.array(z.tuple([z.number(), z.number()])).nullish()
})
export type CoinGeckoMarketChart = z.infer<typeof CoinGeckoMarketChartSchema>

export const CoinGeckoOhlcSchema = z.array(
  z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()])
)

// Top-level array of [timestamp_ms, supply], where supply arrives as a string.
export const CoinGeckoSupplyChartSchema = z.array(z.tuple([z.number(), z.coerce.number()]))

const CoinGeckoTickerSchema = z.object({
  base: z.string().nullish(),
  target: z.string().nullish(),
  market: z
    .object({
      name: z.string().nullish(),
      identifier: z.string().nullish()
    })
    .nullish(),
  last: z.number().nullish(),
  volume: z.number().nullish(),
  converted_last: z.record(z.string(), z.number().nullish()).nullish(),
  converted_volume: z.record(z.string(), z.number().nullish()).nullish(),
  trust_score: z.string().nullish(),
  trade_url: z.string().nullish()
})

export const CoinGeckoCoinTickersSchema = z.object({
  name: z.string().nullish(),
  tickers: z.array(CoinGeckoTickerSchema).nullish()
})

export const CoinGeckoSearchSchema = z.object({
  coins: z
    .array(
      z.object({
        id: z.string(),
        symbol: z.string().nullish(),
        name: z.string().nullish(),
        market_cap_rank: z.number().nullish()
      })
    )
    .nullish()
})

export const CoinSearchResultSchema = z.object({
  id: z.string(),
  symbol: z.string().nullish(),
  name: z.string().nullish(),
  rank: z.number().nullish()
})
export type CoinSearchResult = z.infer<typeof CoinSearchResultSchema>

export const CoinGeckoExchangeRatesSchema = z.object({
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

export const CoinGeckoSupportedCurrenciesSchema = z.array(z.string())

export const CoinGeckoSimplePriceSchema = z.record(
  z.string(),
  z.record(z.string(), z.number().nullish())
)
export type CoinGeckoSimplePrice = z.infer<typeof CoinGeckoSimplePriceSchema>

// ─── Command inputs ───

// CoinGecko rejects any other value on /ohlc with `Invalid days parameter`.
export const CoinGeckoOhlcDaysSchema = z.enum(['1', '7', '14', '30', '90', '180', '365', 'max'])
export type CoinGeckoOhlcDays = z.infer<typeof CoinGeckoOhlcDaysSchema>

export const CoinGeckoDaysSchema = z.union([z.coerce.number().int().positive(), z.literal('max')])
export type CoinGeckoDays = z.infer<typeof CoinGeckoDaysSchema>

export const CoinGeckoIntervalSchema = z.enum(['daily', 'hourly'])
export type CoinGeckoInterval = z.infer<typeof CoinGeckoIntervalSchema>

export const SupplyKindSchema = z.enum(['circulating', 'total'])
export type SupplyKind = z.infer<typeof SupplyKindSchema>

export const TickersOrderSchema = z.enum(['trust_score_desc', 'volume_desc'])
export type TickersOrder = z.infer<typeof TickersOrderSchema>

// ─── Command outputs ───

export const CoinProfileSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  name: z.string(),
  rank: z.number().nullish(),
  price_usd: z.number().nullish(),
  market_cap_usd: z.number().nullish(),
  volume_24h_usd: z.number().nullish(),
  change_24h_pct: z.number().nullish(),
  circulating_supply: z.number().nullish(),
  total_supply: z.number().nullish(),
  max_supply: z.number().nullish(),
  categories: z.array(z.string()),
  homepage: z.string().nullish(),
  genesis_date: z.string().nullish(),
  country_origin: z.string().nullish(),
  description: z.string().nullish(),
  community: CoinGeckoCommunityDataSchema.nullish(),
  developer: CoinGeckoDeveloperDataSchema.nullish(),
  last_updated: z.string().nullish()
})
export type CoinProfile = z.infer<typeof CoinProfileSchema>

export const CoinHistorySnapshotSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  name: z.string(),
  date: z.string(),
  price_usd: z.number().nullish(),
  market_cap_usd: z.number().nullish(),
  volume_24h_usd: z.number().nullish()
})
export type CoinHistorySnapshot = z.infer<typeof CoinHistorySnapshotSchema>

export const MarketChartPointSchema = z.object({
  t: z.number().int(),
  price: z.number().nullish(),
  market_cap: z.number().nullish(),
  volume: z.number().nullish()
})
export type MarketChartPoint = z.infer<typeof MarketChartPointSchema>

export const MarketChartResultSchema = z.object({
  id: z.string(),
  vs_currency: z.string(),
  count: z.number().int(),
  points: z.array(MarketChartPointSchema)
})
export type MarketChartResult = z.infer<typeof MarketChartResultSchema>

const OhlcCandleSchema = z.object({
  t: z.number().int(),
  o: z.number(),
  h: z.number(),
  l: z.number(),
  c: z.number()
})

export const OhlcResultSchema = z.object({
  id: z.string(),
  vs_currency: z.string(),
  count: z.number().int(),
  candles: z.array(OhlcCandleSchema)
})
export type OhlcResult = z.infer<typeof OhlcResultSchema>

const SupplyPointSchema = z.object({
  t: z.number().int(),
  supply: z.number()
})

export const SupplyChartResultSchema = z.object({
  id: z.string(),
  kind: SupplyKindSchema,
  count: z.number().int(),
  points: z.array(SupplyPointSchema)
})
export type SupplyChartResult = z.infer<typeof SupplyChartResultSchema>

export const CoinTickerRowSchema = z.object({
  exchange: z.string().nullish(),
  base: z.string().nullish(),
  target: z.string().nullish(),
  last: z.number().nullish(),
  volume: z.number().nullish(),
  converted_last_usd: z.number().nullish(),
  converted_volume_usd: z.number().nullish(),
  trust_score: z.string().nullish(),
  trade_url: z.string().nullish()
})
export type CoinTickerRow = z.infer<typeof CoinTickerRowSchema>

export const ExchangeRateRowSchema = z.object({
  code: z.string(),
  name: z.string().nullish(),
  unit: z.string().nullish(),
  value: z.number().nullish(),
  type: z.string().nullish()
})
export type ExchangeRateRow = z.infer<typeof ExchangeRateRowSchema>
