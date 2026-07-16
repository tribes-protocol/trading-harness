import { z } from 'zod'

import { ChainIdSchema } from '@/types/ChainId'

// Nansen API v1 types (docs.nansen.ai). Every data endpoint is POST with a JSON
// body; list responses arrive as {data: [...], pagination} while the profiler
// pnl-summary endpoint returns top-level fields with no data array. Raw schemas
// are defensive (everything nullish, numbers may arrive as strings); normalized
// shapes are snake_case with numbers as numbers. Timestamps and dates stay the
// ISO-8601 strings Nansen returns ('YYYY-MM-DD' for daily flow rows).

// Numeric fields occasionally appear as JSON strings in the docs examples
// (e.g. nof_buys/nof_sells on profiler endpoints); accept both and convert
// during normalization.
const NansenRawNumberSchema = z.union([z.number(), z.string()]).nullish()
export type NansenRawNumber = z.infer<typeof NansenRawNumberSchema>

// ---------------------------------------------------------------------------
// Raw provider responses
// ---------------------------------------------------------------------------

const NansenNetflowRawRowSchema = z.object({
  chain: z.string().nullish(),
  token_address: z.string().nullish(),
  token_symbol: z.string().nullish(),
  net_flow_1h_usd: NansenRawNumberSchema,
  net_flow_24h_usd: NansenRawNumberSchema,
  net_flow_7d_usd: NansenRawNumberSchema,
  net_flow_30d_usd: NansenRawNumberSchema,
  token_sectors: z.string().array().nullish(),
  trader_count: NansenRawNumberSchema,
  token_age_days: NansenRawNumberSchema,
  market_cap_usd: NansenRawNumberSchema
})
export type NansenNetflowRawRow = z.infer<typeof NansenNetflowRawRowSchema>

export const NansenNetflowResponseSchema = z.object({
  data: NansenNetflowRawRowSchema.array().nullish()
})
export type NansenNetflowResponse = z.infer<typeof NansenNetflowResponseSchema>

const NansenHoldingRawRowSchema = z.object({
  chain: z.string().nullish(),
  token_address: z.string().nullish(),
  token_symbol: z.string().nullish(),
  token_sectors: z.string().array().nullish(),
  value_usd: NansenRawNumberSchema,
  balance_24h_percent_change: NansenRawNumberSchema,
  holders_count: NansenRawNumberSchema,
  share_of_holdings_percent: NansenRawNumberSchema,
  token_age_days: NansenRawNumberSchema,
  market_cap_usd: NansenRawNumberSchema
})
export type NansenHoldingRawRow = z.infer<typeof NansenHoldingRawRowSchema>

export const NansenHoldingsResponseSchema = z.object({
  data: NansenHoldingRawRowSchema.array().nullish()
})
export type NansenHoldingsResponse = z.infer<typeof NansenHoldingsResponseSchema>

const NansenDexTradeRawRowSchema = z.object({
  chain: z.string().nullish(),
  block_timestamp: z.string().nullish(),
  transaction_hash: z.string().nullish(),
  trader_address: z.string().nullish(),
  trader_address_label: z.string().nullish(),
  token_bought_address: z.string().nullish(),
  token_sold_address: z.string().nullish(),
  token_bought_symbol: z.string().nullish(),
  token_sold_symbol: z.string().nullish(),
  token_bought_amount: NansenRawNumberSchema,
  token_sold_amount: NansenRawNumberSchema,
  trade_value_usd: NansenRawNumberSchema
})
export type NansenDexTradeRawRow = z.infer<typeof NansenDexTradeRawRowSchema>

export const NansenDexTradesResponseSchema = z.object({
  data: NansenDexTradeRawRowSchema.array().nullish()
})
export type NansenDexTradesResponse = z.infer<typeof NansenDexTradesResponseSchema>

const NansenTokenFlowRawRowSchema = z.object({
  date: z.string().nullish(),
  price_usd: NansenRawNumberSchema,
  token_amount: NansenRawNumberSchema,
  value_usd: NansenRawNumberSchema,
  holders_count: NansenRawNumberSchema,
  total_inflows_count: NansenRawNumberSchema,
  total_outflows_count: NansenRawNumberSchema,
  total_inflows_dex: NansenRawNumberSchema,
  total_outflows_dex: NansenRawNumberSchema,
  total_inflows_cex: NansenRawNumberSchema,
  total_outflows_cex: NansenRawNumberSchema
})
export type NansenTokenFlowRawRow = z.infer<typeof NansenTokenFlowRawRowSchema>

export const NansenTokenFlowsResponseSchema = z.object({
  data: NansenTokenFlowRawRowSchema.array().nullish()
})
export type NansenTokenFlowsResponse = z.infer<typeof NansenTokenFlowsResponseSchema>

const NansenPnlTopTokenRawSchema = z.object({
  realized_pnl: NansenRawNumberSchema,
  realized_roi: NansenRawNumberSchema,
  token_address: z.string().nullish(),
  token_symbol: z.string().nullish(),
  chain: z.string().nullish()
})
export type NansenPnlTopTokenRaw = z.infer<typeof NansenPnlTopTokenRawSchema>

// pnl-summary is the one endpoint that returns top-level fields (no data
// array) and uses American 'realized' spelling, unlike profiler /pnl.
export const NansenPnlSummaryResponseSchema = z.object({
  top5_tokens: NansenPnlTopTokenRawSchema.array().nullish(),
  traded_token_count: NansenRawNumberSchema,
  traded_times: NansenRawNumberSchema,
  realized_pnl_usd: NansenRawNumberSchema,
  realized_pnl_percent: NansenRawNumberSchema,
  win_rate: NansenRawNumberSchema
})
export type NansenPnlSummaryResponse = z.infer<typeof NansenPnlSummaryResponseSchema>

// ---------------------------------------------------------------------------
// Normalized internal shapes (envelope always carries source: 'nansen')
// ---------------------------------------------------------------------------

// The netflow endpoint has no timeframe request parameter; the timeframe picks
// which net_flow_<tf>_usd column the results are ranked by (order_by). Default
// 7d mirrors the docs' order_by example.
const NansenNetflowTimeframeSchema = z.enum(['1h', '24h', '7d', '30d'])
export type NansenNetflowTimeframe = z.infer<typeof NansenNetflowTimeframeSchema>

const SmartMoneyNetflowRowSchema = z.object({
  chain: z.string().nullish(),
  token_address: z.string().nullish(),
  symbol: z.string().nullish(),
  net_flow_1h_usd: z.number().nullish(),
  net_flow_24h_usd: z.number().nullish(),
  net_flow_7d_usd: z.number().nullish(),
  net_flow_30d_usd: z.number().nullish(),
  trader_count: z.number().nullish(),
  token_sectors: z.string().array(),
  token_age_days: z.number().nullish(),
  market_cap_usd: z.number().nullish()
})
export type SmartMoneyNetflowRow = z.infer<typeof SmartMoneyNetflowRowSchema>

export const SmartMoneyNetflowsSchema = z.object({
  source: z.literal('nansen'),
  chains: z.string().array(),
  timeframe: NansenNetflowTimeframeSchema,
  rows: SmartMoneyNetflowRowSchema.array()
})
export type SmartMoneyNetflows = z.infer<typeof SmartMoneyNetflowsSchema>

const SmartMoneyHoldingRowSchema = z.object({
  chain: z.string().nullish(),
  token_address: z.string().nullish(),
  symbol: z.string().nullish(),
  balance_usd: z.number().nullish(),
  balance_24h_percent_change: z.number().nullish(),
  holders_count: z.number().nullish(),
  share_of_holdings_pct: z.number().nullish(),
  token_sectors: z.string().array(),
  token_age_days: z.number().nullish(),
  market_cap_usd: z.number().nullish()
})
export type SmartMoneyHoldingRow = z.infer<typeof SmartMoneyHoldingRowSchema>

export const SmartMoneyHoldingsSchema = z.object({
  source: z.literal('nansen'),
  chains: z.string().array(),
  rows: SmartMoneyHoldingRowSchema.array()
})
export type SmartMoneyHoldings = z.infer<typeof SmartMoneyHoldingsSchema>

const SmartMoneyDexTradeSideSchema = z.object({
  address: z.string().nullish(),
  symbol: z.string().nullish(),
  amount: z.number().nullish()
})
export type SmartMoneyDexTradeSide = z.infer<typeof SmartMoneyDexTradeSideSchema>

const SmartMoneyDexTradeRowSchema = z.object({
  chain: z.string().nullish(),
  tx_hash: z.string().nullish(),
  timestamp: z.string().nullish(),
  wallet_address: z.string().nullish(),
  wallet_label: z.string().nullish(),
  token_bought: SmartMoneyDexTradeSideSchema,
  token_sold: SmartMoneyDexTradeSideSchema,
  value_usd: z.number().nullish()
})
export type SmartMoneyDexTradeRow = z.infer<typeof SmartMoneyDexTradeRowSchema>

export const SmartMoneyDexTradesSchema = z.object({
  source: z.literal('nansen'),
  chains: z.string().array(),
  rows: SmartMoneyDexTradeRowSchema.array()
})
export type SmartMoneyDexTrades = z.infer<typeof SmartMoneyDexTradesSchema>

// Daily flow rows for the smart-money cohort. Nansen reports the cohort's
// holdings value/counts per day rather than a single netflow_usd column, so
// the actual field names are kept.
const SmartMoneyTokenFlowRowSchema = z.object({
  date: z.string().nullish(),
  price_usd: z.number().nullish(),
  token_amount: z.number().nullish(),
  value_usd: z.number().nullish(),
  holders_count: z.number().nullish(),
  total_inflows_count: z.number().nullish(),
  total_outflows_count: z.number().nullish(),
  total_inflows_dex: z.number().nullish(),
  total_outflows_dex: z.number().nullish(),
  total_inflows_cex: z.number().nullish(),
  total_outflows_cex: z.number().nullish()
})
export type SmartMoneyTokenFlowRow = z.infer<typeof SmartMoneyTokenFlowRowSchema>

export const SmartMoneyTokenFlowsSchema = z.object({
  source: z.literal('nansen'),
  chain: z.string(),
  token_address: z.string(),
  label: z.string(),
  date_from: z.string(),
  date_to: z.string(),
  // Nansen returns hourly rows for windows of ~7 days or less, daily beyond.
  granularity: z.enum(['hourly', 'daily']).nullish(),
  rows: SmartMoneyTokenFlowRowSchema.array()
})
export type SmartMoneyTokenFlows = z.infer<typeof SmartMoneyTokenFlowsSchema>

const SmartMoneyPnlTopTokenSchema = z.object({
  chain: z.string().nullish(),
  token_address: z.string().nullish(),
  symbol: z.string().nullish(),
  realized_pnl_usd: z.number().nullish(),
  // Scale as returned by Nansen (docs do not state percent vs fraction).
  realized_roi: z.number().nullish()
})
export type SmartMoneyPnlTopToken = z.infer<typeof SmartMoneyPnlTopTokenSchema>

export const SmartMoneyWalletPnlSchema = z.object({
  source: z.literal('nansen'),
  address: z.string(),
  chain: z.string(),
  realized_pnl_usd: z.number().nullish(),
  realized_pnl_percent: z.number().nullish(),
  // pnl-summary reports realized figures only; kept for shape parity and
  // always null until Nansen exposes unrealized PnL on this endpoint.
  unrealized_pnl_usd: z.number().nullish(),
  // Raw win_rate value passed through unmodified (docs do not state the scale).
  win_rate_pct: z.number().nullish(),
  traded_token_count: z.number().nullish(),
  traded_times: z.number().nullish(),
  top_tokens: SmartMoneyPnlTopTokenSchema.array()
})
export type SmartMoneyWalletPnl = z.infer<typeof SmartMoneyWalletPnlSchema>

// ---------------------------------------------------------------------------
// CLI command options
// ---------------------------------------------------------------------------

const SmartMoneyChainListSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => value.split(',').map((part) => part.trim()))
  .pipe(ChainIdSchema.array().min(1))
export type SmartMoneyChainList = z.infer<typeof SmartMoneyChainListSchema>

export const SmartMoneyNetflowsCommandOptionsSchema = z.object({
  chains: SmartMoneyChainListSchema.nullish(),
  timeframe: NansenNetflowTimeframeSchema.default('7d'),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  out: z.string().nullish()
})
export type SmartMoneyNetflowsCommandOptions = z.infer<
  typeof SmartMoneyNetflowsCommandOptionsSchema
>

export const SmartMoneyListCommandOptionsSchema = z.object({
  chains: SmartMoneyChainListSchema.nullish(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  out: z.string().nullish()
})
export type SmartMoneyListCommandOptions = z.infer<typeof SmartMoneyListCommandOptionsSchema>

export const SmartMoneyTokenFlowsCommandOptionsSchema = z.object({
  address: z.string().trim().min(1),
  chain: ChainIdSchema,
  days: z.coerce.number().int().min(1).max(365).default(30),
  out: z.string().nullish()
})
export type SmartMoneyTokenFlowsCommandOptions = z.infer<
  typeof SmartMoneyTokenFlowsCommandOptionsSchema
>

export const SmartMoneyWalletPnlCommandOptionsSchema = z.object({
  address: z.string().trim().min(1),
  chain: ChainIdSchema,
  days: z.coerce.number().int().min(1).max(365).default(30),
  out: z.string().nullish()
})
export type SmartMoneyWalletPnlCommandOptions = z.infer<
  typeof SmartMoneyWalletPnlCommandOptionsSchema
>
