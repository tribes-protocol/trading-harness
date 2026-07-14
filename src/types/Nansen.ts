import { z } from 'zod'

export const NansenChainSchema = z.enum([
  'all',
  'arbitrum',
  'avalanche',
  'base',
  'bnb',
  'ethereum',
  'hyperevm',
  'linea',
  'mantle',
  'monad',
  'optimism',
  'polygon',
  'solana'
])
export type NansenChain = z.infer<typeof NansenChainSchema>

// Historical holdings covers fewer chains than the other smart-money endpoints.
export const NansenHistoricalChainSchema = z.enum(['base', 'bnb', 'ethereum', 'monad', 'solana'])
export type NansenHistoricalChain = z.infer<typeof NansenHistoricalChainSchema>

// ─── Wire schemas ───
// Every field is nullish: Nansen omits columns per plan and per chain.

const NansenPaginationSchema = z.object({
  page: z.number().int().nullish(),
  per_page: z.number().int().nullish(),
  is_last_page: z.boolean().nullish()
})

const SmartMoneyNetflowRowSchema = z.object({
  chain: z.string().nullish(),
  token_address: z.string().nullish(),
  token_symbol: z.string().nullish(),
  token_sectors: z.array(z.string()).nullish(),
  net_flow_1h_usd: z.coerce.number().nullish(),
  net_flow_24h_usd: z.coerce.number().nullish(),
  net_flow_7d_usd: z.coerce.number().nullish(),
  net_flow_30d_usd: z.coerce.number().nullish(),
  trader_count: z.number().nullish(),
  token_age_days: z.number().nullish(),
  market_cap_usd: z.coerce.number().nullish()
})

export const SmartMoneyNetflowResponseSchema = z.object({
  data: z.array(SmartMoneyNetflowRowSchema).nullish(),
  pagination: NansenPaginationSchema.nullish()
})

const SmartMoneyHoldingRowSchema = z.object({
  chain: z.string().nullish(),
  token_address: z.string().nullish(),
  token_symbol: z.string().nullish(),
  token_sectors: z.array(z.string()).nullish(),
  value_usd: z.coerce.number().nullish(),
  balance_24h_percent_change: z.number().nullish(),
  holders_count: z.number().nullish(),
  share_of_holdings_percent: z.number().nullish(),
  token_age_days: z.number().nullish(),
  market_cap_usd: z.coerce.number().nullish()
})

export const SmartMoneyHoldingsResponseSchema = z.object({
  data: z.array(SmartMoneyHoldingRowSchema).nullish(),
  pagination: NansenPaginationSchema.nullish()
})

const SmartMoneyHistoricalHoldingRowSchema = SmartMoneyHoldingRowSchema.extend({
  date: z.string().nullish(),
  balance: z.coerce.number().nullish(),
  smart_money_labels: z.array(z.string()).nullish()
})

export const SmartMoneyHistoricalHoldingsResponseSchema = z.object({
  data: z.array(SmartMoneyHistoricalHoldingRowSchema).nullish(),
  pagination: NansenPaginationSchema.nullish()
})

const SmartMoneyDexTradeRowSchema = z.object({
  chain: z.string().nullish(),
  block_timestamp: z.string().nullish(),
  transaction_hash: z.string().nullish(),
  trader_address: z.string().nullish(),
  trader_address_label: z.string().nullish(),
  token_bought_symbol: z.string().nullish(),
  token_bought_address: z.string().nullish(),
  token_bought_amount: z.coerce.number().nullish(),
  token_sold_symbol: z.string().nullish(),
  token_sold_address: z.string().nullish(),
  token_sold_amount: z.coerce.number().nullish(),
  trade_value_usd: z.coerce.number().nullish()
})

export const SmartMoneyDexTradesResponseSchema = z.object({
  data: z.array(SmartMoneyDexTradeRowSchema).nullish(),
  pagination: NansenPaginationSchema.nullish()
})

const SmartMoneyPerpTradeRowSchema = z.object({
  block_timestamp: z.string().nullish(),
  transaction_hash: z.string().nullish(),
  trader_address: z.string().nullish(),
  trader_address_label: z.string().nullish(),
  token_symbol: z.string().nullish(),
  side: z.string().nullish(),
  action: z.string().nullish(),
  type: z.string().nullish(),
  token_amount: z.coerce.number().nullish(),
  price_usd: z.coerce.number().nullish(),
  value_usd: z.coerce.number().nullish()
})

export const SmartMoneyPerpTradesResponseSchema = z.object({
  data: z.array(SmartMoneyPerpTradeRowSchema).nullish(),
  pagination: NansenPaginationSchema.nullish()
})

const SmartMoneyDcaRowSchema = z.object({
  dca_created_at: z.string().nullish(),
  dca_updated_at: z.string().nullish(),
  dca_status: z.string().nullish(),
  trader_address: z.string().nullish(),
  trader_address_label: z.string().nullish(),
  transaction_hash: z.string().nullish(),
  input_token_symbol: z.string().nullish(),
  output_token_symbol: z.string().nullish(),
  deposit_token_amount: z.coerce.number().nullish(),
  token_spent_amount: z.coerce.number().nullish(),
  output_token_redeemed_amount: z.coerce.number().nullish(),
  deposit_value_usd: z.coerce.number().nullish()
})

export const SmartMoneyDcasResponseSchema = z.object({
  data: z.array(SmartMoneyDcaRowSchema).nullish(),
  pagination: NansenPaginationSchema.nullish()
})

// ─── Command outputs ───
// Rows pass through as the provider returns them; the CLI's job is to page and
// print, not to reshape smart-money analytics.

export type SmartMoneyNetflowRow = z.infer<typeof SmartMoneyNetflowRowSchema>
export type SmartMoneyHoldingRow = z.infer<typeof SmartMoneyHoldingRowSchema>
export type SmartMoneyHistoricalHoldingRow = z.infer<typeof SmartMoneyHistoricalHoldingRowSchema>
export type SmartMoneyDexTradeRow = z.infer<typeof SmartMoneyDexTradeRowSchema>
export type SmartMoneyPerpTradeRow = z.infer<typeof SmartMoneyPerpTradeRowSchema>
export type SmartMoneyDcaRow = z.infer<typeof SmartMoneyDcaRowSchema>

// ─── CoinGecko onchain: recently updated token info ───

const RecentlyUpdatedAttributesSchema = z.object({
  address: z.string().nullish(),
  name: z.string().nullish(),
  symbol: z.string().nullish(),
  coingecko_coin_id: z.string().nullish(),
  description: z.string().nullish(),
  twitter_handle: z.string().nullish(),
  telegram_handle: z.string().nullish(),
  websites: z.array(z.string()).nullish(),
  gt_score: z.number().nullish(),
  metadata_updated_at: z.string().nullish()
})

export const RecentlyUpdatedTokensResponseSchema = z.object({
  data: z
    .array(
      z.object({
        id: z.string().nullish(),
        attributes: RecentlyUpdatedAttributesSchema.nullish()
      })
    )
    .nullish()
})

export const RecentlyUpdatedTokenSchema = z.object({
  id: z.string().nullish(),
  address: z.string().nullish(),
  symbol: z.string().nullish(),
  name: z.string().nullish(),
  coingecko_coin_id: z.string().nullish(),
  twitter_handle: z.string().nullish(),
  websites: z.array(z.string()).nullish(),
  gt_score: z.number().nullish(),
  metadata_updated_at: z.string().nullish()
})
export type RecentlyUpdatedToken = z.infer<typeof RecentlyUpdatedTokenSchema>
