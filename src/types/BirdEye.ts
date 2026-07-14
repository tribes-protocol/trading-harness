import { z } from 'zod'

// BirdEye scopes most discovery endpoints by chain. Trending and new-listings
// take it as an `x-chain` header; v3 search takes it as a query param and
// silently returns zero rows without one.
export const BirdEyeChainSchema = z.enum([
  'solana',
  'ethereum',
  'base',
  'bsc',
  'arbitrum',
  'optimism',
  'polygon',
  'avalanche',
  'sui',
  'zksync'
])
export type BirdEyeChain = z.infer<typeof BirdEyeChainSchema>

export const BirdEyeSmartMoneyIntervalSchema = z.enum(['1d', '7d', '30d'])
export type BirdEyeSmartMoneyInterval = z.infer<typeof BirdEyeSmartMoneyIntervalSchema>

export const BirdEyeTraderStyleSchema = z.enum([
  'all',
  'risk_averse',
  'risk_balancers',
  'trenchers'
])
export type BirdEyeTraderStyle = z.infer<typeof BirdEyeTraderStyleSchema>

export const BirdEyeSmartMoneySortSchema = z.enum(['net_flow', 'smart_traders_no', 'market_cap'])
export type BirdEyeSmartMoneySort = z.infer<typeof BirdEyeSmartMoneySortSchema>

export const BirdEyeSortTypeSchema = z.enum(['desc', 'asc'])
export type BirdEyeSortType = z.infer<typeof BirdEyeSortTypeSchema>

export const BirdEyeSearchTargetSchema = z.enum(['token', 'market'])
export type BirdEyeSearchTarget = z.infer<typeof BirdEyeSearchTargetSchema>

// ─── Wire schemas ───

const BirdEyeTrendingTokenSchema = z.object({
  address: z.string(),
  symbol: z.string().nullish(),
  name: z.string().nullish(),
  rank: z.number().nullish(),
  price: z.number().nullish(),
  price24hChangePercent: z.number().nullish(),
  volume24hUSD: z.number().nullish(),
  liquidity: z.number().nullish(),
  marketcap: z.number().nullish(),
  fdv: z.number().nullish()
})

export const BirdEyeTrendingResponseSchema = z.object({
  data: z
    .object({
      tokens: z.array(BirdEyeTrendingTokenSchema).nullish()
    })
    .nullish()
})

const BirdEyeNewListingSchema = z.object({
  address: z.string(),
  symbol: z.string().nullish(),
  name: z.string().nullish(),
  source: z.string().nullish(),
  liquidity: z.number().nullish(),
  liquidityAddedAt: z.string().nullish()
})

export const BirdEyeNewListingResponseSchema = z.object({
  data: z
    .object({
      items: z.array(BirdEyeNewListingSchema).nullish()
    })
    .nullish()
})

const BirdEyeSmartMoneyTokenSchema = z.object({
  token: z.string(),
  symbol: z.string().nullish(),
  name: z.string().nullish(),
  price: z.number().nullish(),
  price_change_percent: z.number().nullish(),
  liquidity: z.number().nullish(),
  market_cap: z.number().nullish(),
  net_flow: z.number().nullish(),
  smart_traders_no: z.number().nullish(),
  trader_style: z.string().nullish(),
  volume_usd: z.number().nullish(),
  volume_buy_usd: z.number().nullish(),
  volume_sell_usd: z.number().nullish()
})

export const BirdEyeSmartMoneyResponseSchema = z.object({
  data: z.array(BirdEyeSmartMoneyTokenSchema).nullish()
})

const BirdEyeSearchItemSchema = z.object({
  name: z.string().nullish(),
  symbol: z.string().nullish(),
  address: z.string().nullish(),
  network: z.string().nullish(),
  price: z.number().nullish(),
  price_change_24h_percent: z.number().nullish(),
  volume_24h_usd: z.number().nullish(),
  liquidity: z.number().nullish(),
  market_cap: z.number().nullish(),
  fdv: z.number().nullish(),
  verified: z.boolean().nullish()
})

export const BirdEyeSearchResponseSchema = z.object({
  data: z
    .object({
      items: z
        .array(
          z.object({
            type: z.string().nullish(),
            result: z.array(BirdEyeSearchItemSchema).nullish()
          })
        )
        .nullish()
    })
    .nullish()
})

// ─── Command outputs ───

export const TrendingTokenSchema = z.object({
  rank: z.number().nullish(),
  address: z.string(),
  symbol: z.string().nullish(),
  name: z.string().nullish(),
  price: z.number().nullish(),
  change_24h_pct: z.number().nullish(),
  volume_24h_usd: z.number().nullish(),
  liquidity_usd: z.number().nullish(),
  market_cap_usd: z.number().nullish()
})
export type TrendingToken = z.infer<typeof TrendingTokenSchema>

export const NewListingSchema = z.object({
  address: z.string(),
  symbol: z.string().nullish(),
  name: z.string().nullish(),
  source: z.string().nullish(),
  liquidity_usd: z.number().nullish(),
  liquidity_added_at: z.string().nullish()
})
export type NewListing = z.infer<typeof NewListingSchema>

export const SmartMoneyTokenSchema = z.object({
  address: z.string(),
  symbol: z.string().nullish(),
  name: z.string().nullish(),
  price: z.number().nullish(),
  change_pct: z.number().nullish(),
  smart_traders: z.number().nullish(),
  net_flow_usd: z.number().nullish(),
  volume_usd: z.number().nullish(),
  liquidity_usd: z.number().nullish(),
  market_cap_usd: z.number().nullish(),
  trader_style: z.string().nullish()
})
export type SmartMoneyToken = z.infer<typeof SmartMoneyTokenSchema>

export const TokenSearchHitSchema = z.object({
  address: z.string().nullish(),
  symbol: z.string().nullish(),
  name: z.string().nullish(),
  network: z.string().nullish(),
  price: z.number().nullish(),
  change_24h_pct: z.number().nullish(),
  volume_24h_usd: z.number().nullish(),
  liquidity_usd: z.number().nullish(),
  market_cap_usd: z.number().nullish(),
  verified: z.boolean().nullish()
})
export type TokenSearchHit = z.infer<typeof TokenSearchHitSchema>
