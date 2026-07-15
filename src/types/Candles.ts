import { z } from 'zod'

import { AssetIdentityKindSchema } from '@/types/AssetIdentity'
import { isNullish } from '@/utils/Lang'

// Canonical timeframes (BirdEye serves these natively; Marketstack via a plan
// below; Hyperliquid via an interval map — Hyperliquid has no 6H).
export const OhlcvTimeframeSchema = z.enum([
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
])
export type OhlcvTimeframe = z.infer<typeof OhlcvTimeframeSchema>

// BirdEye `x-chain` names accepted for `--chain` on a token identity.
export const BirdeyeChainSchema = z.enum([
  'ethereum',
  'solana',
  'base',
  'bsc',
  'arbitrum',
  'optimism',
  'polygon'
])
export type BirdeyeChain = z.infer<typeof BirdeyeChainSchema>

// Hyperliquid candleSnapshot intervals (SDK picklist; note: no 6h).
export type HyperliquidInterval =
  | '1m'
  | '3m'
  | '5m'
  | '15m'
  | '30m'
  | '1h'
  | '2h'
  | '4h'
  | '8h'
  | '12h'
  | '1d'
  | '3d'
  | '1w'
  | '1M'

// The single output shape every source is normalized into.
export const UnifiedCandleSchema = z.object({
  timestamp: z.number(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number()
})
export type UnifiedCandle = z.infer<typeof UnifiedCandleSchema>

// Roll-up config for timeframes a source does not serve natively.
export type CandleAggregation =
  | { readonly kind: 'fixed'; readonly size: number }
  | { readonly kind: 'calendar'; readonly boundary: 'week' | 'month' }

export const MarketStackIntervalSchema = z.enum([
  '1min',
  '5min',
  '15min',
  '30min',
  '1hour',
  '6hour',
  '12hour',
  '24hour'
])
export type MarketStackInterval = z.infer<typeof MarketStackIntervalSchema>

export type MarketStackPlan =
  | { readonly sourceKind: 'eod'; readonly aggregation?: CandleAggregation }
  | {
      readonly sourceKind: 'intraday'
      readonly interval: MarketStackInterval
      readonly aggregation?: CandleAggregation
    }

// CLI options — same `kind` vocabulary as `news` / AssetIdentity (token|perp|stock).
// commander passes strings; coerce + default here.
export const OhlcvRequestSchema = z
  .object({
    kind: AssetIdentityKindSchema,
    asset: z.string().trim().min(1),
    chain: BirdeyeChainSchema.nullish(),
    timeframe: OhlcvTimeframeSchema.default('1D'),
    days: z.coerce.number().int().positive().max(3650).default(45),
    out: z.string().nullish()
  })
  .superRefine((value, ctx) => {
    if (value.kind === 'token' && isNullish(value.chain)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['chain'],
        message: '--chain is required when --kind token'
      })
    }
  })
export type OhlcvRequest = z.infer<typeof OhlcvRequestSchema>

export type CandlesServiceParams = {
  readonly birdeyeApiKey: string
  readonly marketStackApiKey: string
}

// ─── Loose provider response schemas (nullish + passthrough; normalized in code) ───

const NumberOrStringSchema = z.union([z.number(), z.string()])

const BirdeyeSearchResultSchema = z
  .object({
    symbol: z.string().nullish(),
    address: z.string().nullish(),
    liquidity: z.number().nullish()
  })
  .passthrough()
export type BirdeyeSearchResult = z.infer<typeof BirdeyeSearchResultSchema>

export const BirdeyeSearchResponseSchema = z
  .object({
    data: z
      .object({
        items: z
          .array(z.object({ result: BirdeyeSearchResultSchema.array().nullish() }).passthrough())
          .nullish()
      })
      .nullish()
  })
  .passthrough()
export type BirdeyeSearchResponse = z.infer<typeof BirdeyeSearchResponseSchema>

const BirdeyeCandleItemSchema = z
  .object({
    unixTime: NumberOrStringSchema.nullish(),
    o: NumberOrStringSchema.nullish(),
    h: NumberOrStringSchema.nullish(),
    l: NumberOrStringSchema.nullish(),
    c: NumberOrStringSchema.nullish(),
    v: NumberOrStringSchema.nullish()
  })
  .passthrough()
export type BirdeyeCandleItem = z.infer<typeof BirdeyeCandleItemSchema>

export const BirdeyeOhlcvResponseSchema = z
  .object({
    data: z.object({ items: BirdeyeCandleItemSchema.array().nullish() }).nullish()
  })
  .passthrough()
export type BirdeyeOhlcvResponse = z.infer<typeof BirdeyeOhlcvResponseSchema>

const MarketStackBarSchema = z
  .object({
    date: z.string().nullish(),
    open: NumberOrStringSchema.nullish(),
    high: NumberOrStringSchema.nullish(),
    low: NumberOrStringSchema.nullish(),
    close: NumberOrStringSchema.nullish(),
    volume: NumberOrStringSchema.nullish()
  })
  .passthrough()
export type MarketStackBar = z.infer<typeof MarketStackBarSchema>

export const MarketStackResponseSchema = z
  .object({
    data: MarketStackBarSchema.array().nullish()
  })
  .passthrough()
export type MarketStackResponse = z.infer<typeof MarketStackResponseSchema>
