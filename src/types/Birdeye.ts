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

// GET /defi/v3/search — items group results by type ('token' | 'market');
// token entries carry the market fields the harness surfaces.
export const BirdeyeSearchResponseSchema = z.object({
  data: z.object({
    items: z
      .array(
        z.object({
          type: z.string().nullish(),
          result: z
            .array(
              z.object({
                address: z.string().nullish(),
                symbol: z.string().nullish(),
                name: z.string().nullish(),
                network: z.string().nullish(),
                price: z.number().nullish(),
                liquidity: z.number().nullish(),
                volume_24h_usd: z.number().nullish()
              })
            )
            .nullish()
        })
      )
      .nullish()
  })
})
export type BirdeyeSearchResponse = z.infer<typeof BirdeyeSearchResponseSchema>

// GET /defi/v3/token/mint-burn-txs
export const BirdeyeMintBurnTxsResponseSchema = z.object({
  data: z.object({
    items: z
      .array(
        z.object({
          tx_hash: z.string().nullish(),
          block_time: z.number().nullish(),
          common_type: z.string().nullish(),
          ui_amount: z.number().nullish(),
          slot: z.number().nullish()
        })
      )
      .nullish()
  })
})
export type BirdeyeMintBurnTxsResponse = z.infer<typeof BirdeyeMintBurnTxsResponseSchema>

// GET /defi/token_creation_info — data is null when BirdEye has no creation
// record for the token.
export const BirdeyeCreationInfoResponseSchema = z.object({
  data: z
    .object({
      symbol: z.string().nullish(),
      name: z.string().nullish(),
      decimals: z.number().nullish(),
      creator: z.string().nullish(),
      txHash: z.string().nullish(),
      slot: z.number().nullish(),
      blockUnixTime: z.number().nullish()
    })
    .nullish()
})
export type BirdeyeCreationInfoResponse = z.infer<typeof BirdeyeCreationInfoResponseSchema>

// GET /defi/v3/token/exit-liquidity/multiple — record keyed by token address.
// The exit-liquidity field name is undocumented, so every casing the legacy
// client probed is modeled and coalesced at mapping time.
export const BirdeyeExitLiquidityResponseSchema = z.object({
  data: z.record(
    z.string(),
    z
      .object({
        exit_liquidity_usd: z.number().nullish(),
        exitLiquidityUsd: z.number().nullish(),
        liquidityUsd: z.number().nullish()
      })
      .nullish()
  )
})
export type BirdeyeExitLiquidityResponse = z.infer<typeof BirdeyeExitLiquidityResponseSchema>

// GET /defi/v3/all-time/trades/single — data is an array with one entry for
// the requested token.
export const BirdeyeAllTimeTradesResponseSchema = z.object({
  data: z
    .array(
      z.object({
        address: z.string().nullish(),
        buy: z.number().nullish(),
        sell: z.number().nullish(),
        total_trade: z.number().nullish(),
        volume_buy_usd: z.number().nullish(),
        volume_sell_usd: z.number().nullish(),
        total_volume_usd: z.number().nullish()
      })
    )
    .nullish()
})
export type BirdeyeAllTimeTradesResponse = z.infer<typeof BirdeyeAllTimeTradesResponseSchema>

// GET /defi/v3/token/trade-data/multiple — record keyed by token address;
// unknown addresses are absent or null.
export const BirdeyeTradeDataMultipleResponseSchema = z.object({
  data: z.record(
    z.string(),
    z
      .object({
        price: z.number().nullish(),
        price_change_1h_percent: z.number().nullish(),
        price_change_24h_percent: z.number().nullish(),
        trade_24h: z.number().nullish(),
        buy_24h: z.number().nullish(),
        sell_24h: z.number().nullish(),
        volume_24h_usd: z.number().nullish(),
        volume_24h_change_percent: z.number().nullish(),
        unique_wallet_24h: z.number().nullish(),
        holder: z.number().nullish(),
        last_trade_unix_time: z.number().nullish()
      })
      .nullish()
  )
})
export type BirdeyeTradeDataMultipleResponse = z.infer<
  typeof BirdeyeTradeDataMultipleResponseSchema
>

// ---------------------------------------------------------------------------
// Wallet/transfer analytics payloads (wallet/v2 + token/v1). These endpoints
// are Solana-only and their response shapes are not documented in detail, so
// every field casing the legacy client probed is modeled (number or numeric
// string) and coalesced at mapping time.
// ---------------------------------------------------------------------------

const BirdeyeLooseNumberSchema = z.union([z.number(), z.string()]).nullish()

const BirdeyeNetWorthHoldingSchema = z.object({
  address: z.string().nullish(),
  tokenAddress: z.string().nullish(),
  token_address: z.string().nullish(),
  mint: z.string().nullish(),
  symbol: z.string().nullish(),
  tokenSymbol: z.string().nullish(),
  token_symbol: z.string().nullish(),
  uiAmount: BirdeyeLooseNumberSchema,
  ui_amount: BirdeyeLooseNumberSchema,
  amount: BirdeyeLooseNumberSchema,
  balance: BirdeyeLooseNumberSchema,
  priceUsd: BirdeyeLooseNumberSchema,
  price_usd: BirdeyeLooseNumberSchema,
  price: BirdeyeLooseNumberSchema,
  valueUsd: BirdeyeLooseNumberSchema,
  usdValue: BirdeyeLooseNumberSchema,
  value: BirdeyeLooseNumberSchema,
  amountUsd: BirdeyeLooseNumberSchema,
  costBasisUsd: BirdeyeLooseNumberSchema,
  cost_basis_usd: BirdeyeLooseNumberSchema,
  costBasis: BirdeyeLooseNumberSchema,
  allocation: BirdeyeLooseNumberSchema,
  share: BirdeyeLooseNumberSchema,
  weight: BirdeyeLooseNumberSchema,
  valuePercent: BirdeyeLooseNumberSchema
})

// GET /wallet/v2/current-net-worth and GET /wallet/v2/net-worth-details
export const BirdeyeWalletNetWorthDataSchema = z.object({
  totalNetWorth: BirdeyeLooseNumberSchema,
  totalNetWorthUsd: BirdeyeLooseNumberSchema,
  netWorth: BirdeyeLooseNumberSchema,
  net_worth: BirdeyeLooseNumberSchema,
  totalValue: BirdeyeLooseNumberSchema,
  value: BirdeyeLooseNumberSchema,
  items: z.array(BirdeyeNetWorthHoldingSchema).nullish(),
  tokens: z.array(BirdeyeNetWorthHoldingSchema).nullish(),
  assets: z.array(BirdeyeNetWorthHoldingSchema).nullish(),
  holdings: z.array(BirdeyeNetWorthHoldingSchema).nullish()
})
export type BirdeyeWalletNetWorthData = z.infer<typeof BirdeyeWalletNetWorthDataSchema>

export const BirdeyeWalletNetWorthResponseSchema = z.object({
  data: BirdeyeWalletNetWorthDataSchema.nullish()
})
export type BirdeyeWalletNetWorthResponse = z.infer<typeof BirdeyeWalletNetWorthResponseSchema>

const BirdeyeNetWorthPointSchema = z.object({
  unixTime: BirdeyeLooseNumberSchema,
  timestamp: BirdeyeLooseNumberSchema,
  time: BirdeyeLooseNumberSchema,
  blockTime: BirdeyeLooseNumberSchema,
  valueUsd: BirdeyeLooseNumberSchema,
  netWorthUsd: BirdeyeLooseNumberSchema,
  value: BirdeyeLooseNumberSchema,
  usdValue: BirdeyeLooseNumberSchema
})

// GET /wallet/v2/net-worth — historical points; data may be a bare array or a
// keyed container.
export const BirdeyeWalletNetWorthChartResponseSchema = z.object({
  data: z
    .union([
      z.array(BirdeyeNetWorthPointSchema),
      z.object({
        items: z.array(BirdeyeNetWorthPointSchema).nullish(),
        points: z.array(BirdeyeNetWorthPointSchema).nullish(),
        history: z.array(BirdeyeNetWorthPointSchema).nullish()
      })
    ])
    .nullish()
})
export type BirdeyeWalletNetWorthChartResponse = z.infer<
  typeof BirdeyeWalletNetWorthChartResponseSchema
>

const BirdeyeBalanceChangeItemSchema = z.object({
  address: z.string().nullish(),
  tokenAddress: z.string().nullish(),
  token_address: z.string().nullish(),
  mint: z.string().nullish(),
  symbol: z.string().nullish(),
  tokenSymbol: z.string().nullish(),
  token_symbol: z.string().nullish(),
  blockTime: BirdeyeLooseNumberSchema,
  block_time: BirdeyeLooseNumberSchema,
  timestamp: BirdeyeLooseNumberSchema,
  time: BirdeyeLooseNumberSchema,
  unixTime: BirdeyeLooseNumberSchema,
  changeType: z.string().nullish(),
  change_type: z.string().nullish(),
  direction: z.string().nullish(),
  type: z.string().nullish(),
  uiAmount: BirdeyeLooseNumberSchema,
  ui_amount: BirdeyeLooseNumberSchema,
  amount: BirdeyeLooseNumberSchema,
  balance: BirdeyeLooseNumberSchema,
  changeAmount: BirdeyeLooseNumberSchema,
  valueUsd: BirdeyeLooseNumberSchema,
  usdValue: BirdeyeLooseNumberSchema,
  value: BirdeyeLooseNumberSchema,
  amountUsd: BirdeyeLooseNumberSchema
})

// GET /wallet/v2/balance-change — data may be a bare array or a keyed
// container.
export const BirdeyeBalanceChangeResponseSchema = z.object({
  data: z
    .union([
      z.array(BirdeyeBalanceChangeItemSchema),
      z.object({
        items: z.array(BirdeyeBalanceChangeItemSchema).nullish(),
        changes: z.array(BirdeyeBalanceChangeItemSchema).nullish(),
        history: z.array(BirdeyeBalanceChangeItemSchema).nullish()
      })
    ])
    .nullish()
})
export type BirdeyeBalanceChangeResponse = z.infer<typeof BirdeyeBalanceChangeResponseSchema>

// POST /wallet/v2/transfer/total
export const BirdeyeWalletTransferTotalResponseSchema = z.object({
  data: z
    .object({
      totalAmount: BirdeyeLooseNumberSchema,
      amount: BirdeyeLooseNumberSchema,
      quantity: BirdeyeLooseNumberSchema,
      uiAmount: BirdeyeLooseNumberSchema,
      totalValueUsd: BirdeyeLooseNumberSchema,
      totalUsd: BirdeyeLooseNumberSchema,
      valueUsd: BirdeyeLooseNumberSchema,
      usdValue: BirdeyeLooseNumberSchema,
      value: BirdeyeLooseNumberSchema,
      transferCount: BirdeyeLooseNumberSchema,
      count: BirdeyeLooseNumberSchema,
      totalTransfers: BirdeyeLooseNumberSchema,
      uniqueCounterparties: BirdeyeLooseNumberSchema,
      counterpartyCount: BirdeyeLooseNumberSchema,
      counterparty_count: BirdeyeLooseNumberSchema,
      symbol: z.string().nullish(),
      tokenSymbol: z.string().nullish(),
      token_symbol: z.string().nullish()
    })
    .nullish()
})
export type BirdeyeWalletTransferTotalResponse = z.infer<
  typeof BirdeyeWalletTransferTotalResponseSchema
>

// POST /token/v1/transfer/total — flat metric map with undocumented keys.
export const BirdeyeTokenTransferTotalResponseSchema = z.object({
  data: z.record(z.string(), z.unknown()).nullish()
})
export type BirdeyeTokenTransferTotalResponse = z.infer<
  typeof BirdeyeTokenTransferTotalResponseSchema
>

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

const TokenDataSearchRowSchema = z.object({
  address: z.string(),
  symbol: z.string().nullish(),
  name: z.string().nullish(),
  price_usd: z.number().nullish(),
  liquidity_usd: z.number().nullish(),
  volume_24h_usd: z.number().nullish(),
  network: z.string().nullish()
})

export const TokenDataSearchResultsSchema = z.object({
  source: z.literal('birdeye'),
  chain: z.string(),
  keyword: z.string(),
  results: z.array(TokenDataSearchRowSchema)
})
export type TokenDataSearchResults = z.infer<typeof TokenDataSearchResultsSchema>

const TokenDataMintBurnRowSchema = z.object({
  tx_hash: z.string().nullish(),
  block_unix_time: z.number().nullish(),
  type: z.string().nullish(),
  amount: z.number().nullish(),
  slot: z.number().nullish()
})

export const TokenDataMintBurnsSchema = z.object({
  source: z.literal('birdeye'),
  chain: z.string(),
  address: z.string(),
  transactions: z.array(TokenDataMintBurnRowSchema)
})
export type TokenDataMintBurns = z.infer<typeof TokenDataMintBurnsSchema>

export const TokenDataCreationInfoSchema = z.object({
  source: z.literal('birdeye'),
  chain: z.string(),
  address: z.string(),
  symbol: z.string().nullish(),
  name: z.string().nullish(),
  decimals: z.number().nullish(),
  creator: z.string().nullish(),
  tx_hash: z.string().nullish(),
  slot: z.number().nullish(),
  created_at: z.number().nullish()
})
export type TokenDataCreationInfo = z.infer<typeof TokenDataCreationInfoSchema>

const TokenDataExitLiquidityRowSchema = z.object({
  address: z.string(),
  exit_liquidity_usd: z.number().nullish()
})

export const TokenDataExitLiquiditySchema = z.object({
  source: z.literal('birdeye'),
  chain: z.string(),
  tokens: z.array(TokenDataExitLiquidityRowSchema)
})
export type TokenDataExitLiquidity = z.infer<typeof TokenDataExitLiquiditySchema>

export const TokenDataTradeHistoryTimeFrameSchema = z.enum([
  '1m',
  '5m',
  '30m',
  '1h',
  '2h',
  '4h',
  '8h',
  '24h',
  '3d',
  '7d',
  '14d',
  '30d',
  '90d',
  '180d',
  '1y',
  'alltime'
])
export type TokenDataTradeHistoryTimeFrame = z.infer<typeof TokenDataTradeHistoryTimeFrameSchema>

const TokenDataTradeHistoryRowSchema = z.object({
  address: z.string().nullish(),
  buys: z.number().nullish(),
  sells: z.number().nullish(),
  total_trades: z.number().nullish(),
  volume_buy_usd: z.number().nullish(),
  volume_sell_usd: z.number().nullish(),
  total_volume_usd: z.number().nullish()
})

export const TokenDataTradeHistorySchema = z.object({
  source: z.literal('birdeye'),
  chain: z.string(),
  address: z.string(),
  time_frame: TokenDataTradeHistoryTimeFrameSchema,
  stats: z.array(TokenDataTradeHistoryRowSchema)
})
export type TokenDataTradeHistory = z.infer<typeof TokenDataTradeHistorySchema>

const TokenDataTradeStatsRowSchema = z.object({
  address: z.string(),
  price_usd: z.number().nullish(),
  change_1h_pct: z.number().nullish(),
  change_24h_pct: z.number().nullish(),
  trades_24h: z.number().nullish(),
  buys_24h: z.number().nullish(),
  sells_24h: z.number().nullish(),
  volume_24h_usd: z.number().nullish(),
  volume_24h_change_pct: z.number().nullish(),
  unique_wallets_24h: z.number().nullish(),
  holders: z.number().nullish(),
  last_trade_at: z.number().nullish()
})

export const TokenDataTradeStatsSchema = z.object({
  source: z.literal('birdeye'),
  chain: z.string(),
  tokens: z.array(TokenDataTradeStatsRowSchema)
})
export type TokenDataTradeStats = z.infer<typeof TokenDataTradeStatsSchema>

// ---------------------------------------------------------------------------
// Agent-facing output shapes for the BirdEye wallet/transfer analytics
// subcommands (Solana-only).
// ---------------------------------------------------------------------------

export const WalletAnalyticsIntervalSchema = z.enum(['1h', '1d'])
export type WalletAnalyticsInterval = z.infer<typeof WalletAnalyticsIntervalSchema>

const WalletAnalyticsHoldingRowSchema = z.object({
  address: z.string().nullish(),
  symbol: z.string().nullish(),
  ui_amount: z.number().nullish(),
  price_usd: z.number().nullish(),
  value_usd: z.number().nullish(),
  cost_basis_usd: z.number().nullish(),
  allocation_pct: z.number().nullish()
})

export const WalletAnalyticsNetWorthSchema = z.object({
  source: z.literal('birdeye'),
  chain: z.string(),
  wallet: z.string(),
  total_usd: z.number().nullish(),
  tokens: z.array(WalletAnalyticsHoldingRowSchema)
})
export type WalletAnalyticsNetWorth = z.infer<typeof WalletAnalyticsNetWorthSchema>

export const WalletAnalyticsNetWorthDetailsSchema = z.object({
  source: z.literal('birdeye'),
  chain: z.string(),
  wallet: z.string(),
  interval: WalletAnalyticsIntervalSchema,
  time: z.string().nullish(),
  total_usd: z.number().nullish(),
  tokens: z.array(WalletAnalyticsHoldingRowSchema)
})
export type WalletAnalyticsNetWorthDetails = z.infer<typeof WalletAnalyticsNetWorthDetailsSchema>

const WalletAnalyticsNetWorthPointSchema = z.object({
  unix_time: z.number().nullish(),
  value_usd: z.number().nullish()
})

export const WalletAnalyticsNetWorthChartSchema = z.object({
  source: z.literal('birdeye'),
  chain: z.string(),
  wallet: z.string(),
  interval: WalletAnalyticsIntervalSchema,
  points: z.array(WalletAnalyticsNetWorthPointSchema)
})
export type WalletAnalyticsNetWorthChart = z.infer<typeof WalletAnalyticsNetWorthChartSchema>

const WalletAnalyticsBalanceChangeRowSchema = z.object({
  block_unix_time: z.number().nullish(),
  address: z.string().nullish(),
  symbol: z.string().nullish(),
  amount: z.number().nullish(),
  value_usd: z.number().nullish(),
  change_type: z.string().nullish()
})

export const WalletAnalyticsBalanceChangesSchema = z.object({
  source: z.literal('birdeye'),
  chain: z.string(),
  wallet: z.string(),
  changes: z.array(WalletAnalyticsBalanceChangeRowSchema)
})
export type WalletAnalyticsBalanceChanges = z.infer<typeof WalletAnalyticsBalanceChangesSchema>

export const WalletAnalyticsTransferTotalSchema = z.object({
  source: z.literal('birdeye'),
  chain: z.string(),
  wallet: z.string(),
  total_amount: z.number().nullish(),
  total_value_usd: z.number().nullish(),
  transfer_count: z.number().nullish(),
  unique_counterparties: z.number().nullish(),
  symbol: z.string().nullish()
})
export type WalletAnalyticsTransferTotal = z.infer<typeof WalletAnalyticsTransferTotalSchema>

const TokenDataTransferMetricRowSchema = z.object({
  metric: z.string(),
  value: z.union([z.number(), z.string()])
})

export const TokenDataTransferTotalSchema = z.object({
  source: z.literal('birdeye'),
  chain: z.string(),
  address: z.string(),
  metrics: z.array(TokenDataTransferMetricRowSchema)
})
export type TokenDataTransferTotal = z.infer<typeof TokenDataTransferTotalSchema>

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

export const TokenDataMintBurnCommandOptionsSchema = z.object({
  address: z.string().min(1),
  limit: z.number().int().min(1).max(100).nullish(),
  chain: ChainOptionSchema,
  out: z.string().nullish()
})
export type TokenDataMintBurnCommandOptions = z.infer<typeof TokenDataMintBurnCommandOptionsSchema>

export const TokenDataCreationInfoCommandOptionsSchema = z.object({
  address: z.string().min(1),
  chain: ChainOptionSchema,
  out: z.string().nullish()
})
export type TokenDataCreationInfoCommandOptions = z.infer<
  typeof TokenDataCreationInfoCommandOptionsSchema
>

export const TokenDataExitLiquidityCommandOptionsSchema = z.object({
  addresses: z.string().min(1),
  chain: ChainOptionSchema,
  out: z.string().nullish()
})
export type TokenDataExitLiquidityCommandOptions = z.infer<
  typeof TokenDataExitLiquidityCommandOptionsSchema
>

export const TokenDataTradeHistoryCommandOptionsSchema = z.object({
  address: z.string().min(1),
  timeFrame: TokenDataTradeHistoryTimeFrameSchema.nullish(),
  chain: ChainOptionSchema,
  out: z.string().nullish()
})
export type TokenDataTradeHistoryCommandOptions = z.infer<
  typeof TokenDataTradeHistoryCommandOptionsSchema
>

export const TokenDataTradeDataCommandOptionsSchema = z.object({
  addresses: z.string().min(1),
  chain: ChainOptionSchema,
  out: z.string().nullish()
})
export type TokenDataTradeDataCommandOptions = z.infer<
  typeof TokenDataTradeDataCommandOptionsSchema
>

export const TokenDataTransferTotalCommandOptionsSchema = z.object({
  address: z.string().min(1),
  out: z.string().nullish()
})
export type TokenDataTransferTotalCommandOptions = z.infer<
  typeof TokenDataTransferTotalCommandOptionsSchema
>

// ---------------------------------------------------------------------------
// `tribes-cli wallet-data` BirdEye-backed command options (Solana-only).
// ---------------------------------------------------------------------------

export const WalletAnalyticsNetWorthCommandOptionsSchema = z.object({
  wallet: z.string().min(1),
  limit: z.number().int().min(1).max(100).nullish(),
  out: z.string().nullish()
})
export type WalletAnalyticsNetWorthCommandOptions = z.infer<
  typeof WalletAnalyticsNetWorthCommandOptionsSchema
>

export const WalletAnalyticsNetWorthDetailsCommandOptionsSchema = z.object({
  wallet: z.string().min(1),
  type: WalletAnalyticsIntervalSchema.nullish(),
  time: z.string().min(1).nullish(),
  limit: z.number().int().min(1).max(100).nullish(),
  out: z.string().nullish()
})
export type WalletAnalyticsNetWorthDetailsCommandOptions = z.infer<
  typeof WalletAnalyticsNetWorthDetailsCommandOptionsSchema
>

export const WalletAnalyticsNetWorthChartCommandOptionsSchema = z.object({
  wallet: z.string().min(1),
  type: WalletAnalyticsIntervalSchema.nullish(),
  count: z.number().int().min(1).max(30).nullish(),
  out: z.string().nullish()
})
export type WalletAnalyticsNetWorthChartCommandOptions = z.infer<
  typeof WalletAnalyticsNetWorthChartCommandOptionsSchema
>

export const WalletAnalyticsBalanceChangeCommandOptionsSchema = z.object({
  wallet: z.string().min(1),
  from: z.number().int().positive().nullish(),
  to: z.number().int().positive().nullish(),
  limit: z.number().int().min(1).max(100).nullish(),
  out: z.string().nullish()
})
export type WalletAnalyticsBalanceChangeCommandOptions = z.infer<
  typeof WalletAnalyticsBalanceChangeCommandOptionsSchema
>

export const WalletAnalyticsTransferTotalCommandOptionsSchema = z.object({
  wallet: z.string().min(1),
  out: z.string().nullish()
})
export type WalletAnalyticsTransferTotalCommandOptions = z.infer<
  typeof WalletAnalyticsTransferTotalCommandOptionsSchema
>
