import { z } from 'zod'

// ---------------------------------------------------------------------------
// Raw CoinGecko Pro onchain payloads (pro-api.coingecko.com/api/v3/onchain,
// GeckoTerminal DEX data). JSON:API style: {data: [{id, type, attributes}]}.
// Shapes follow docs.coingecko.com "Onchain DEX" endpoints; only surfaced
// fields are modeled. Numeric pool fields arrive as decimal strings, so they
// are accepted as string-or-number and normalized in the service.
// ---------------------------------------------------------------------------

const CoinGeckoOnchainDecimalSchema = z.union([z.string(), z.number()])

export const CoinGeckoOnchainNetworksResponseSchema = z.object({
  data: z
    .array(
      z.object({
        id: z.string(),
        attributes: z
          .object({
            name: z.string().nullish(),
            coingecko_asset_platform_id: z.string().nullish()
          })
          .nullish()
      })
    )
    .nullish()
})
export type CoinGeckoOnchainNetworksResponse = z.infer<
  typeof CoinGeckoOnchainNetworksResponseSchema
>

export const CoinGeckoOnchainDexesResponseSchema = z.object({
  data: z
    .array(
      z.object({
        id: z.string(),
        attributes: z.object({ name: z.string().nullish() }).nullish()
      })
    )
    .nullish()
})
export type CoinGeckoOnchainDexesResponse = z.infer<typeof CoinGeckoOnchainDexesResponseSchema>

const CoinGeckoOnchainTxWindowSchema = z.object({
  buys: z.number().nullish(),
  sells: z.number().nullish(),
  buyers: z.number().nullish(),
  sellers: z.number().nullish()
})

export const CoinGeckoOnchainPoolSchema = z.object({
  id: z.string(),
  attributes: z
    .object({
      address: z.string().nullish(),
      name: z.string().nullish(),
      pool_created_at: z.string().nullish(),
      base_token_price_usd: CoinGeckoOnchainDecimalSchema.nullish(),
      quote_token_price_usd: CoinGeckoOnchainDecimalSchema.nullish(),
      fdv_usd: CoinGeckoOnchainDecimalSchema.nullish(),
      market_cap_usd: CoinGeckoOnchainDecimalSchema.nullish(),
      reserve_in_usd: CoinGeckoOnchainDecimalSchema.nullish(),
      price_change_percentage: z
        .record(z.string(), CoinGeckoOnchainDecimalSchema.nullish())
        .nullish(),
      volume_usd: z.record(z.string(), CoinGeckoOnchainDecimalSchema.nullish()).nullish(),
      transactions: z.record(z.string(), CoinGeckoOnchainTxWindowSchema.nullish()).nullish()
    })
    .nullish(),
  relationships: z
    .object({
      dex: z.object({ data: z.object({ id: z.string().nullish() }).nullish() }).nullish()
    })
    .nullish()
})
export type CoinGeckoOnchainPool = z.infer<typeof CoinGeckoOnchainPoolSchema>

export const CoinGeckoOnchainPoolsResponseSchema = z.object({
  data: z.array(CoinGeckoOnchainPoolSchema).nullish()
})
export type CoinGeckoOnchainPoolsResponse = z.infer<typeof CoinGeckoOnchainPoolsResponseSchema>

export const CoinGeckoOnchainPoolResponseSchema = z.object({
  data: CoinGeckoOnchainPoolSchema
})
export type CoinGeckoOnchainPoolResponse = z.infer<typeof CoinGeckoOnchainPoolResponseSchema>

// ohlcv_list rows are [epoch_seconds, open, high, low, close, volume].
export const CoinGeckoOnchainOhlcvResponseSchema = z.object({
  data: z.object({
    attributes: z.object({
      ohlcv_list: z
        .array(
          z.tuple([
            z.number(),
            z.number(),
            z.number(),
            z.number(),
            z.number(),
            z.number().nullish()
          ])
        )
        .nullish()
    })
  })
})
export type CoinGeckoOnchainOhlcvResponse = z.infer<typeof CoinGeckoOnchainOhlcvResponseSchema>

export const CoinGeckoOnchainCategoriesResponseSchema = z.object({
  data: z
    .array(
      z.object({
        id: z.string(),
        attributes: z
          .object({
            name: z.string().nullish(),
            h24_volume_usd: CoinGeckoOnchainDecimalSchema.nullish(),
            reserve_in_usd: CoinGeckoOnchainDecimalSchema.nullish(),
            fdv_usd: CoinGeckoOnchainDecimalSchema.nullish(),
            h24_tx_count: z.number().nullish()
          })
          .nullish()
      })
    )
    .nullish()
})
export type CoinGeckoOnchainCategoriesResponse = z.infer<
  typeof CoinGeckoOnchainCategoriesResponseSchema
>

export const CoinGeckoOnchainTokensInfoResponseSchema = z.object({
  data: z
    .array(
      z.object({
        id: z.string(),
        attributes: z
          .object({
            address: z.string().nullish(),
            name: z.string().nullish(),
            symbol: z.string().nullish(),
            coingecko_coin_id: z.string().nullish(),
            gt_score: z.number().nullish(),
            metadata_updated_at: z.string().nullish()
          })
          .nullish()
      })
    )
    .nullish()
})
export type CoinGeckoOnchainTokensInfoResponse = z.infer<
  typeof CoinGeckoOnchainTokensInfoResponseSchema
>

export const CoinGeckoOnchainTradesResponseSchema = z.object({
  data: z
    .array(
      z.object({
        attributes: z
          .object({
            block_timestamp: z.string().nullish(),
            tx_hash: z.string().nullish(),
            kind: z.string().nullish(),
            volume_in_usd: CoinGeckoOnchainDecimalSchema.nullish(),
            price_from_in_usd: CoinGeckoOnchainDecimalSchema.nullish(),
            price_to_in_usd: CoinGeckoOnchainDecimalSchema.nullish(),
            from_token_amount: CoinGeckoOnchainDecimalSchema.nullish(),
            to_token_amount: CoinGeckoOnchainDecimalSchema.nullish()
          })
          .nullish()
      })
    )
    .nullish()
})
export type CoinGeckoOnchainTradesResponse = z.infer<typeof CoinGeckoOnchainTradesResponseSchema>

// ---------------------------------------------------------------------------
// Agent-facing output shapes printed by `tribes-cli onchain`.
// ---------------------------------------------------------------------------

export const OnchainTimeframeSchema = z.enum(['minute', 'hour', 'day'])
export type OnchainTimeframe = z.infer<typeof OnchainTimeframeSchema>

export const OnchainNetworksSchema = z.object({
  source: z.literal('geckoterminal'),
  networks: z.array(
    z.object({
      id: z.string(),
      name: z.string().nullish(),
      coingecko_id: z.string().nullish()
    })
  )
})
export type OnchainNetworks = z.infer<typeof OnchainNetworksSchema>

export const OnchainDexesSchema = z.object({
  source: z.literal('geckoterminal'),
  network: z.string(),
  dexes: z.array(
    z.object({
      id: z.string(),
      name: z.string().nullish()
    })
  )
})
export type OnchainDexes = z.infer<typeof OnchainDexesSchema>

const OnchainPoolRowSchema = z.object({
  network: z.string().nullish(),
  address: z.string().nullish(),
  name: z.string().nullish(),
  dex: z.string().nullish(),
  price_usd: z.number().nullish(),
  change_1h_pct: z.number().nullish(),
  change_24h_pct: z.number().nullish(),
  volume_24h_usd: z.number().nullish(),
  reserve_usd: z.number().nullish(),
  fdv_usd: z.number().nullish(),
  buys_24h: z.number().nullish(),
  sells_24h: z.number().nullish(),
  created_at: z.string().nullish()
})
export type OnchainPoolRow = z.infer<typeof OnchainPoolRowSchema>

export const OnchainPoolsSchema = z.object({
  source: z.literal('geckoterminal'),
  pools: z.array(OnchainPoolRowSchema)
})
export type OnchainPools = z.infer<typeof OnchainPoolsSchema>

export const OnchainSearchResultsSchema = z.object({
  source: z.literal('geckoterminal'),
  query: z.string(),
  pools: z.array(OnchainPoolRowSchema)
})
export type OnchainSearchResults = z.infer<typeof OnchainSearchResultsSchema>

export const OnchainCategoriesSchema = z.object({
  source: z.literal('geckoterminal'),
  categories: z.array(
    z.object({
      id: z.string(),
      name: z.string().nullish(),
      volume_24h_usd: z.number().nullish(),
      reserve_usd: z.number().nullish(),
      fdv_usd: z.number().nullish(),
      tx_24h: z.number().nullish()
    })
  )
})
export type OnchainCategories = z.infer<typeof OnchainCategoriesSchema>

export const OnchainCategoryPoolsSchema = z.object({
  source: z.literal('geckoterminal'),
  category: z.string(),
  pools: z.array(OnchainPoolRowSchema)
})
export type OnchainCategoryPools = z.infer<typeof OnchainCategoryPoolsSchema>

export const OnchainRecentTokensSchema = z.object({
  source: z.literal('geckoterminal'),
  tokens: z.array(
    z.object({
      network: z.string().nullish(),
      address: z.string().nullish(),
      name: z.string().nullish(),
      symbol: z.string().nullish(),
      coingecko_id: z.string().nullish(),
      gt_score: z.number().nullish(),
      updated_at: z.string().nullish()
    })
  )
})
export type OnchainRecentTokens = z.infer<typeof OnchainRecentTokensSchema>

const OnchainWindowedNumbersSchema = z.object({
  m5: z.number().nullish(),
  h1: z.number().nullish(),
  h6: z.number().nullish(),
  h24: z.number().nullish()
})

export const OnchainPoolSnapshotSchema = z.object({
  source: z.literal('geckoterminal'),
  network: z.string(),
  address: z.string(),
  name: z.string().nullish(),
  dex: z.string().nullish(),
  price_usd: z.number().nullish(),
  quote_token_price_usd: z.number().nullish(),
  reserve_usd: z.number().nullish(),
  fdv_usd: z.number().nullish(),
  market_cap_usd: z.number().nullish(),
  change_pct: OnchainWindowedNumbersSchema,
  volume_usd: OnchainWindowedNumbersSchema,
  tx_24h: z.object({
    buys: z.number().nullish(),
    sells: z.number().nullish(),
    buyers: z.number().nullish(),
    sellers: z.number().nullish()
  }),
  created_at: z.string().nullish()
})
export type OnchainPoolSnapshot = z.infer<typeof OnchainPoolSnapshotSchema>

// Shared candle contract: t in epoch ms.
const OnchainCandleSchema = z.object({
  t: z.number(),
  o: z.number(),
  h: z.number(),
  l: z.number(),
  c: z.number(),
  v: z.number().nullish()
})

export const OnchainPoolOhlcvSchema = z.object({
  source: z.literal('geckoterminal'),
  candles: z.array(OnchainCandleSchema)
})
export type OnchainPoolOhlcv = z.infer<typeof OnchainPoolOhlcvSchema>

const OnchainTradeRowSchema = z.object({
  t: z.number().nullish(),
  tx_hash: z.string().nullish(),
  side: z.string().nullish(),
  volume_usd: z.number().nullish(),
  price_from_usd: z.number().nullish(),
  price_to_usd: z.number().nullish(),
  from_amount: z.number().nullish(),
  to_amount: z.number().nullish()
})

export const OnchainPoolTradesSchema = z.object({
  source: z.literal('geckoterminal'),
  network: z.string(),
  address: z.string(),
  trades: z.array(OnchainTradeRowSchema)
})
export type OnchainPoolTrades = z.infer<typeof OnchainPoolTradesSchema>

// ---------------------------------------------------------------------------
// `tribes-cli onchain` command options.
// ---------------------------------------------------------------------------

export const OnchainNetworksCommandOptionsSchema = z.object({
  limit: z.number().int().min(1).max(100).nullish(),
  out: z.string().nullish()
})
export type OnchainNetworksCommandOptions = z.infer<typeof OnchainNetworksCommandOptionsSchema>

export const OnchainDexesCommandOptionsSchema = z.object({
  network: z.string().min(1),
  limit: z.number().int().min(1).max(100).nullish(),
  out: z.string().nullish()
})
export type OnchainDexesCommandOptions = z.infer<typeof OnchainDexesCommandOptionsSchema>

export const OnchainTrendingPoolsCommandOptionsSchema = z.object({
  network: z.string().min(1).nullish(),
  limit: z.number().int().min(1).max(20).nullish(),
  out: z.string().nullish()
})
export type OnchainTrendingPoolsCommandOptions = z.infer<
  typeof OnchainTrendingPoolsCommandOptionsSchema
>

export const OnchainTopPoolsCommandOptionsSchema = z.object({
  network: z.string().min(1),
  dex: z.string().min(1).nullish(),
  limit: z.number().int().min(1).max(20).nullish(),
  out: z.string().nullish()
})
export type OnchainTopPoolsCommandOptions = z.infer<typeof OnchainTopPoolsCommandOptionsSchema>

export const OnchainNewPoolsCommandOptionsSchema = z.object({
  network: z.string().min(1).nullish(),
  limit: z.number().int().min(1).max(20).nullish(),
  out: z.string().nullish()
})
export type OnchainNewPoolsCommandOptions = z.infer<typeof OnchainNewPoolsCommandOptionsSchema>

export const OnchainPoolCommandOptionsSchema = z.object({
  network: z.string().min(1),
  address: z.string().min(1),
  out: z.string().nullish()
})
export type OnchainPoolCommandOptions = z.infer<typeof OnchainPoolCommandOptionsSchema>

export const OnchainPoolOhlcvCommandOptionsSchema = z.object({
  network: z.string().min(1),
  address: z.string().min(1),
  timeframe: OnchainTimeframeSchema,
  aggregate: z.number().int().min(1).nullish(),
  limit: z.number().int().min(1).max(1000).nullish(),
  out: z.string().nullish()
})
export type OnchainPoolOhlcvCommandOptions = z.infer<typeof OnchainPoolOhlcvCommandOptionsSchema>

export const OnchainPoolTradesCommandOptionsSchema = z.object({
  network: z.string().min(1),
  address: z.string().min(1),
  limit: z.number().int().min(1).max(300).nullish(),
  out: z.string().nullish()
})
export type OnchainPoolTradesCommandOptions = z.infer<typeof OnchainPoolTradesCommandOptionsSchema>

export const OnchainSearchCommandOptionsSchema = z.object({
  query: z.string().min(1),
  network: z.string().min(1).nullish(),
  out: z.string().nullish()
})
export type OnchainSearchCommandOptions = z.infer<typeof OnchainSearchCommandOptionsSchema>

export const OnchainMegafilterCommandOptionsSchema = z.object({
  networks: z.string().min(1).nullish(),
  dexes: z.string().min(1).nullish(),
  minFdv: z.number().min(0).nullish(),
  minLiquidity: z.number().min(0).nullish(),
  minVolume: z.number().min(0).nullish(),
  sort: z.string().min(1).nullish(),
  limit: z.number().int().min(1).max(20).nullish(),
  out: z.string().nullish()
})
export type OnchainMegafilterCommandOptions = z.infer<typeof OnchainMegafilterCommandOptionsSchema>

export const OnchainCategoriesCommandOptionsSchema = z.object({
  limit: z.number().int().min(1).max(100).nullish(),
  out: z.string().nullish()
})
export type OnchainCategoriesCommandOptions = z.infer<typeof OnchainCategoriesCommandOptionsSchema>

export const OnchainPoolsByCategoryCommandOptionsSchema = z.object({
  category: z.string().min(1),
  limit: z.number().int().min(1).max(20).nullish(),
  out: z.string().nullish()
})
export type OnchainPoolsByCategoryCommandOptions = z.infer<
  typeof OnchainPoolsByCategoryCommandOptionsSchema
>

export const OnchainTrendingSearchCommandOptionsSchema = z.object({
  limit: z.number().int().min(1).max(10).nullish(),
  out: z.string().nullish()
})
export type OnchainTrendingSearchCommandOptions = z.infer<
  typeof OnchainTrendingSearchCommandOptionsSchema
>

export const OnchainPairOhlcvCommandOptionsSchema = z.object({
  network: z.string().min(1),
  pool: z.string().min(1),
  base: z.string().min(1),
  quote: z.string().min(1),
  timeframe: OnchainTimeframeSchema,
  aggregate: z.number().int().min(1).nullish(),
  limit: z.number().int().min(1).max(1000).nullish(),
  out: z.string().nullish()
})
export type OnchainPairOhlcvCommandOptions = z.infer<typeof OnchainPairOhlcvCommandOptionsSchema>

export const OnchainRecentlyUpdatedCommandOptionsSchema = z.object({
  limit: z.number().int().min(1).max(100).nullish(),
  out: z.string().nullish()
})
export type OnchainRecentlyUpdatedCommandOptions = z.infer<
  typeof OnchainRecentlyUpdatedCommandOptionsSchema
>
