import { z } from 'zod'

import { AssetIdentityKindSchema } from '@/types/AssetIdentity'
import { BirdeyeChainSchema, OhlcvTimeframeSchema } from '@/types/Candles'
import { isNullish } from '@/utils/Lang'

export const IndicatorNameSchema = z.enum([
  'rsi',
  'macd',
  'sma',
  'ema',
  'bbands',
  'adx',
  'atr',
  'obv',
  'roc',
  'mom'
])
export type IndicatorName = z.infer<typeof IndicatorNameSchema>

export const IndicatorSourceSchema = z.enum([
  'close',
  'open',
  'high',
  'low',
  'hl2',
  'hlc3',
  'ohlc4'
])
export type IndicatorSource = z.infer<typeof IndicatorSourceSchema>

// Fetch-and-compute request. Candle fields mirror `candles`; `days` defaults
// higher so the longest lookback (SMA200) has data.
export const IndicatorsRequestSchema = z
  .object({
    kind: AssetIdentityKindSchema,
    asset: z.string().trim().min(1),
    chain: BirdeyeChainSchema.nullish(),
    timeframe: OhlcvTimeframeSchema.default('1D'),
    days: z.coerce.number().int().positive().max(3650).default(365),
    source: IndicatorSourceSchema.default('close'),
    indicators: z.string().nullish(),
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
export type IndicatorsRequest = z.infer<typeof IndicatorsRequestSchema>

export type MacdValue = {
  readonly macd: number
  readonly signal: number
  readonly histogram: number
}
export type BollingerValue = {
  readonly basis: number
  readonly upper: number
  readonly lower: number
}
export type AdxValue = { readonly adx: number; readonly plusDi: number; readonly minusDi: number }
export type AtrValue = { readonly value: number; readonly pct: number }

// Only computed indicators are present (fields omitted when data is insufficient).
export type IndicatorValues = {
  rsi14?: number
  rsiSignal?: 'overbought' | 'oversold' | 'neutral'
  macd?: MacdValue
  sma20?: number
  sma50?: number
  sma200?: number
  ema12?: number
  ema26?: number
  bbands?: BollingerValue
  adx14?: AdxValue
  atr14?: AtrValue
  obv?: number
  roc10?: number
  mom10?: number
}

export type IndicatorsResult = {
  readonly asset: string
  readonly kind: string
  readonly timeframe: string
  readonly source: IndicatorSource
  readonly candles: number
  readonly as_of: number | null
  readonly price: number | null
  readonly indicators: IndicatorValues
}
