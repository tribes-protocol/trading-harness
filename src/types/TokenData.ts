import { z } from 'zod'

import { ChainIdSchema } from '@/types/ChainId'

// Per-token on-chain market data types for `tribes-cli token price|overview|
// ohlcv|security|holders|trending`. Providers: Birdeye (primary), Moralis and
// CoinGecko onchain as fallbacks. Raw provider schemas are defensive (nullish
// wherever a provider might omit a field); normalized schemas carry a `source`
// field naming the provider that actually answered.
// Timestamps are unix SECONDS throughout this file (Birdeye native unit).

// ---------------------------------------------------------------------------
// Birdeye raw schemas.
// Every Birdeye response is wrapped as {success, data}; success:false can
// arrive on HTTP 200 and must be treated as an error. success:true with
// data:null is a normal miss for unknown tokens (triggers provider fallback).

export const BirdeyeEnvelopeSchema = z.object({
  success: z.boolean(),
  message: z.string().nullish(),
  data: z.unknown()
})

export const BirdeyePriceDataSchema = z.object({
  value: z.number(),
  updateUnixTime: z.number().nullish(),
  liquidity: z.number().nullish()
})

export const BirdeyeTokenOverviewDataSchema = z.object({
  name: z.string().nullish(),
  symbol: z.string().nullish(),
  decimals: z.number().nullish(),
  price: z.number().nullish(),
  // token_overview spells it marketCap; tokenlist uses mc and token_trending
  // uses marketcap — keep the per-endpoint spellings in their own schemas.
  marketCap: z.number().nullish(),
  fdv: z.number().nullish(),
  liquidity: z.number().nullish(),
  v24hUSD: z.number().nullish(),
  priceChange24hPercent: z.number().nullish(),
  holder: z.number().nullish()
})

const BirdeyeOhlcvItemSchema = z.object({
  unixTime: z.number(),
  o: z.number(),
  h: z.number(),
  l: z.number(),
  c: z.number(),
  v: z.number().nullish()
})

export const BirdeyeOhlcvDataSchema = z.object({
  items: BirdeyeOhlcvItemSchema.array().nullish()
})

// /defi/token_security returns a completely different shape per chain: Solana
// fields are typed booleans/numbers/nulls, EVM fields are GoPlus-style strings
// ('0'/'1' flags, stringified numbers). One defensive schema lists only the
// fields the normalized core needs; chain-inapplicable fields simply parse to
// undefined and normalize to null.
export const BirdeyeTokenSecurityDataSchema = z.object({
  // Solana-shaped fields
  freezeable: z.boolean().nullish(),
  freezeAuthority: z.string().nullish(),
  transferFeeEnable: z.boolean().nullish(),
  nonTransferable: z.boolean().nullish(),
  mutableMetadata: z.boolean().nullish(),
  top10HolderPercent: z.number().nullish(),
  // Shared owner/creator authority fields (numbers on Solana, strings on EVM)
  ownerAddress: z.string().nullish(),
  ownerPercentage: z.union([z.number(), z.string()]).nullish(),
  creatorAddress: z.string().nullish(),
  creatorPercentage: z.union([z.number(), z.string()]).nullish(),
  // EVM-shaped fields (GoPlus-style strings)
  isHoneypot: z.string().nullish(),
  buyTax: z.string().nullish(),
  sellTax: z.string().nullish(),
  isMintable: z.string().nullish(),
  isProxy: z.string().nullish(),
  isOpenSource: z.string().nullish(),
  canTakeBackOwnership: z.string().nullish(),
  hiddenOwner: z.string().nullish()
})

const BirdeyeHolderItemSchema = z.object({
  owner: z.string(),
  ui_amount: z.number().nullish()
})

export const BirdeyeHolderDataSchema = z.object({
  items: BirdeyeHolderItemSchema.array().nullish()
})

const BirdeyeTrendingTokenSchema = z.object({
  address: z.string(),
  rank: z.number().nullish(),
  name: z.string().nullish(),
  symbol: z.string().nullish(),
  price: z.number().nullish(),
  volume24hUSD: z.number().nullish(),
  liquidity: z.number().nullish()
})

export const BirdeyeTrendingDataSchema = z.object({
  tokens: BirdeyeTrendingTokenSchema.array().nullish()
})

// ---------------------------------------------------------------------------
// Moralis raw schemas (no envelope; camelCase on price endpoints, snake_case
// on the owners list endpoint).

export const MoralisEvmTokenPriceSchema = z.object({
  usdPrice: z.number(),
  pairTotalLiquidityUsd: z.string().nullish()
})

export const MoralisSolanaTokenPriceSchema = z.object({
  usdPrice: z.number()
})

const MoralisTokenOwnerSchema = z.object({
  owner_address: z.string(),
  balance_formatted: z.string().nullish(),
  percentage_relative_to_total_supply: z.number().nullish()
})

export const MoralisTokenOwnersResponseSchema = z.object({
  result: MoralisTokenOwnerSchema.array().nullish()
})

// ---------------------------------------------------------------------------
// CoinGecko onchain (GeckoTerminal) raw schema — JSON:API style; ALL numeric
// attributes are STRINGS and market_cap_usd/price_usd are nullable.

const CoinGeckoOnchainTokenAttributesSchema = z.object({
  name: z.string().nullish(),
  symbol: z.string().nullish(),
  decimals: z.number().nullish(),
  price_usd: z.string().nullish(),
  fdv_usd: z.string().nullish(),
  total_reserve_in_usd: z.string().nullish(),
  volume_usd: z.object({ h24: z.string().nullish() }).nullish(),
  market_cap_usd: z.string().nullish()
})

export const CoinGeckoOnchainTokenResponseSchema = z.object({
  data: z.object({ attributes: CoinGeckoOnchainTokenAttributesSchema })
})

// ---------------------------------------------------------------------------
// Normalized internal shapes.

const TokenPriceSourceSchema = z.enum(['birdeye', 'moralis'])

export const TokenPriceSchema = z.object({
  source: TokenPriceSourceSchema,
  address: z.string().min(1),
  chain_id: ChainIdSchema,
  price_usd: z.number(),
  liquidity_usd: z.number().nullish(),
  // Unix seconds; null when the provider does not report a quote time.
  updated_at: z.number().nullish()
})
export type TokenPrice = z.infer<typeof TokenPriceSchema>

const TokenOverviewSourceSchema = z.enum(['birdeye', 'coingecko-onchain'])

export const TokenOverviewSchema = z.object({
  source: TokenOverviewSourceSchema,
  address: z.string().min(1),
  chain_id: ChainIdSchema,
  name: z.string().nullish(),
  symbol: z.string().nullish(),
  decimals: z.number().nullish(),
  price_usd: z.number().nullish(),
  market_cap_usd: z.number().nullish(),
  fdv_usd: z.number().nullish(),
  liquidity_usd: z.number().nullish(),
  volume_24h_usd: z.number().nullish(),
  price_change_24h_pct: z.number().nullish(),
  // Holder count is Birdeye-only; always null from the CoinGecko fallback.
  holders: z.number().nullish()
})
export type TokenOverview = z.infer<typeof TokenOverviewSchema>

const TokenOhlcvCandleSchema = z.object({
  time_s: z.number(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number().nullish()
})

export const TokenOhlcvSchema = z.object({
  source: z.literal('birdeye'),
  address: z.string().min(1),
  chain_id: ChainIdSchema,
  interval: z.string().min(1),
  candles: TokenOhlcvCandleSchema.array()
})
export type TokenOhlcv = z.infer<typeof TokenOhlcvSchema>

// Best-effort common security core. EVERY field is nullish: fields that do not
// apply to the token's chain (or that Birdeye omitted) stay null.
const TokenSecurityChecksSchema = z.object({
  // Solana-oriented checks
  freezeable: z.boolean().nullish(),
  freeze_authority: z.string().nullish(),
  transfer_fee_enable: z.boolean().nullish(),
  non_transferable: z.boolean().nullish(),
  mutable_metadata: z.boolean().nullish(),
  // Present on Solana; EVM responses do not report a top-10 concentration.
  top10_holder_percent: z.number().nullish(),
  // Owner/creator authority fields (both chains, when available)
  owner_address: z.string().nullish(),
  owner_percentage: z.number().nullish(),
  creator_address: z.string().nullish(),
  creator_percentage: z.number().nullish(),
  // EVM-oriented checks
  is_honeypot: z.boolean().nullish(),
  buy_tax: z.number().nullish(),
  sell_tax: z.number().nullish(),
  is_mintable: z.boolean().nullish(),
  is_proxy: z.boolean().nullish(),
  is_open_source: z.boolean().nullish(),
  can_take_back_ownership: z.boolean().nullish(),
  hidden_owner: z.boolean().nullish()
})

export const TokenSecuritySchema = z.object({
  source: z.literal('birdeye'),
  address: z.string().min(1),
  chain_id: ChainIdSchema,
  checks: TokenSecurityChecksSchema
})
export type TokenSecurity = z.infer<typeof TokenSecuritySchema>

const TokenHoldersSourceSchema = z.enum(['birdeye', 'moralis'])

const TokenHolderSchema = z.object({
  rank: z.number().int().min(1),
  owner_address: z.string().min(1),
  // Decimal-adjusted token amount as a NUMBER (not raw base units). May lose
  // precision beyond 2^53 base units, which is acceptable for holder ranking.
  amount: z.number().nullish(),
  pct_of_supply: z.number().nullish()
})

export const TokenHoldersSchema = z.object({
  source: TokenHoldersSourceSchema,
  address: z.string().min(1),
  chain_id: ChainIdSchema,
  holders: TokenHolderSchema.array()
})
export type TokenHolders = z.infer<typeof TokenHoldersSchema>

const TrendingTokenSchema = z.object({
  rank: z.number().nullish(),
  address: z.string().min(1),
  name: z.string().nullish(),
  symbol: z.string().nullish(),
  price_usd: z.number().nullish(),
  volume_24h_usd: z.number().nullish(),
  liquidity_usd: z.number().nullish()
})

export const TokenTrendingSchema = z.object({
  source: z.literal('birdeye'),
  chain_id: ChainIdSchema,
  tokens: TrendingTokenSchema.array()
})
export type TokenTrending = z.infer<typeof TokenTrendingSchema>

// ---------------------------------------------------------------------------
// CLI command options.

// Birdeye's documented candle type enum. Case-sensitive: minutes are
// lowercase, hours/days/weeks/months are uppercase.
export const BIRDEYE_OHLCV_INTERVALS = [
  '1m',
  '3m',
  '5m',
  '15m',
  '30m',
  '1H',
  '2H',
  '4H',
  '6H',
  '8H',
  '12H',
  '1D',
  '3D',
  '1W',
  '1M'
] as const

export const BirdeyeOhlcvIntervalSchema = z.enum(BIRDEYE_OHLCV_INTERVALS)
export type BirdeyeOhlcvInterval = z.infer<typeof BirdeyeOhlcvIntervalSchema>

export const TokenMarketCommandOptionsSchema = z.object({
  address: z.string().trim().min(1, 'token address is required'),
  chain: ChainIdSchema,
  out: z.string().nullish()
})

export const TokenOhlcvCommandOptionsSchema = z.object({
  address: z.string().trim().min(1, 'token address is required'),
  chain: ChainIdSchema,
  interval: BirdeyeOhlcvIntervalSchema.default('1H'),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  timeFrom: z.coerce.number().int().positive().nullish(),
  timeTo: z.coerce.number().int().positive().nullish(),
  out: z.string().nullish()
})

export const TokenHoldersCommandOptionsSchema = z.object({
  address: z.string().trim().min(1, 'token address is required'),
  chain: ChainIdSchema,
  limit: z.coerce.number().int().min(1).max(100).default(20),
  out: z.string().nullish()
})

export const TokenTrendingCommandOptionsSchema = z.object({
  chain: ChainIdSchema.default('solana'),
  // Birdeye caps /defi/token_trending at 50 rows per request.
  limit: z.coerce.number().int().min(1).max(50).default(20),
  out: z.string().nullish()
})
