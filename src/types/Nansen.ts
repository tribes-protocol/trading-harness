import { z } from 'zod'

// ---------------------------------------------------------------------------
// Raw Nansen payloads (api.nansen.ai, POST /api/v1/*). Shapes follow the
// documented Nansen API v1 endpoints; USD/decimal fields arrive as numbers or
// decimal strings depending on magnitude, so both are accepted. Only the
// fields the harness surfaces are modeled; everything else is ignored at
// parse time.
// ---------------------------------------------------------------------------

const NansenDecimalSchema = z.union([z.number(), z.string()])

const NansenNetflowRowSchema = z.object({
  chain: z.string().nullish(),
  token_address: z.string(),
  token_symbol: z.string().nullish(),
  token_sectors: z.array(z.string()).nullish(),
  net_flow_1h_usd: NansenDecimalSchema.nullish(),
  net_flow_24h_usd: NansenDecimalSchema.nullish(),
  net_flow_7d_usd: NansenDecimalSchema.nullish(),
  net_flow_30d_usd: NansenDecimalSchema.nullish(),
  trader_count: z.number().nullish(),
  token_age_days: z.number().nullish(),
  market_cap_usd: NansenDecimalSchema.nullish()
})

export const NansenNetflowResponseSchema = z.object({
  data: z.array(NansenNetflowRowSchema).nullish()
})
export type NansenNetflowResponse = z.infer<typeof NansenNetflowResponseSchema>

const NansenHoldingRowSchema = z.object({
  chain: z.string().nullish(),
  token_address: z.string(),
  token_symbol: z.string().nullish(),
  token_sectors: z.array(z.string()).nullish(),
  value_usd: NansenDecimalSchema.nullish(),
  balance_24h_percent_change: z.number().nullish(),
  holders_count: z.number().nullish(),
  share_of_holdings_percent: z.number().nullish(),
  token_age_days: z.number().nullish(),
  market_cap_usd: NansenDecimalSchema.nullish()
})

export const NansenHoldingsResponseSchema = z.object({
  data: z.array(NansenHoldingRowSchema).nullish()
})
export type NansenHoldingsResponse = z.infer<typeof NansenHoldingsResponseSchema>

const NansenDexTradeRowSchema = z.object({
  chain: z.string().nullish(),
  block_timestamp: z.string().nullish(),
  trader_address: z.string(),
  trader_address_label: z.string().nullish(),
  token_bought_address: z.string().nullish(),
  token_sold_address: z.string().nullish(),
  token_bought_symbol: z.string().nullish(),
  token_sold_symbol: z.string().nullish(),
  token_bought_amount: z.number().nullish(),
  token_sold_amount: z.number().nullish(),
  trade_value_usd: NansenDecimalSchema.nullish()
})

export const NansenDexTradesResponseSchema = z.object({
  data: z.array(NansenDexTradeRowSchema).nullish()
})
export type NansenDexTradesResponse = z.infer<typeof NansenDexTradesResponseSchema>

const NansenPerpTradeRowSchema = z.object({
  block_timestamp: z.string().nullish(),
  trader_address: z.string(),
  trader_address_label: z.string().nullish(),
  token_symbol: z.string().nullish(),
  side: z.string().nullish(),
  action: z.string().nullish(),
  type: z.string().nullish(),
  token_amount: z.number().nullish(),
  price_usd: NansenDecimalSchema.nullish(),
  value_usd: NansenDecimalSchema.nullish()
})

export const NansenPerpTradesResponseSchema = z.object({
  data: z.array(NansenPerpTradeRowSchema).nullish()
})
export type NansenPerpTradesResponse = z.infer<typeof NansenPerpTradesResponseSchema>

const NansenDcaRowSchema = z.object({
  dca_created_at: z.string().nullish(),
  dca_updated_at: z.string().nullish(),
  trader_address: z.string(),
  trader_address_label: z.string().nullish(),
  dca_status: z.string().nullish(),
  input_token_symbol: z.string().nullish(),
  output_token_symbol: z.string().nullish(),
  deposit_token_amount: z.number().nullish(),
  token_spent_amount: z.number().nullish(),
  output_token_redeemed_amount: z.number().nullish(),
  deposit_value_usd: NansenDecimalSchema.nullish()
})

export const NansenDcasResponseSchema = z.object({
  data: z.array(NansenDcaRowSchema).nullish()
})
export type NansenDcasResponse = z.infer<typeof NansenDcasResponseSchema>

const NansenScreenerRowSchema = z.object({
  chain: z.string().nullish(),
  token_address: z.string(),
  token_symbol: z.string().nullish(),
  token_age_days: z.number().nullish(),
  price_usd: NansenDecimalSchema.nullish(),
  price_change: z.number().nullish(),
  market_cap_usd: NansenDecimalSchema.nullish(),
  liquidity: z.number().nullish(),
  volume: z.number().nullish(),
  buy_volume: z.number().nullish(),
  sell_volume: z.number().nullish(),
  netflow: z.number().nullish(),
  nof_traders: z.number().nullish(),
  nof_buyers: z.number().nullish(),
  nof_sellers: z.number().nullish()
})

export const NansenTokenScreenerResponseSchema = z.object({
  data: z.array(NansenScreenerRowSchema).nullish()
})
export type NansenTokenScreenerResponse = z.infer<typeof NansenTokenScreenerResponseSchema>

const NansenFlowIntelligenceRowSchema = z.object({
  smart_trader_net_flow_usd: NansenDecimalSchema.nullish(),
  smart_trader_avg_flow_usd: NansenDecimalSchema.nullish(),
  smart_trader_wallet_count: z.number().nullish(),
  whale_net_flow_usd: NansenDecimalSchema.nullish(),
  whale_avg_flow_usd: NansenDecimalSchema.nullish(),
  whale_wallet_count: z.number().nullish(),
  public_figure_net_flow_usd: NansenDecimalSchema.nullish(),
  public_figure_wallet_count: z.number().nullish(),
  top_pnl_net_flow_usd: NansenDecimalSchema.nullish(),
  top_pnl_wallet_count: z.number().nullish(),
  exchange_net_flow_usd: NansenDecimalSchema.nullish(),
  exchange_wallet_count: z.number().nullish(),
  fresh_wallets_net_flow_usd: NansenDecimalSchema.nullish(),
  fresh_wallets_wallet_count: z.number().nullish()
})

export const NansenFlowIntelligenceResponseSchema = z.object({
  data: z.array(NansenFlowIntelligenceRowSchema).nullish()
})
export type NansenFlowIntelligenceResponse = z.infer<typeof NansenFlowIntelligenceResponseSchema>

const NansenPnlLeaderboardRowSchema = z.object({
  trader_address: z.string(),
  trader_address_label: z.string().nullish(),
  pnl_usd_realised: NansenDecimalSchema.nullish(),
  pnl_usd_unrealised: NansenDecimalSchema.nullish(),
  pnl_usd_total: NansenDecimalSchema.nullish(),
  roi_percent_total: z.number().nullish(),
  holding_usd: NansenDecimalSchema.nullish(),
  nof_trades: z.number().nullish()
})

export const NansenPnlLeaderboardResponseSchema = z.object({
  data: z.array(NansenPnlLeaderboardRowSchema).nullish()
})
export type NansenPnlLeaderboardResponse = z.infer<typeof NansenPnlLeaderboardResponseSchema>

const NansenBalanceRowSchema = z.object({
  chain: z.string().nullish(),
  token_address: z.string(),
  token_symbol: z.string().nullish(),
  token_amount: z.number().nullish(),
  price_usd: NansenDecimalSchema.nullish(),
  value_usd: NansenDecimalSchema.nullish()
})

export const NansenBalancesResponseSchema = z.object({
  data: z.array(NansenBalanceRowSchema).nullish()
})
export type NansenBalancesResponse = z.infer<typeof NansenBalancesResponseSchema>

const NansenLabelRowSchema = z.object({
  label: z.string(),
  category: z.string().nullish()
})

export const NansenLabelsResponseSchema = z.object({
  data: z.array(NansenLabelRowSchema).nullish()
})
export type NansenLabelsResponse = z.infer<typeof NansenLabelsResponseSchema>

const NansenCounterpartyRowSchema = z.object({
  counterparty_address: z.string(),
  counterparty_address_label: z.array(z.string()).nullish(),
  interaction_count: z.number().nullish(),
  total_volume_usd: NansenDecimalSchema.nullish(),
  volume_in_usd: NansenDecimalSchema.nullish(),
  volume_out_usd: NansenDecimalSchema.nullish()
})

export const NansenCounterpartiesResponseSchema = z.object({
  data: z.array(NansenCounterpartyRowSchema).nullish()
})
export type NansenCounterpartiesResponse = z.infer<typeof NansenCounterpartiesResponseSchema>

const NansenTransactionTokenSchema = z.object({
  token_symbol: z.string().nullish(),
  token_amount: z.number().nullish(),
  value_usd: NansenDecimalSchema.nullish()
})

const NansenTransactionRowSchema = z.object({
  chain: z.string().nullish(),
  block_timestamp: z.string().nullish(),
  transaction_hash: z.string().nullish(),
  method: z.string().nullish(),
  volume_usd: NansenDecimalSchema.nullish(),
  tokens_sent: z.array(NansenTransactionTokenSchema).nullish(),
  tokens_received: z.array(NansenTransactionTokenSchema).nullish()
})

export const NansenTransactionsResponseSchema = z.object({
  data: z.array(NansenTransactionRowSchema).nullish()
})
export type NansenTransactionsResponse = z.infer<typeof NansenTransactionsResponseSchema>

const NansenRelatedWalletRowSchema = z.object({
  address: z.string(),
  address_label: z.string().nullish(),
  relation: z.string().nullish(),
  chain: z.string().nullish()
})

export const NansenRelatedWalletsResponseSchema = z.object({
  data: z.array(NansenRelatedWalletRowSchema).nullish()
})
export type NansenRelatedWalletsResponse = z.infer<typeof NansenRelatedWalletsResponseSchema>

const NansenPnlSummaryTokenSchema = z.object({
  chain: z.string().nullish(),
  token_address: z.string(),
  token_symbol: z.string().nullish(),
  realized_pnl: NansenDecimalSchema.nullish(),
  realized_roi: z.number().nullish()
})

export const NansenPnlSummaryResponseSchema = z.object({
  realized_pnl_usd: NansenDecimalSchema.nullish(),
  realized_pnl_percent: z.number().nullish(),
  win_rate: z.number().nullish(),
  traded_token_count: z.number().nullish(),
  traded_times: z.number().nullish(),
  top5_tokens: z.array(NansenPnlSummaryTokenSchema).nullish()
})
export type NansenPnlSummaryResponse = z.infer<typeof NansenPnlSummaryResponseSchema>

// ---------------------------------------------------------------------------
// Agent-facing output shapes printed by `tribes-cli smart-money` and
// `tribes-cli wallet-data`.
// ---------------------------------------------------------------------------

export const NansenTokenListTimeframeSchema = z.enum(['5m', '10m', '1h', '6h', '24h', '7d', '30d'])
export type NansenTokenListTimeframe = z.infer<typeof NansenTokenListTimeframeSchema>

export const NansenFlowTimeframeSchema = z.enum(['5m', '1h', '6h', '12h', '1d', '7d'])
export type NansenFlowTimeframe = z.infer<typeof NansenFlowTimeframeSchema>

const SmartMoneyNetflowTokenSchema = z.object({
  chain: z.string().nullish(),
  address: z.string(),
  symbol: z.string().nullish(),
  sectors: z.array(z.string()),
  netflow_1h_usd: z.number().nullish(),
  netflow_24h_usd: z.number().nullish(),
  netflow_7d_usd: z.number().nullish(),
  netflow_30d_usd: z.number().nullish(),
  trader_count: z.number().nullish(),
  token_age_days: z.number().nullish(),
  market_cap_usd: z.number().nullish()
})

export const SmartMoneyNetflowsSchema = z.object({
  source: z.literal('nansen'),
  chain: z.string(),
  tokens: z.array(SmartMoneyNetflowTokenSchema)
})
export type SmartMoneyNetflows = z.infer<typeof SmartMoneyNetflowsSchema>

const SmartMoneyHoldingRowSchema = z.object({
  chain: z.string().nullish(),
  address: z.string(),
  symbol: z.string().nullish(),
  sectors: z.array(z.string()),
  value_usd: z.number().nullish(),
  balance_change_24h_pct: z.number().nullish(),
  holders_count: z.number().nullish(),
  share_of_holdings_pct: z.number().nullish(),
  token_age_days: z.number().nullish(),
  market_cap_usd: z.number().nullish()
})

export const SmartMoneyHoldingsSchema = z.object({
  source: z.literal('nansen'),
  chain: z.string(),
  holdings: z.array(SmartMoneyHoldingRowSchema)
})
export type SmartMoneyHoldings = z.infer<typeof SmartMoneyHoldingsSchema>

const SmartMoneyDexTradeRowSchema = z.object({
  chain: z.string().nullish(),
  time: z.string().nullish(),
  trader: z.string(),
  trader_label: z.string().nullish(),
  bought_symbol: z.string().nullish(),
  bought_address: z.string().nullish(),
  bought_amount: z.number().nullish(),
  sold_symbol: z.string().nullish(),
  sold_address: z.string().nullish(),
  sold_amount: z.number().nullish(),
  value_usd: z.number().nullish()
})

export const SmartMoneyDexTradesSchema = z.object({
  source: z.literal('nansen'),
  chain: z.string(),
  trades: z.array(SmartMoneyDexTradeRowSchema)
})
export type SmartMoneyDexTrades = z.infer<typeof SmartMoneyDexTradesSchema>

const SmartMoneyPerpTradeRowSchema = z.object({
  time: z.string().nullish(),
  trader: z.string(),
  trader_label: z.string().nullish(),
  symbol: z.string().nullish(),
  side: z.string().nullish(),
  action: z.string().nullish(),
  type: z.string().nullish(),
  amount: z.number().nullish(),
  price_usd: z.number().nullish(),
  value_usd: z.number().nullish()
})

export const SmartMoneyPerpTradesSchema = z.object({
  source: z.literal('nansen'),
  trades: z.array(SmartMoneyPerpTradeRowSchema)
})
export type SmartMoneyPerpTrades = z.infer<typeof SmartMoneyPerpTradesSchema>

const SmartMoneyDcaRowSchema = z.object({
  created_at: z.string().nullish(),
  updated_at: z.string().nullish(),
  trader: z.string(),
  trader_label: z.string().nullish(),
  status: z.string().nullish(),
  input_symbol: z.string().nullish(),
  output_symbol: z.string().nullish(),
  deposit_amount: z.number().nullish(),
  spent_amount: z.number().nullish(),
  redeemed_amount: z.number().nullish(),
  deposit_value_usd: z.number().nullish()
})

export const SmartMoneyDcasSchema = z.object({
  source: z.literal('nansen'),
  dcas: z.array(SmartMoneyDcaRowSchema)
})
export type SmartMoneyDcas = z.infer<typeof SmartMoneyDcasSchema>

const SmartMoneyTokenListRowSchema = z.object({
  chain: z.string().nullish(),
  address: z.string(),
  symbol: z.string().nullish(),
  price_usd: z.number().nullish(),
  price_change_pct: z.number().nullish(),
  market_cap_usd: z.number().nullish(),
  liquidity_usd: z.number().nullish(),
  volume_usd: z.number().nullish(),
  buy_volume_usd: z.number().nullish(),
  sell_volume_usd: z.number().nullish(),
  netflow_usd: z.number().nullish(),
  traders: z.number().nullish(),
  buyers: z.number().nullish(),
  sellers: z.number().nullish(),
  token_age_days: z.number().nullish()
})

export const SmartMoneyTokenListSchema = z.object({
  source: z.literal('nansen'),
  chain: z.string(),
  timeframe: NansenTokenListTimeframeSchema,
  tokens: z.array(SmartMoneyTokenListRowSchema)
})
export type SmartMoneyTokenList = z.infer<typeof SmartMoneyTokenListSchema>

const TokenFlowIntelligenceRowSchema = z.object({
  smart_trader_netflow_usd: z.number().nullish(),
  smart_trader_wallets: z.number().nullish(),
  whale_netflow_usd: z.number().nullish(),
  whale_wallets: z.number().nullish(),
  public_figure_netflow_usd: z.number().nullish(),
  public_figure_wallets: z.number().nullish(),
  top_pnl_netflow_usd: z.number().nullish(),
  top_pnl_wallets: z.number().nullish(),
  exchange_netflow_usd: z.number().nullish(),
  exchange_wallets: z.number().nullish(),
  fresh_wallet_netflow_usd: z.number().nullish(),
  fresh_wallet_wallets: z.number().nullish()
})

export const TokenFlowIntelligenceSchema = z.object({
  source: z.literal('nansen'),
  chain: z.string(),
  token: z.string(),
  timeframe: NansenFlowTimeframeSchema,
  flows: z.array(TokenFlowIntelligenceRowSchema)
})
export type TokenFlowIntelligence = z.infer<typeof TokenFlowIntelligenceSchema>

const TokenPnlLeaderboardRowSchema = z.object({
  address: z.string(),
  label: z.string().nullish(),
  pnl_total_usd: z.number().nullish(),
  pnl_realized_usd: z.number().nullish(),
  pnl_unrealized_usd: z.number().nullish(),
  roi_total_pct: z.number().nullish(),
  holding_usd: z.number().nullish(),
  trade_count: z.number().nullish()
})

export const TokenPnlLeaderboardSchema = z.object({
  source: z.literal('nansen'),
  chain: z.string(),
  token: z.string(),
  traders: z.array(TokenPnlLeaderboardRowSchema)
})
export type TokenPnlLeaderboard = z.infer<typeof TokenPnlLeaderboardSchema>

const WalletBalanceRowSchema = z.object({
  chain: z.string().nullish(),
  token_address: z.string(),
  symbol: z.string().nullish(),
  amount: z.number().nullish(),
  price_usd: z.number().nullish(),
  value_usd: z.number().nullish()
})

export const WalletBalancesSchema = z.object({
  source: z.literal('nansen'),
  wallet: z.string(),
  chain: z.string(),
  balances: z.array(WalletBalanceRowSchema)
})
export type WalletBalances = z.infer<typeof WalletBalancesSchema>

const WalletLabelRowSchema = z.object({
  label: z.string(),
  category: z.string().nullish()
})

export const WalletLabelsSchema = z.object({
  source: z.literal('nansen'),
  wallet: z.string(),
  chain: z.string(),
  labels: z.array(WalletLabelRowSchema)
})
export type WalletLabels = z.infer<typeof WalletLabelsSchema>

const WalletCounterpartyRowSchema = z.object({
  address: z.string(),
  labels: z.array(z.string()),
  interaction_count: z.number().nullish(),
  volume_usd: z.number().nullish(),
  volume_in_usd: z.number().nullish(),
  volume_out_usd: z.number().nullish()
})

export const WalletCounterpartiesSchema = z.object({
  source: z.literal('nansen'),
  wallet: z.string(),
  chain: z.string(),
  counterparties: z.array(WalletCounterpartyRowSchema)
})
export type WalletCounterparties = z.infer<typeof WalletCounterpartiesSchema>

const WalletTransactionTokenSchema = z.object({
  symbol: z.string().nullish(),
  amount: z.number().nullish(),
  value_usd: z.number().nullish()
})

const WalletTransactionRowSchema = z.object({
  chain: z.string().nullish(),
  time: z.string().nullish(),
  tx_hash: z.string().nullish(),
  method: z.string().nullish(),
  volume_usd: z.number().nullish(),
  sent: z.array(WalletTransactionTokenSchema),
  received: z.array(WalletTransactionTokenSchema)
})

export const WalletTransactionsSchema = z.object({
  source: z.literal('nansen'),
  wallet: z.string(),
  chain: z.string(),
  transactions: z.array(WalletTransactionRowSchema)
})
export type WalletTransactions = z.infer<typeof WalletTransactionsSchema>

const WalletRelatedRowSchema = z.object({
  address: z.string(),
  label: z.string().nullish(),
  relation: z.string().nullish()
})

export const WalletRelatedWalletsSchema = z.object({
  source: z.literal('nansen'),
  wallet: z.string(),
  chain: z.string(),
  wallets: z.array(WalletRelatedRowSchema)
})
export type WalletRelatedWallets = z.infer<typeof WalletRelatedWalletsSchema>

const WalletPnlTopTokenSchema = z.object({
  chain: z.string().nullish(),
  address: z.string(),
  symbol: z.string().nullish(),
  realized_pnl_usd: z.number().nullish(),
  realized_roi_pct: z.number().nullish()
})

export const WalletPnlSummarySchema = z.object({
  source: z.literal('nansen'),
  wallet: z.string(),
  chain: z.string(),
  realized_pnl_usd: z.number().nullish(),
  realized_pnl_pct: z.number().nullish(),
  win_rate: z.number().nullish(),
  traded_token_count: z.number().nullish(),
  trade_count: z.number().nullish(),
  top_tokens: z.array(WalletPnlTopTokenSchema)
})
export type WalletPnlSummary = z.infer<typeof WalletPnlSummarySchema>

// ---------------------------------------------------------------------------
// `tribes-cli smart-money` and `tribes-cli wallet-data` command options.
// ---------------------------------------------------------------------------

export const SmartMoneyListCommandOptionsSchema = z.object({
  chain: z.string().min(1).nullish(),
  limit: z.number().int().min(1).max(100).nullish(),
  token: z.string().min(1).nullish(),
  out: z.string().nullish()
})
export type SmartMoneyListCommandOptions = z.infer<typeof SmartMoneyListCommandOptionsSchema>

export const SmartMoneyTradesCommandOptionsSchema = z.object({
  limit: z.number().int().min(1).max(100).nullish(),
  token: z.string().min(1).nullish(),
  out: z.string().nullish()
})
export type SmartMoneyTradesCommandOptions = z.infer<typeof SmartMoneyTradesCommandOptionsSchema>

export const SmartMoneyTokenListCommandOptionsSchema = z.object({
  chain: z.string().min(1).nullish(),
  limit: z.number().int().min(1).max(100).nullish(),
  timeframe: NansenTokenListTimeframeSchema.nullish(),
  out: z.string().nullish()
})
export type SmartMoneyTokenListCommandOptions = z.infer<
  typeof SmartMoneyTokenListCommandOptionsSchema
>

export const SmartMoneyFlowIntelligenceCommandOptionsSchema = z.object({
  token: z.string().min(1),
  chain: z.string().min(1),
  timeframe: NansenFlowTimeframeSchema.nullish(),
  out: z.string().nullish()
})
export type SmartMoneyFlowIntelligenceCommandOptions = z.infer<
  typeof SmartMoneyFlowIntelligenceCommandOptionsSchema
>

export const SmartMoneyPnlLeaderboardCommandOptionsSchema = z.object({
  token: z.string().min(1),
  chain: z.string().min(1),
  limit: z.number().int().min(1).max(100).nullish(),
  out: z.string().nullish()
})
export type SmartMoneyPnlLeaderboardCommandOptions = z.infer<
  typeof SmartMoneyPnlLeaderboardCommandOptionsSchema
>

export const WalletDataCommandOptionsSchema = z.object({
  wallet: z.string().min(1),
  chain: z.string().min(1).nullish(),
  out: z.string().nullish()
})
export type WalletDataCommandOptions = z.infer<typeof WalletDataCommandOptionsSchema>

export const WalletDataListCommandOptionsSchema = z.object({
  wallet: z.string().min(1),
  chain: z.string().min(1).nullish(),
  limit: z.number().int().min(1).max(100).nullish(),
  out: z.string().nullish()
})
export type WalletDataListCommandOptions = z.infer<typeof WalletDataListCommandOptionsSchema>
