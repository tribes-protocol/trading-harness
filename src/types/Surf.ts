import { z } from 'zod'

// ---------------------------------------------------------------------------
// SurfAI Data API (api.asksurf.ai, base path /gateway/v1 — the `/gateway`
// segment is mandatory; the apex host and a missing prefix both 404).
//
// Only the derivatives surface is modeled here: funding history, long/short
// ratio, liquidations, options and ETF flows. Those are the capabilities no
// existing provider carries. SurfAI's price/candle endpoints duplicate CoinGecko
// Pro, BirdEye and GeckoTerminal and are deliberately not wrapped, and its Chat
// API duplicates OpenRouter.
//
// Every response carries a `meta` block reporting what the call actually cost.
// It is the only place that number appears — there is no credit response header
// — and `meta.cached` flags a re-call inside SurfAI's 3-minute free window,
// which the egress meter cannot see and therefore bills anyway. Both fields are
// surfaced so the caller can reconcile.
// ---------------------------------------------------------------------------

export const SurfMetaSchema = z
  .object({
    credits_used: z.number().nullish(),
    cached: z.boolean().nullish()
  })
  .passthrough()
export type SurfMeta = z.infer<typeof SurfMetaSchema>

// SurfAI's error envelope. Distinct from a transport failure: a 402 here means
// the request egressed WITHOUT our key and fell through to the anonymous free
// tier, which is the signature of a failed placeholder injection rather than a
// spent balance.
export const SurfErrorSchema = z
  .object({
    error: z
      .object({
        code: z.string().nullish(),
        message: z.string().nullish()
      })
      .passthrough()
      .nullish()
  })
  .passthrough()
export type SurfError = z.infer<typeof SurfErrorSchema>

const SurfResponseBase = {
  data: z.unknown(),
  meta: SurfMetaSchema.nullish()
}

export const SurfFundingHistorySchema = z.object(SurfResponseBase).passthrough()
export type SurfFundingHistory = z.infer<typeof SurfFundingHistorySchema>

export const SurfLongShortRatioSchema = z.object(SurfResponseBase).passthrough()
export type SurfLongShortRatio = z.infer<typeof SurfLongShortRatioSchema>

export const SurfLiquidationSchema = z.object(SurfResponseBase).passthrough()
export type SurfLiquidation = z.infer<typeof SurfLiquidationSchema>

export const SurfOptionsSchema = z.object(SurfResponseBase).passthrough()
export type SurfOptions = z.infer<typeof SurfOptionsSchema>

export const SurfEtfFlowSchema = z.object(SurfResponseBase).passthrough()
export type SurfEtfFlow = z.infer<typeof SurfEtfFlowSchema>

// ---------------------------------------------------------------------------
// `tribes-cli surf` command options.
//
// Exchange casing is NOT uniform across the API and the mismatch is silent: the
// /exchange/* endpoints take lowercase ids ('binance'), the /market/liquidation/*
// endpoints take title case ('Binance'). Each command's enum reflects its own
// endpoint so a wrong-cased value fails here rather than upstream.
// ---------------------------------------------------------------------------

const OutOptionSchema = z.string().nullish()

const LowercaseExchangeSchema = z.enum([
  'binance',
  'okx',
  'bybit',
  'bitget',
  'gate',
  'htx',
  'mexc',
  'bitfinex',
  'bitmex',
  'hyperliquid'
])

const TitlecaseExchangeSchema = z.enum([
  'Binance',
  'OKX',
  'Bybit',
  'Bitget',
  'Hyperliquid',
  'Gate',
  'HTX',
  'Bitmex',
  'Bitfinex',
  'CoinEx'
])

export const SurfFundingCommandOptionsSchema = z.object({
  // A trading pair, not a bare ticker: 'BTC/USDT', or 'BTC/USDC:USDC' for
  // Hyperliquid's USDC-settled perps.
  pair: z.string().min(1),
  exchange: LowercaseExchangeSchema.nullish(),
  from: z.string().min(1).nullish(),
  limit: z.number().int().min(1).max(1000).nullish(),
  out: OutOptionSchema
})
export type SurfFundingCommandOptions = z.infer<typeof SurfFundingCommandOptionsSchema>

export const SurfLongShortCommandOptionsSchema = z.object({
  pair: z.string().min(1),
  interval: z.enum(['1h', '4h', '1d']).nullish(),
  // Binance retains only the last 30 days here, and Hyperliquid is not offered
  // on this endpoint at all — hence the narrower enum.
  exchange: z.enum(['binance', 'okx', 'bybit', 'bitget']).nullish(),
  from: z.string().min(1).nullish(),
  limit: z.number().int().min(1).max(1000).nullish(),
  out: OutOptionSchema
})
export type SurfLongShortCommandOptions = z.infer<typeof SurfLongShortCommandOptionsSchema>

export const SurfLiquidationChartCommandOptionsSchema = z.object({
  symbol: z.string().min(1),
  interval: z
    .enum(['1m', '3m', '5m', '15m', '30m', '1h', '4h', '6h', '8h', '12h', '1d', '1w'])
    .nullish(),
  exchange: TitlecaseExchangeSchema.nullish(),
  limit: z.number().int().min(1).max(1000).nullish(),
  from: z.string().min(1).nullish(),
  to: z.string().min(1).nullish(),
  out: OutOptionSchema
})
export type SurfLiquidationChartCommandOptions = z.infer<
  typeof SurfLiquidationChartCommandOptionsSchema
>

export const SurfLiquidationVenuesCommandOptionsSchema = z.object({
  symbol: z.string().min(1).nullish(),
  timeRange: z.enum(['1h', '4h', '12h', '24h']).nullish(),
  sortBy: z.enum(['liquidation_usd', 'long_liquidation_usd', 'short_liquidation_usd']).nullish(),
  order: z.enum(['asc', 'desc']).nullish(),
  out: OutOptionSchema
})
export type SurfLiquidationVenuesCommandOptions = z.infer<
  typeof SurfLiquidationVenuesCommandOptionsSchema
>

export const SurfLiquidationOrdersCommandOptionsSchema = z.object({
  symbol: z.string().min(1).nullish(),
  exchange: TitlecaseExchangeSchema.nullish(),
  minAmount: z.number().min(0).nullish(),
  side: z.enum(['long', 'short']).nullish(),
  sortBy: z.enum(['usd_value', 'timestamp', 'price']).nullish(),
  order: z.enum(['asc', 'desc']).nullish(),
  limit: z.number().int().min(1).max(1000).nullish(),
  out: OutOptionSchema
})
export type SurfLiquidationOrdersCommandOptions = z.infer<
  typeof SurfLiquidationOrdersCommandOptionsSchema
>

export const SurfOptionsCommandOptionsSchema = z.object({
  symbol: z.string().min(1),
  sortBy: z.enum(['open_interest', 'volume_24h']).nullish(),
  order: z.enum(['asc', 'desc']).nullish(),
  out: OutOptionSchema
})
export type SurfOptionsCommandOptions = z.infer<typeof SurfOptionsCommandOptionsSchema>

export const SurfEtfCommandOptionsSchema = z.object({
  symbol: z.enum(['BTC', 'ETH', 'XRP', 'SOL', 'HYPE']),
  sortBy: z.enum(['flow_usd', 'timestamp']).nullish(),
  order: z.enum(['asc', 'desc']).nullish(),
  from: z.string().min(1).nullish(),
  to: z.string().min(1).nullish(),
  out: OutOptionSchema
})
export type SurfEtfCommandOptions = z.infer<typeof SurfEtfCommandOptionsSchema>
