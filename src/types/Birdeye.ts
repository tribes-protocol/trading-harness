import { z } from 'zod'

// ---------------------------------------------------------------------------
// Raw BirdEye payloads (public-api.birdeye.so). Shapes follow the endpoint
// structures documented at https://docs.birdeye.so; only the fields the
// harness surfaces are modeled, and provider fields are nullish-guarded
// because coverage varies per chain.
// ---------------------------------------------------------------------------

// GET /defi/multi_price — record keyed by token address; unknown addresses
// come back as null entries.
export const BirdeyeMultiPriceResponseSchema = z.object({
  data: z.record(
    z.string(),
    z
      .object({
        value: z.number().nullish(),
        updateUnixTime: z.number().nullish(),
        priceChange24h: z.number().nullish(),
        liquidity: z.number().nullish()
      })
      .nullish()
  )
})
export type BirdeyeMultiPriceResponse = z.infer<typeof BirdeyeMultiPriceResponseSchema>

// GET /defi/token_overview
export const BirdeyeTokenOverviewResponseSchema = z.object({
  data: z.object({
    address: z.string().nullish(),
    symbol: z.string().nullish(),
    name: z.string().nullish(),
    price: z.number().nullish(),
    marketCap: z.number().nullish(),
    fdv: z.number().nullish(),
    liquidity: z.number().nullish(),
    v24hUSD: z.number().nullish(),
    trade24h: z.number().nullish(),
    holder: z.number().nullish(),
    uniqueWallet24h: z.number().nullish(),
    priceChange1hPercent: z.number().nullish(),
    priceChange24hPercent: z.number().nullish()
  })
})
export type BirdeyeTokenOverviewResponse = z.infer<typeof BirdeyeTokenOverviewResponseSchema>

// GET /defi/token_security — field set is chain-dependent (Solana shown in
// the docs); everything is nullish.
export const BirdeyeTokenSecurityResponseSchema = z.object({
  data: z.object({
    creatorAddress: z.string().nullish(),
    ownerAddress: z.string().nullish(),
    creationTime: z.number().nullish(),
    creatorPercentage: z.number().nullish(),
    ownerPercentage: z.number().nullish(),
    top10HolderBalance: z.number().nullish(),
    top10HolderPercent: z.number().nullish(),
    mutableMetadata: z.boolean().nullish(),
    freezeable: z.boolean().nullish(),
    freezeAuthority: z.string().nullish(),
    nonTransferable: z.boolean().nullish(),
    transferFeeEnable: z.boolean().nullish()
  })
})
export type BirdeyeTokenSecurityResponse = z.infer<typeof BirdeyeTokenSecurityResponseSchema>

// GET /defi/v3/token/holder
export const BirdeyeHolderResponseSchema = z.object({
  data: z.object({
    items: z
      .array(
        z.object({
          owner: z.string().nullish(),
          token_account: z.string().nullish(),
          ui_amount: z.number().nullish()
        })
      )
      .nullish()
  })
})
export type BirdeyeHolderResponse = z.infer<typeof BirdeyeHolderResponseSchema>

const BirdeyeTxsTokenSideSchema = z.object({
  symbol: z.string().nullish(),
  address: z.string().nullish(),
  uiAmount: z.number().nullish()
})

// GET /defi/txs/token
export const BirdeyeTxsTokenResponseSchema = z.object({
  data: z.object({
    items: z
      .array(
        z.object({
          txHash: z.string().nullish(),
          blockUnixTime: z.number().nullish(),
          side: z.string().nullish(),
          source: z.string().nullish(),
          owner: z.string().nullish(),
          volumeUSD: z.number().nullish(),
          from: BirdeyeTxsTokenSideSchema.nullish(),
          to: BirdeyeTxsTokenSideSchema.nullish()
        })
      )
      .nullish()
  })
})
export type BirdeyeTxsTokenResponse = z.infer<typeof BirdeyeTxsTokenResponseSchema>

// GET /defi/token_trending
export const BirdeyeTrendingResponseSchema = z.object({
  data: z.object({
    updateUnixTime: z.number().nullish(),
    tokens: z
      .array(
        z.object({
          address: z.string(),
          symbol: z.string().nullish(),
          name: z.string().nullish(),
          rank: z.number().nullish(),
          price: z.number().nullish(),
          price24hChangePercent: z.number().nullish(),
          volume24hUSD: z.number().nullish(),
          liquidity: z.number().nullish(),
          marketcap: z.number().nullish()
        })
      )
      .nullish()
  })
})
export type BirdeyeTrendingResponse = z.infer<typeof BirdeyeTrendingResponseSchema>

// GET /defi/v2/tokens/new_listing
export const BirdeyeNewListingResponseSchema = z.object({
  data: z.object({
    items: z
      .array(
        z.object({
          address: z.string(),
          symbol: z.string().nullish(),
          name: z.string().nullish(),
          liquidity: z.number().nullish(),
          liquidityAddedAt: z.string().nullish(),
          source: z.string().nullish()
        })
      )
      .nullish()
  })
})
export type BirdeyeNewListingResponse = z.infer<typeof BirdeyeNewListingResponseSchema>

// GET /defi/v3/ohlcv — unix_time is epoch seconds.
export const BirdeyeOhlcvResponseSchema = z.object({
  data: z.object({
    items: z
      .array(
        z.object({
          unix_time: z.number(),
          o: z.number(),
          h: z.number(),
          l: z.number(),
          c: z.number(),
          v: z.number().nullish()
        })
      )
      .nullish()
  })
})
export type BirdeyeOhlcvResponse = z.infer<typeof BirdeyeOhlcvResponseSchema>

// GET /v1/wallet/token_list
export const BirdeyeWalletTokenListResponseSchema = z.object({
  data: z.object({
    wallet: z.string().nullish(),
    totalUsd: z.number().nullish(),
    items: z
      .array(
        z.object({
          address: z.string(),
          symbol: z.string().nullish(),
          name: z.string().nullish(),
          uiAmount: z.number().nullish(),
          priceUsd: z.number().nullish(),
          valueUsd: z.number().nullish()
        })
      )
      .nullish()
  })
})
export type BirdeyeWalletTokenListResponse = z.infer<typeof BirdeyeWalletTokenListResponseSchema>

// ---------------------------------------------------------------------------
// Agent-facing output shapes printed by `tribes-cli token-data`.
// ---------------------------------------------------------------------------

export const TokenDataTimeframeSchema = z.enum(['1m', '5m', '15m', '1H', '4H', '1D', '1W'])
export type TokenDataTimeframe = z.infer<typeof TokenDataTimeframeSchema>

const TokenDataPriceRowSchema = z.object({
  address: z.string(),
  price_usd: z.number().nullish(),
  change_24h_pct: z.number().nullish(),
  liquidity_usd: z.number().nullish(),
  updated_at: z.number().nullish()
})

export const TokenDataPricesSchema = z.object({
  source: z.literal('birdeye'),
  chain: z.string(),
  prices: z.array(TokenDataPriceRowSchema)
})
export type TokenDataPrices = z.infer<typeof TokenDataPricesSchema>

export const TokenDataOverviewSchema = z.object({
  source: z.literal('birdeye'),
  chain: z.string(),
  address: z.string(),
  symbol: z.string().nullish(),
  name: z.string().nullish(),
  price_usd: z.number().nullish(),
  market_cap_usd: z.number().nullish(),
  fdv_usd: z.number().nullish(),
  liquidity_usd: z.number().nullish(),
  volume_24h_usd: z.number().nullish(),
  trades_24h: z.number().nullish(),
  holders: z.number().nullish(),
  unique_wallets_24h: z.number().nullish(),
  change_1h_pct: z.number().nullish(),
  change_24h_pct: z.number().nullish()
})
export type TokenDataOverview = z.infer<typeof TokenDataOverviewSchema>

export const TokenDataSecuritySchema = z.object({
  source: z.literal('birdeye'),
  chain: z.string(),
  address: z.string(),
  creator_address: z.string().nullish(),
  owner_address: z.string().nullish(),
  created_at: z.number().nullish(),
  creator_pct: z.number().nullish(),
  owner_pct: z.number().nullish(),
  top10_holder_pct: z.number().nullish(),
  mutable_metadata: z.boolean().nullish(),
  freezeable: z.boolean().nullish(),
  freeze_authority: z.string().nullish(),
  non_transferable: z.boolean().nullish(),
  transfer_fee_enabled: z.boolean().nullish()
})
export type TokenDataSecurity = z.infer<typeof TokenDataSecuritySchema>

const TokenDataHolderRowSchema = z.object({
  owner: z.string().nullish(),
  token_account: z.string().nullish(),
  ui_amount: z.number().nullish()
})

export const TokenDataHoldersSchema = z.object({
  source: z.literal('birdeye'),
  chain: z.string(),
  address: z.string(),
  holders: z.array(TokenDataHolderRowSchema)
})
export type TokenDataHolders = z.infer<typeof TokenDataHoldersSchema>

const TokenDataTradeRowSchema = z.object({
  tx_hash: z.string().nullish(),
  block_unix_time: z.number().nullish(),
  side: z.string().nullish(),
  dex: z.string().nullish(),
  owner: z.string().nullish(),
  from_symbol: z.string().nullish(),
  from_amount: z.number().nullish(),
  to_symbol: z.string().nullish(),
  to_amount: z.number().nullish(),
  volume_usd: z.number().nullish()
})

export const TokenDataTradesSchema = z.object({
  source: z.literal('birdeye'),
  chain: z.string(),
  address: z.string(),
  trades: z.array(TokenDataTradeRowSchema)
})
export type TokenDataTrades = z.infer<typeof TokenDataTradesSchema>

const TokenDataTrendingRowSchema = z.object({
  address: z.string(),
  symbol: z.string().nullish(),
  name: z.string().nullish(),
  rank: z.number().nullish(),
  price_usd: z.number().nullish(),
  change_24h_pct: z.number().nullish(),
  volume_24h_usd: z.number().nullish(),
  liquidity_usd: z.number().nullish(),
  market_cap_usd: z.number().nullish()
})

export const TokenDataTrendingSchema = z.object({
  source: z.literal('birdeye'),
  chain: z.string(),
  tokens: z.array(TokenDataTrendingRowSchema)
})
export type TokenDataTrending = z.infer<typeof TokenDataTrendingSchema>

const TokenDataNewListingRowSchema = z.object({
  address: z.string(),
  symbol: z.string().nullish(),
  name: z.string().nullish(),
  liquidity_usd: z.number().nullish(),
  listed_at: z.string().nullish(),
  dex: z.string().nullish()
})

export const TokenDataNewListingsSchema = z.object({
  source: z.literal('birdeye'),
  chain: z.string(),
  tokens: z.array(TokenDataNewListingRowSchema)
})
export type TokenDataNewListings = z.infer<typeof TokenDataNewListingsSchema>

// Shared candle contract: t is epoch ms.
const TokenDataCandleSchema = z.object({
  t: z.number(),
  o: z.number(),
  h: z.number(),
  l: z.number(),
  c: z.number(),
  v: z.number().nullish()
})

export const TokenDataCandlesSchema = z.object({
  source: z.literal('birdeye'),
  candles: z.array(TokenDataCandleSchema)
})
export type TokenDataCandles = z.infer<typeof TokenDataCandlesSchema>

const TokenDataWalletTokenRowSchema = z.object({
  address: z.string(),
  symbol: z.string().nullish(),
  name: z.string().nullish(),
  ui_amount: z.number().nullish(),
  price_usd: z.number().nullish(),
  value_usd: z.number().nullish()
})

export const TokenDataWalletPortfolioSchema = z.object({
  source: z.literal('birdeye'),
  chain: z.string(),
  wallet: z.string(),
  total_usd: z.number().nullish(),
  tokens: z.array(TokenDataWalletTokenRowSchema)
})
export type TokenDataWalletPortfolio = z.infer<typeof TokenDataWalletPortfolioSchema>

// ---------------------------------------------------------------------------
// `tribes-cli token-data` command options.
// ---------------------------------------------------------------------------

const ChainOptionSchema = z.string().min(1).nullish()

export const TokenDataPriceCommandOptionsSchema = z.object({
  addresses: z.string().min(1),
  chain: ChainOptionSchema,
  out: z.string().nullish()
})
export type TokenDataPriceCommandOptions = z.infer<typeof TokenDataPriceCommandOptionsSchema>

export const TokenDataOverviewCommandOptionsSchema = z.object({
  address: z.string().min(1),
  chain: ChainOptionSchema,
  out: z.string().nullish()
})
export type TokenDataOverviewCommandOptions = z.infer<typeof TokenDataOverviewCommandOptionsSchema>

export const TokenDataSecurityCommandOptionsSchema = z.object({
  address: z.string().min(1),
  chain: ChainOptionSchema,
  out: z.string().nullish()
})
export type TokenDataSecurityCommandOptions = z.infer<typeof TokenDataSecurityCommandOptionsSchema>

export const TokenDataHoldersCommandOptionsSchema = z.object({
  address: z.string().min(1),
  limit: z.number().int().min(1).max(100).nullish(),
  chain: ChainOptionSchema,
  out: z.string().nullish()
})
export type TokenDataHoldersCommandOptions = z.infer<typeof TokenDataHoldersCommandOptionsSchema>

export const TokenDataTradesCommandOptionsSchema = z.object({
  address: z.string().min(1),
  limit: z.number().int().min(1).max(50).nullish(),
  chain: ChainOptionSchema,
  out: z.string().nullish()
})
export type TokenDataTradesCommandOptions = z.infer<typeof TokenDataTradesCommandOptionsSchema>

export const TokenDataTrendingCommandOptionsSchema = z.object({
  limit: z.number().int().min(1).max(20).nullish(),
  chain: ChainOptionSchema,
  out: z.string().nullish()
})
export type TokenDataTrendingCommandOptions = z.infer<typeof TokenDataTrendingCommandOptionsSchema>

export const TokenDataNewListingsCommandOptionsSchema = z.object({
  limit: z.number().int().min(1).max(20).nullish(),
  chain: ChainOptionSchema,
  out: z.string().nullish()
})
export type TokenDataNewListingsCommandOptions = z.infer<
  typeof TokenDataNewListingsCommandOptionsSchema
>

export const TokenDataOhlcvCommandOptionsSchema = z.object({
  address: z.string().min(1),
  timeframe: TokenDataTimeframeSchema,
  from: z.number().int().positive().nullish(),
  to: z.number().int().positive().nullish(),
  chain: ChainOptionSchema,
  out: z.string().nullish()
})
export type TokenDataOhlcvCommandOptions = z.infer<typeof TokenDataOhlcvCommandOptionsSchema>

export const TokenDataWalletPortfolioCommandOptionsSchema = z.object({
  wallet: z.string().min(1),
  chain: ChainOptionSchema,
  out: z.string().nullish()
})
export type TokenDataWalletPortfolioCommandOptions = z.infer<
  typeof TokenDataWalletPortfolioCommandOptionsSchema
>
