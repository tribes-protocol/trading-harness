import { z } from 'zod'

import { ChainIdSchema } from '@/types/ChainId'
import { isNullish } from '@/utils/Lang'

// Normalized indicator pack computed by `tribes-cli technicals indicators`
// from any supported candle source. All indicator fields are nullish: a series
// too short for an indicator yields null, never a guess.

const TechnicalsIndicatorsSchema = z.object({
  sma20: z.number().nullish(),
  sma50: z.number().nullish(),
  sma200: z.number().nullish(),
  ema12: z.number().nullish(),
  ema26: z.number().nullish(),
  rsi14: z.number().nullish(),
  macd: z.number().nullish(),
  macd_signal: z.number().nullish(),
  macd_histogram: z.number().nullish(),
  bollinger_upper: z.number().nullish(),
  bollinger_middle: z.number().nullish(),
  bollinger_lower: z.number().nullish(),
  bollinger_percent_b: z.number().nullish(),
  atr14: z.number().nullish(),
  atr14_pct_of_price: z.number().nullish(),
  roc10_pct: z.number().nullish()
})

const TechnicalsReadSchema = z.object({
  // Factual relations, not forecasts: e.g. 'above sma50, above sma200'.
  trend: z.string(),
  // e.g. 'rsi 62 (neutral-strong), macd histogram positive'
  momentum: z.string(),
  // e.g. 'atr 2.1% of price'
  volatility: z.string()
})

export const TechnicalsResultSchema = z.object({
  source: z.literal('technicals'),
  instrument: z.string(),
  candle_source: z.enum(['coingecko', 'marketstack', 'birdeye']),
  interval: z.string(),
  candles_used: z.number().int(),
  first_candle_time: z.string(),
  last_candle_time: z.string(),
  last_close: z.number(),
  indicators: TechnicalsIndicatorsSchema,
  swing_high_20: z.number().nullish(),
  swing_low_20: z.number().nullish(),
  read: TechnicalsReadSchema
})
export type TechnicalsResult = z.infer<typeof TechnicalsResultSchema>

export const TechnicalsCommandOptionsSchema = z
  .object({
    coinId: z.string().trim().min(1).nullish(),
    days: z.enum(['1', '7', '14', '30', '90', '180', '365', 'max']).default('30'),
    vs: z.string().trim().min(1).default('usd'),
    symbol: z.string().trim().min(1).nullish(),
    address: z.string().trim().min(1).nullish(),
    chain: ChainIdSchema.nullish(),
    interval: z.string().trim().min(1).default('1D'),
    limit: z.coerce.number().int().min(30).max(500).default(120),
    out: z.string().nullish()
  })
  .superRefine((value, ctx) => {
    const sources = [
      !isNullish(value.coinId),
      !isNullish(value.symbol),
      !isNullish(value.address)
    ].filter(Boolean).length
    if (sources !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide exactly one source: --coin-id, --symbol, or --address with --chain'
      })
    }
    if (!isNullish(value.address) && isNullish(value.chain)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['chain'],
        message: '--chain is required with --address'
      })
    }
  })
export type TechnicalsCommandOptions = z.infer<typeof TechnicalsCommandOptionsSchema>
