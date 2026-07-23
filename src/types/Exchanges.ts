import { z } from 'zod'

// ---------------------------------------------------------------------------
// Raw CoinGecko Pro payloads (pro-api.coingecko.com). Only the fields the
// harness surfaces are modeled; everything else is ignored at parse time.
// Shapes follow https://docs.coingecko.com/reference (exchanges, derivatives,
// companies public treasury endpoints).
// ---------------------------------------------------------------------------

export const CoinGeckoExchangeRowSchema = z.object({
  id: z.string(),
  name: z.string().nullish(),
  country: z.string().nullish(),
  year_established: z.number().nullish(),
  trust_score: z.number().nullish(),
  trust_score_rank: z.number().nullish(),
  trade_volume_24h_btc: z.number().nullish(),
  trade_volume_24h_btc_normalized: z.number().nullish()
})
export type CoinGeckoExchangeRow = z.infer<typeof CoinGeckoExchangeRowSchema>

export const CoinGeckoExchangeTickerSchema = z.object({
  base: z.string().nullish(),
  target: z.string().nullish(),
  last: z.number().nullish(),
  converted_last: z.record(z.string(), z.number()).nullish(),
  converted_volume: z.record(z.string(), z.number()).nullish(),
  trust_score: z.string().nullish(),
  bid_ask_spread_percentage: z.number().nullish()
})
export type CoinGeckoExchangeTicker = z.infer<typeof CoinGeckoExchangeTickerSchema>

export const CoinGeckoExchangeDetailResponseSchema = z.object({
  name: z.string().nullish(),
  country: z.string().nullish(),
  year_established: z.number().nullish(),
  trust_score: z.number().nullish(),
  trust_score_rank: z.number().nullish(),
  trade_volume_24h_btc: z.number().nullish(),
  trade_volume_24h_btc_normalized: z.number().nullish(),
  tickers: z.array(CoinGeckoExchangeTickerSchema).nullish()
})
export type CoinGeckoExchangeDetailResponse = z.infer<typeof CoinGeckoExchangeDetailResponseSchema>

export const CoinGeckoExchangeTickersResponseSchema = z.object({
  name: z.string().nullish(),
  tickers: z.array(CoinGeckoExchangeTickerSchema).nullish()
})
export type CoinGeckoExchangeTickersResponse = z.infer<
  typeof CoinGeckoExchangeTickersResponseSchema
>

// Volume chart points arrive as [epoch_ms, "btc_volume_decimal_string"].
export const CoinGeckoExchangeVolumeChartResponseSchema = z.array(
  z.tuple([z.number(), z.union([z.string(), z.number()])])
)
export type CoinGeckoExchangeVolumeChartResponse = z.infer<
  typeof CoinGeckoExchangeVolumeChartResponseSchema
>

// /derivatives rows encode price as a decimal string; the rest are numbers.
export const CoinGeckoDerivativeRowSchema = z.object({
  market: z.string().nullish(),
  symbol: z.string().nullish(),
  index_id: z.string().nullish(),
  price: z.union([z.string(), z.number()]).nullish(),
  price_percentage_change_24h: z.number().nullish(),
  contract_type: z.string().nullish(),
  spread: z.number().nullish(),
  funding_rate: z.number().nullish(),
  open_interest: z.number().nullish(),
  volume_24h: z.number().nullish()
})
export type CoinGeckoDerivativeRow = z.infer<typeof CoinGeckoDerivativeRowSchema>

// /derivatives/exchanges encodes trade_volume_24h_btc as a decimal string.
export const CoinGeckoDerivativesExchangeRowSchema = z.object({
  id: z.string(),
  name: z.string().nullish(),
  open_interest_btc: z.number().nullish(),
  trade_volume_24h_btc: z.union([z.string(), z.number()]).nullish(),
  number_of_perpetual_pairs: z.number().nullish(),
  number_of_futures_pairs: z.number().nullish(),
  year_established: z.number().nullish(),
  country: z.string().nullish()
})
export type CoinGeckoDerivativesExchangeRow = z.infer<typeof CoinGeckoDerivativesExchangeRowSchema>

export const CoinGeckoTreasuryResponseSchema = z.object({
  total_holdings: z.number().nullish(),
  total_value_usd: z.number().nullish(),
  market_cap_dominance: z.number().nullish(),
  companies: z
    .array(
      z.object({
        name: z.string().nullish(),
        symbol: z.string().nullish(),
        country: z.string().nullish(),
        total_holdings: z.number().nullish(),
        total_entry_value_usd: z.number().nullish(),
        total_current_value_usd: z.number().nullish(),
        percentage_of_total_supply: z.number().nullish()
      })
    )
    .nullish()
})
export type CoinGeckoTreasuryResponse = z.infer<typeof CoinGeckoTreasuryResponseSchema>

export const CoinGeckoEntityRowSchema = z.object({
  id: z.string(),
  name: z.string().nullish(),
  symbol: z.string().nullish(),
  country: z.string().nullish()
})
export type CoinGeckoEntityRow = z.infer<typeof CoinGeckoEntityRowSchema>

export const CoinGeckoTreasuryEntityResponseSchema = z.object({
  id: z.string().nullish(),
  name: z.string().nullish(),
  type: z.string().nullish(),
  symbol: z.string().nullish(),
  country: z.string().nullish(),
  total_treasury_value_usd: z.number().nullish(),
  unrealized_pnl: z.number().nullish(),
  holdings: z
    .array(
      z.object({
        coin_id: z.string(),
        amount: z.number().nullish(),
        current_value_usd: z.number().nullish(),
        total_entry_value_usd: z.number().nullish(),
        average_entry_value_usd: z.number().nullish(),
        percentage_of_total_supply: z.number().nullish(),
        unrealized_pnl: z.number().nullish()
      })
    )
    .nullish()
})
export type CoinGeckoTreasuryEntityResponse = z.infer<typeof CoinGeckoTreasuryEntityResponseSchema>

// Chart points arrive as [epoch_ms, value].
export const CoinGeckoTreasuryHoldingChartResponseSchema = z.object({
  holdings: z.array(z.tuple([z.number(), z.number()])).nullish(),
  holding_value_in_usd: z.array(z.tuple([z.number(), z.number()])).nullish()
})
export type CoinGeckoTreasuryHoldingChartResponse = z.infer<
  typeof CoinGeckoTreasuryHoldingChartResponseSchema
>

export const CoinGeckoTreasuryTransactionHistoryResponseSchema = z.object({
  transactions: z
    .array(
      z.object({
        date: z.number().nullish(),
        coin_id: z.string().nullish(),
        type: z.string().nullish(),
        holding_net_change: z.number().nullish(),
        transaction_value_usd: z.number().nullish(),
        holding_balance: z.number().nullish(),
        average_entry_value_usd: z.number().nullish(),
        source_url: z.string().nullish()
      })
    )
    .nullish()
})
export type CoinGeckoTreasuryTransactionHistoryResponse = z.infer<
  typeof CoinGeckoTreasuryTransactionHistoryResponseSchema
>

// ---------------------------------------------------------------------------
// Agent-facing output shapes printed by `tribes-cli exchanges`.
// ---------------------------------------------------------------------------

export const ExchangesVolumeChartDaysSchema = z.enum(['1', '7', '14', '30', '90', '180', '365'])
export type ExchangesVolumeChartDays = z.infer<typeof ExchangesVolumeChartDaysSchema>

export const ExchangesTreasuryCoinSchema = z.enum(['bitcoin', 'ethereum'])
export type ExchangesTreasuryCoin = z.infer<typeof ExchangesTreasuryCoinSchema>

const ExchangeRowSchema = z.object({
  id: z.string(),
  name: z.string().nullish(),
  trust_score: z.number().nullish(),
  trust_rank: z.number().nullish(),
  volume_24h_btc: z.number().nullish()
})

export const ExchangesListSchema = z.object({
  source: z.literal('coingecko'),
  exchanges: z.array(ExchangeRowSchema)
})
export type ExchangesList = z.infer<typeof ExchangesListSchema>

const ExchangeTickerRowSchema = z.object({
  pair: z.string(),
  price_usd: z.number().nullish(),
  volume_24h_usd: z.number().nullish(),
  spread_pct: z.number().nullish(),
  trust_score: z.string().nullish()
})
export type ExchangeTickerRow = z.infer<typeof ExchangeTickerRowSchema>

export const ExchangeDetailSchema = z.object({
  source: z.literal('coingecko'),
  id: z.string(),
  name: z.string().nullish(),
  country: z.string().nullish(),
  year_established: z.number().nullish(),
  trust_score: z.number().nullish(),
  trust_rank: z.number().nullish(),
  volume_24h_btc: z.number().nullish(),
  top_tickers: z.array(ExchangeTickerRowSchema)
})
export type ExchangeDetail = z.infer<typeof ExchangeDetailSchema>

export const ExchangeTickersSchema = z.object({
  source: z.literal('coingecko'),
  id: z.string(),
  tickers: z.array(ExchangeTickerRowSchema)
})
export type ExchangeTickers = z.infer<typeof ExchangeTickersSchema>

const ExchangeVolumePointSchema = z.object({
  t: z.number(),
  volume_btc: z.number().nullish()
})

export const ExchangeVolumeChartSchema = z.object({
  source: z.literal('coingecko'),
  id: z.string(),
  days: ExchangesVolumeChartDaysSchema,
  points: z.array(ExchangeVolumePointSchema)
})
export type ExchangeVolumeChart = z.infer<typeof ExchangeVolumeChartSchema>

const DerivativeTickerRowSchema = z.object({
  market: z.string().nullish(),
  symbol: z.string().nullish(),
  contract_type: z.string().nullish(),
  price_usd: z.number().nullish(),
  change_24h_pct: z.number().nullish(),
  open_interest_usd: z.number().nullish(),
  volume_24h_usd: z.number().nullish(),
  funding_rate_pct: z.number().nullish(),
  spread_pct: z.number().nullish()
})

export const DerivativesTickersSchema = z.object({
  source: z.literal('coingecko'),
  tickers: z.array(DerivativeTickerRowSchema)
})
export type DerivativesTickers = z.infer<typeof DerivativesTickersSchema>

const DerivativesExchangeRowSchema = z.object({
  id: z.string(),
  name: z.string().nullish(),
  open_interest_btc: z.number().nullish(),
  volume_24h_btc: z.number().nullish(),
  perpetual_pairs: z.number().nullish(),
  futures_pairs: z.number().nullish()
})

export const DerivativesExchangesSchema = z.object({
  source: z.literal('coingecko'),
  exchanges: z.array(DerivativesExchangeRowSchema)
})
export type DerivativesExchanges = z.infer<typeof DerivativesExchangesSchema>

const TreasuryCompanyRowSchema = z.object({
  name: z.string().nullish(),
  symbol: z.string().nullish(),
  country: z.string().nullish(),
  total_holdings: z.number().nullish(),
  entry_value_usd: z.number().nullish(),
  current_value_usd: z.number().nullish(),
  pct_of_total_supply: z.number().nullish()
})

export const PublicTreasurySchema = z.object({
  source: z.literal('coingecko'),
  coin: ExchangesTreasuryCoinSchema,
  total_holdings: z.number().nullish(),
  total_value_usd: z.number().nullish(),
  market_cap_dominance_pct: z.number().nullish(),
  companies: z.array(TreasuryCompanyRowSchema)
})
export type PublicTreasury = z.infer<typeof PublicTreasurySchema>

export const TreasuryChartDaysSchema = z.enum(['7', '14', '30', '90', '180', '365', '730', 'max'])
export type TreasuryChartDays = z.infer<typeof TreasuryChartDaysSchema>

const TreasuryEntityRowSchema = z.object({
  id: z.string(),
  name: z.string().nullish(),
  symbol: z.string().nullish(),
  country: z.string().nullish()
})

export const TreasuryEntitiesSchema = z.object({
  source: z.literal('coingecko'),
  entities: z.array(TreasuryEntityRowSchema)
})
export type TreasuryEntities = z.infer<typeof TreasuryEntitiesSchema>

const TreasuryHoldingRowSchema = z.object({
  coin_id: z.string(),
  amount: z.number().nullish(),
  current_value_usd: z.number().nullish(),
  entry_value_usd: z.number().nullish(),
  avg_entry_value_usd: z.number().nullish(),
  pct_of_total_supply: z.number().nullish(),
  unrealized_pnl_usd: z.number().nullish()
})

export const TreasuryEntityHoldingsSchema = z.object({
  source: z.literal('coingecko'),
  entity: z.string(),
  name: z.string().nullish(),
  type: z.string().nullish(),
  symbol: z.string().nullish(),
  country: z.string().nullish(),
  total_value_usd: z.number().nullish(),
  unrealized_pnl_usd: z.number().nullish(),
  holdings: z.array(TreasuryHoldingRowSchema)
})
export type TreasuryEntityHoldings = z.infer<typeof TreasuryEntityHoldingsSchema>

const TreasuryChartPointSchema = z.object({
  t: z.number(),
  amount: z.number()
})

const TreasuryChartUsdPointSchema = z.object({
  t: z.number(),
  usd: z.number()
})

export const TreasuryHoldingChartSchema = z.object({
  source: z.literal('coingecko'),
  entity: z.string(),
  coin: z.string(),
  days: TreasuryChartDaysSchema,
  holdings: z.array(TreasuryChartPointSchema),
  value_usd: z.array(TreasuryChartUsdPointSchema)
})
export type TreasuryHoldingChart = z.infer<typeof TreasuryHoldingChartSchema>

const TreasuryTransactionRowSchema = z.object({
  date: z.number().nullish(),
  coin_id: z.string().nullish(),
  type: z.string().nullish(),
  net_change: z.number().nullish(),
  value_usd: z.number().nullish(),
  balance: z.number().nullish(),
  avg_entry_value_usd: z.number().nullish()
})

export const TreasuryHistorySchema = z.object({
  source: z.literal('coingecko'),
  entity: z.string(),
  transactions: z.array(TreasuryTransactionRowSchema)
})
export type TreasuryHistory = z.infer<typeof TreasuryHistorySchema>

// ---------------------------------------------------------------------------
// `tribes-cli exchanges` command options.
// ---------------------------------------------------------------------------

export const ExchangesListCommandOptionsSchema = z.object({
  limit: z.number().int().min(1).max(250).nullish(),
  out: z.string().nullish()
})
export type ExchangesListCommandOptions = z.infer<typeof ExchangesListCommandOptionsSchema>

export const ExchangesDetailCommandOptionsSchema = z.object({
  id: z.string().min(1),
  out: z.string().nullish()
})
export type ExchangesDetailCommandOptions = z.infer<typeof ExchangesDetailCommandOptionsSchema>

export const ExchangesTickersCommandOptionsSchema = z.object({
  id: z.string().min(1),
  limit: z.number().int().min(1).max(100).nullish(),
  out: z.string().nullish()
})
export type ExchangesTickersCommandOptions = z.infer<typeof ExchangesTickersCommandOptionsSchema>

export const ExchangesVolumeChartCommandOptionsSchema = z.object({
  id: z.string().min(1),
  days: ExchangesVolumeChartDaysSchema,
  out: z.string().nullish()
})
export type ExchangesVolumeChartCommandOptions = z.infer<
  typeof ExchangesVolumeChartCommandOptionsSchema
>

export const ExchangesDerivativesCommandOptionsSchema = z.object({
  limit: z.number().int().min(1).max(500).nullish(),
  out: z.string().nullish()
})
export type ExchangesDerivativesCommandOptions = z.infer<
  typeof ExchangesDerivativesCommandOptionsSchema
>

export const ExchangesDerivativesExchangesCommandOptionsSchema = z.object({
  limit: z.number().int().min(1).max(250).nullish(),
  out: z.string().nullish()
})
export type ExchangesDerivativesExchangesCommandOptions = z.infer<
  typeof ExchangesDerivativesExchangesCommandOptionsSchema
>

export const ExchangesTreasuryCommandOptionsSchema = z.object({
  coin: ExchangesTreasuryCoinSchema,
  out: z.string().nullish()
})
export type ExchangesTreasuryCommandOptions = z.infer<typeof ExchangesTreasuryCommandOptionsSchema>

export const ExchangesTreasuryEntitiesCommandOptionsSchema = z.object({
  limit: z.number().int().min(1).max(250).nullish(),
  out: z.string().nullish()
})
export type ExchangesTreasuryEntitiesCommandOptions = z.infer<
  typeof ExchangesTreasuryEntitiesCommandOptionsSchema
>

export const ExchangesTreasuryEntityCommandOptionsSchema = z.object({
  entity: z.string().min(1),
  coin: z.string().min(1).nullish(),
  out: z.string().nullish()
})
export type ExchangesTreasuryEntityCommandOptions = z.infer<
  typeof ExchangesTreasuryEntityCommandOptionsSchema
>

export const ExchangesTreasuryChartCommandOptionsSchema = z.object({
  entity: z.string().min(1),
  coin: z.string().min(1),
  days: TreasuryChartDaysSchema.nullish(),
  out: z.string().nullish()
})
export type ExchangesTreasuryChartCommandOptions = z.infer<
  typeof ExchangesTreasuryChartCommandOptionsSchema
>

export const ExchangesTreasuryHistoryCommandOptionsSchema = z.object({
  entity: z.string().min(1),
  limit: z.number().int().min(1).max(250).nullish(),
  out: z.string().nullish()
})
export type ExchangesTreasuryHistoryCommandOptions = z.infer<
  typeof ExchangesTreasuryHistoryCommandOptionsSchema
>
