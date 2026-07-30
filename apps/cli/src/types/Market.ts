import { z } from 'zod'

// ---------------------------------------------------------------------------
// Raw CoinGecko Pro payloads (pro-api.coingecko.com). Only the fields the
// harness surfaces are modeled; everything else is ignored at parse time.
// ---------------------------------------------------------------------------

export const CoinGeckoGlobalResponseSchema = z.object({
  data: z.object({
    active_cryptocurrencies: z.number().nullish(),
    markets: z.number().nullish(),
    total_market_cap: z.record(z.string(), z.number()).nullish(),
    total_volume: z.record(z.string(), z.number()).nullish(),
    market_cap_percentage: z.record(z.string(), z.number()).nullish(),
    market_cap_change_percentage_24h_usd: z.number().nullish(),
    updated_at: z.number().nullish()
  })
})
export type CoinGeckoGlobalResponse = z.infer<typeof CoinGeckoGlobalResponseSchema>

// Most DeFi aggregate fields arrive as decimal strings, not numbers.
export const CoinGeckoDefiResponseSchema = z.object({
  data: z.object({
    defi_market_cap: z.string().nullish(),
    trading_volume_24h: z.string().nullish(),
    defi_dominance: z.string().nullish(),
    top_coin_name: z.string().nullish(),
    top_coin_defi_dominance: z.number().nullish()
  })
})
export type CoinGeckoDefiResponse = z.infer<typeof CoinGeckoDefiResponseSchema>

export const CoinGeckoMarketCapChartResponseSchema = z.object({
  market_cap_chart: z.object({
    market_cap: z.array(z.tuple([z.number(), z.number()])).nullish(),
    volume: z.array(z.tuple([z.number(), z.number()])).nullish()
  })
})
export type CoinGeckoMarketCapChartResponse = z.infer<typeof CoinGeckoMarketCapChartResponseSchema>

export const CoinGeckoMarketsRowSchema = z.object({
  id: z.string(),
  symbol: z.string().nullish(),
  name: z.string().nullish(),
  market_cap_rank: z.number().nullish(),
  current_price: z.number().nullish(),
  market_cap: z.number().nullish(),
  total_volume: z.number().nullish(),
  price_change_percentage_1h_in_currency: z.number().nullish(),
  price_change_percentage_24h_in_currency: z.number().nullish(),
  price_change_percentage_7d_in_currency: z.number().nullish()
})
export type CoinGeckoMarketsRow = z.infer<typeof CoinGeckoMarketsRowSchema>

// The per-duration change lives in a dynamic `usd_<duration>_change` field, so
// unknown keys are kept and read through the catchall index signature.
export const CoinGeckoMoversRowSchema = z
  .object({
    id: z.string(),
    symbol: z.string().nullish(),
    name: z.string().nullish(),
    market_cap_rank: z.number().nullish(),
    usd: z.number().nullish(),
    usd_24h_vol: z.number().nullish()
  })
  .catchall(z.unknown())
export type CoinGeckoMoversRow = z.infer<typeof CoinGeckoMoversRowSchema>

export const CoinGeckoMoversResponseSchema = z.object({
  top_gainers: z.array(CoinGeckoMoversRowSchema).nullish(),
  top_losers: z.array(CoinGeckoMoversRowSchema).nullish()
})
export type CoinGeckoMoversResponse = z.infer<typeof CoinGeckoMoversResponseSchema>

export const CoinGeckoCategoryRowSchema = z.object({
  id: z.string(),
  name: z.string().nullish(),
  market_cap: z.number().nullish(),
  market_cap_change_24h: z.number().nullish(),
  volume_24h: z.number().nullish(),
  top_3_coins_id: z.array(z.string().nullish()).nullish()
})
export type CoinGeckoCategoryRow = z.infer<typeof CoinGeckoCategoryRowSchema>

export const CoinGeckoNewCoinRowSchema = z.object({
  id: z.string(),
  symbol: z.string().nullish(),
  name: z.string().nullish(),
  activated_at: z.number().nullish()
})
export type CoinGeckoNewCoinRow = z.infer<typeof CoinGeckoNewCoinRowSchema>

export const CoinGeckoSimplePriceResponseSchema = z.record(
  z.string(),
  z.object({
    usd: z.number().nullish(),
    usd_market_cap: z.number().nullish(),
    usd_24h_vol: z.number().nullish(),
    usd_24h_change: z.number().nullish(),
    last_updated_at: z.number().nullish()
  })
)
export type CoinGeckoSimplePriceResponse = z.infer<typeof CoinGeckoSimplePriceResponseSchema>

export const CoinGeckoSearchResponseSchema = z.object({
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
export type CoinGeckoSearchResponse = z.infer<typeof CoinGeckoSearchResponseSchema>

export const CoinGeckoAssetPlatformRowSchema = z.object({
  id: z.string(),
  chain_identifier: z.number().nullish(),
  name: z.string().nullish(),
  shortname: z.string().nullish(),
  native_coin_id: z.string().nullish()
})
export type CoinGeckoAssetPlatformRow = z.infer<typeof CoinGeckoAssetPlatformRowSchema>

// tokenlists.org format served from /token_lists/{asset_platform_id}/all.json.
export const CoinGeckoTokenListResponseSchema = z.object({
  name: z.string().nullish(),
  timestamp: z.string().nullish(),
  tokens: z
    .array(
      z.object({
        address: z.string().nullish(),
        symbol: z.string().nullish(),
        name: z.string().nullish(),
        decimals: z.number().nullish()
      })
    )
    .nullish()
})
export type CoinGeckoTokenListResponse = z.infer<typeof CoinGeckoTokenListResponseSchema>

export const CoinGeckoSupportedCurrenciesResponseSchema = z.array(z.string())
export type CoinGeckoSupportedCurrenciesResponse = z.infer<
  typeof CoinGeckoSupportedCurrenciesResponseSchema
>

export const CoinGeckoTrendingResponseSchema = z.object({
  coins: z
    .array(
      z.object({
        item: z.object({
          id: z.string(),
          symbol: z.string().nullish(),
          name: z.string().nullish(),
          market_cap_rank: z.number().nullish(),
          data: z
            .object({
              price: z.number().nullish(),
              price_change_percentage_24h: z.record(z.string(), z.number()).nullish()
            })
            .nullish()
        })
      })
    )
    .nullish()
})
export type CoinGeckoTrendingResponse = z.infer<typeof CoinGeckoTrendingResponseSchema>

// ---------------------------------------------------------------------------
// Agent-facing output shapes printed by `tribes-cli market`.
// ---------------------------------------------------------------------------

export const MarketHistoryDaysSchema = z.enum(['1', '7', '14', '30', '90', '180', '365', 'max'])
export type MarketHistoryDays = z.infer<typeof MarketHistoryDaysSchema>

export const MarketMoversDurationSchema = z.enum(['1h', '24h', '7d', '14d', '30d', '60d', '1y'])
export type MarketMoversDuration = z.infer<typeof MarketMoversDurationSchema>

export const MarketGlobalSnapshotSchema = z.object({
  source: z.literal('coingecko'),
  active_cryptocurrencies: z.number().nullish(),
  markets: z.number().nullish(),
  market_cap_usd: z.number().nullish(),
  volume_24h_usd: z.number().nullish(),
  btc_dominance_pct: z.number().nullish(),
  eth_dominance_pct: z.number().nullish(),
  market_cap_change_24h_pct: z.number().nullish(),
  updated_at: z.number().nullish()
})
export type MarketGlobalSnapshot = z.infer<typeof MarketGlobalSnapshotSchema>

export const MarketDefiSnapshotSchema = z.object({
  source: z.literal('coingecko'),
  defi_market_cap_usd: z.number().nullish(),
  trading_volume_24h_usd: z.number().nullish(),
  defi_dominance_pct: z.number().nullish(),
  top_coin_name: z.string().nullish(),
  top_coin_dominance_pct: z.number().nullish()
})
export type MarketDefiSnapshot = z.infer<typeof MarketDefiSnapshotSchema>

const MarketHistoryPointSchema = z.object({
  t: z.number(),
  usd: z.number()
})

export const MarketCapHistorySchema = z.object({
  source: z.literal('coingecko'),
  days: MarketHistoryDaysSchema,
  market_cap: z.array(MarketHistoryPointSchema),
  volume: z.array(MarketHistoryPointSchema)
})
export type MarketCapHistory = z.infer<typeof MarketCapHistorySchema>

const MarketTopCoinRowSchema = z.object({
  id: z.string(),
  symbol: z.string().nullish(),
  name: z.string().nullish(),
  rank: z.number().nullish(),
  price_usd: z.number().nullish(),
  market_cap_usd: z.number().nullish(),
  volume_24h_usd: z.number().nullish(),
  change_1h_pct: z.number().nullish(),
  change_24h_pct: z.number().nullish(),
  change_7d_pct: z.number().nullish()
})

export const MarketTopCoinsSchema = z.object({
  source: z.literal('coingecko'),
  coins: z.array(MarketTopCoinRowSchema)
})
export type MarketTopCoins = z.infer<typeof MarketTopCoinsSchema>

const MarketMoverRowSchema = z.object({
  id: z.string(),
  symbol: z.string().nullish(),
  name: z.string().nullish(),
  rank: z.number().nullish(),
  price_usd: z.number().nullish(),
  volume_24h_usd: z.number().nullish(),
  change_pct: z.number().nullish()
})
export type MarketMoverRow = z.infer<typeof MarketMoverRowSchema>

export const MarketMoversSchema = z.object({
  source: z.literal('coingecko'),
  duration: MarketMoversDurationSchema,
  gainers: z.array(MarketMoverRowSchema),
  losers: z.array(MarketMoverRowSchema)
})
export type MarketMovers = z.infer<typeof MarketMoversSchema>

const MarketCategoryRowSchema = z.object({
  id: z.string(),
  name: z.string().nullish(),
  market_cap_usd: z.number().nullish(),
  change_24h_pct: z.number().nullish(),
  volume_24h_usd: z.number().nullish(),
  top_coins: z.array(z.string())
})

export const MarketCategoriesSchema = z.object({
  source: z.literal('coingecko'),
  categories: z.array(MarketCategoryRowSchema)
})
export type MarketCategories = z.infer<typeof MarketCategoriesSchema>

const MarketNewCoinSchema = z.object({
  id: z.string(),
  symbol: z.string().nullish(),
  name: z.string().nullish(),
  activated_at: z.number().nullish()
})

export const MarketNewCoinsSchema = z.object({
  source: z.literal('coingecko'),
  coins: z.array(MarketNewCoinSchema)
})
export type MarketNewCoins = z.infer<typeof MarketNewCoinsSchema>

const MarketPriceRowSchema = z.object({
  id: z.string(),
  price_usd: z.number().nullish(),
  market_cap_usd: z.number().nullish(),
  volume_24h_usd: z.number().nullish(),
  change_24h_pct: z.number().nullish(),
  updated_at: z.number().nullish()
})

export const MarketPricesSchema = z.object({
  source: z.literal('coingecko'),
  prices: z.array(MarketPriceRowSchema)
})
export type MarketPrices = z.infer<typeof MarketPricesSchema>

const MarketTokenPriceRowSchema = z.object({
  address: z.string(),
  price_usd: z.number().nullish(),
  market_cap_usd: z.number().nullish(),
  volume_24h_usd: z.number().nullish(),
  change_24h_pct: z.number().nullish(),
  updated_at: z.number().nullish()
})

export const MarketTokenPricesSchema = z.object({
  source: z.literal('coingecko'),
  platform: z.string(),
  prices: z.array(MarketTokenPriceRowSchema)
})
export type MarketTokenPrices = z.infer<typeof MarketTokenPricesSchema>

const MarketSearchCoinSchema = z.object({
  id: z.string(),
  symbol: z.string().nullish(),
  name: z.string().nullish(),
  rank: z.number().nullish()
})

export const MarketSearchResultsSchema = z.object({
  source: z.literal('coingecko'),
  query: z.string(),
  coins: z.array(MarketSearchCoinSchema)
})
export type MarketSearchResults = z.infer<typeof MarketSearchResultsSchema>

const MarketTrendingCoinSchema = z.object({
  id: z.string(),
  symbol: z.string().nullish(),
  name: z.string().nullish(),
  rank: z.number().nullish(),
  price_usd: z.number().nullish(),
  change_24h_pct: z.number().nullish()
})

export const MarketTrendingSchema = z.object({
  source: z.literal('coingecko'),
  coins: z.array(MarketTrendingCoinSchema)
})
export type MarketTrending = z.infer<typeof MarketTrendingSchema>

const MarketPlatformRowSchema = z.object({
  id: z.string(),
  name: z.string().nullish(),
  chain_id: z.number().nullish(),
  shortname: z.string().nullish(),
  native_coin_id: z.string().nullish()
})

export const MarketPlatformsSchema = z.object({
  source: z.literal('coingecko'),
  platforms: z.array(MarketPlatformRowSchema)
})
export type MarketPlatforms = z.infer<typeof MarketPlatformsSchema>

const MarketPlatformTokenRowSchema = z.object({
  symbol: z.string().nullish(),
  name: z.string().nullish(),
  address: z.string().nullish(),
  decimals: z.number().nullish()
})

export const MarketPlatformTokensSchema = z.object({
  source: z.literal('coingecko'),
  platform: z.string(),
  list_name: z.string().nullish(),
  updated_at: z.string().nullish(),
  total_tokens: z.number(),
  tokens: z.array(MarketPlatformTokenRowSchema)
})
export type MarketPlatformTokens = z.infer<typeof MarketPlatformTokensSchema>

export const MarketSupportedCurrenciesSchema = z.object({
  source: z.literal('coingecko'),
  currencies: z.array(z.string())
})
export type MarketSupportedCurrencies = z.infer<typeof MarketSupportedCurrenciesSchema>

// ---------------------------------------------------------------------------
// `tribes-cli market` command options.
// ---------------------------------------------------------------------------

export const MarketGlobalCommandOptionsSchema = z.object({
  out: z.string().nullish()
})
export type MarketGlobalCommandOptions = z.infer<typeof MarketGlobalCommandOptionsSchema>

export const MarketHistoryCommandOptionsSchema = z.object({
  days: MarketHistoryDaysSchema,
  out: z.string().nullish()
})
export type MarketHistoryCommandOptions = z.infer<typeof MarketHistoryCommandOptionsSchema>

export const MarketTopCommandOptionsSchema = z.object({
  limit: z.number().int().min(1).max(250).nullish(),
  out: z.string().nullish()
})
export type MarketTopCommandOptions = z.infer<typeof MarketTopCommandOptionsSchema>

export const MarketMoversCommandOptionsSchema = z.object({
  duration: MarketMoversDurationSchema.nullish(),
  out: z.string().nullish()
})
export type MarketMoversCommandOptions = z.infer<typeof MarketMoversCommandOptionsSchema>

export const MarketCategoriesCommandOptionsSchema = z.object({
  limit: z.number().int().min(1).max(250).nullish(),
  out: z.string().nullish()
})
export type MarketCategoriesCommandOptions = z.infer<typeof MarketCategoriesCommandOptionsSchema>

export const MarketNewCommandOptionsSchema = z.object({
  limit: z.number().int().min(1).max(200).nullish(),
  out: z.string().nullish()
})
export type MarketNewCommandOptions = z.infer<typeof MarketNewCommandOptionsSchema>

export const MarketPriceCommandOptionsSchema = z.object({
  ids: z.string().min(1),
  out: z.string().nullish()
})
export type MarketPriceCommandOptions = z.infer<typeof MarketPriceCommandOptionsSchema>

export const MarketSearchCommandOptionsSchema = z.object({
  query: z.string().min(1),
  out: z.string().nullish()
})
export type MarketSearchCommandOptions = z.infer<typeof MarketSearchCommandOptionsSchema>

export const MarketPlatformsCommandOptionsSchema = z.object({
  limit: z.number().int().min(1).max(500).nullish(),
  out: z.string().nullish()
})
export type MarketPlatformsCommandOptions = z.infer<typeof MarketPlatformsCommandOptionsSchema>

export const MarketPlatformTokensCommandOptionsSchema = z.object({
  platform: z.string().min(1),
  limit: z.number().int().min(1).max(1000).nullish(),
  out: z.string().nullish()
})
export type MarketPlatformTokensCommandOptions = z.infer<
  typeof MarketPlatformTokensCommandOptionsSchema
>

export const MarketCurrenciesCommandOptionsSchema = z.object({
  out: z.string().nullish()
})
export type MarketCurrenciesCommandOptions = z.infer<typeof MarketCurrenciesCommandOptionsSchema>
