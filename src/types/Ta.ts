import { z } from 'zod'

// ---------------------------------------------------------------------------
// Shared candle contract: the JSON written via --out by token-data ohlcv,
// coin ohlc, onchain pool-ohlcv, and stocks candles. `t` is epoch ms.
// ---------------------------------------------------------------------------

export const TaCandleSchema = z.object({
  t: z.number(),
  o: z.number(),
  h: z.number(),
  l: z.number(),
  c: z.number(),
  v: z.number().nullish()
})
export type TaCandle = z.infer<typeof TaCandleSchema>

export const TaCandlesFileSchema = z.object({
  source: z.string(),
  candles: z.array(TaCandleSchema)
})
export type TaCandlesFile = z.infer<typeof TaCandlesFileSchema>

export const TaIndicatorNameSchema = z.enum([
  'sma',
  'ema',
  'rsi',
  'macd',
  'bb',
  'atr',
  'vwap',
  'stoch'
])
export type TaIndicatorName = z.infer<typeof TaIndicatorNameSchema>

export const TaTrendSchema = z.enum(['up', 'down', 'flat'])
export type TaTrend = z.infer<typeof TaTrendSchema>

export const TaStrategySchema = z.enum(['ma-cross', 'rsi-revert'])
export type TaStrategy = z.infer<typeof TaStrategySchema>

// ---------------------------------------------------------------------------
// Agent-facing output shapes printed by `tribes-cli ta`.
// ---------------------------------------------------------------------------

const TaValueSeriesSchema = z.object({
  length: z.number(),
  latest: z.number().nullish(),
  previous: z.number().nullish(),
  series: z.array(z.number().nullish())
})

const TaVwapSeriesSchema = z.object({
  latest: z.number().nullish(),
  previous: z.number().nullish(),
  series: z.array(z.number().nullish())
})

const TaMacdPointSchema = z.object({
  macd: z.number().nullish(),
  signal: z.number().nullish(),
  hist: z.number().nullish()
})

const TaMacdSeriesSchema = z.object({
  latest: TaMacdPointSchema.nullish(),
  previous: TaMacdPointSchema.nullish(),
  series: z.array(TaMacdPointSchema)
})

const TaBbPointSchema = z.object({
  mid: z.number().nullish(),
  upper: z.number().nullish(),
  lower: z.number().nullish()
})

const TaBbSeriesSchema = z.object({
  length: z.number(),
  latest: TaBbPointSchema.nullish(),
  previous: TaBbPointSchema.nullish(),
  series: z.array(TaBbPointSchema)
})

const TaStochPointSchema = z.object({
  k: z.number().nullish(),
  d: z.number().nullish()
})

const TaStochSeriesSchema = z.object({
  latest: TaStochPointSchema.nullish(),
  previous: TaStochPointSchema.nullish(),
  series: z.array(TaStochPointSchema)
})

const TaIndicatorMapSchema = z.object({
  sma: TaValueSeriesSchema.nullish(),
  ema: TaValueSeriesSchema.nullish(),
  rsi: TaValueSeriesSchema.nullish(),
  macd: TaMacdSeriesSchema.nullish(),
  bb: TaBbSeriesSchema.nullish(),
  atr: TaValueSeriesSchema.nullish(),
  vwap: TaVwapSeriesSchema.nullish(),
  stoch: TaStochSeriesSchema.nullish()
})
export type TaIndicatorMap = z.infer<typeof TaIndicatorMapSchema>

export const TaIndicatorsSchema = z.object({
  source: z.string(),
  candles: z.number(),
  last_close: z.number(),
  trend: TaTrendSchema,
  indicators: TaIndicatorMapSchema
})
export type TaIndicators = z.infer<typeof TaIndicatorsSchema>

const TaLevelRowSchema = z.object({
  price: z.number(),
  touches: z.number()
})

export const TaLevelsSchema = z.object({
  source: z.string(),
  candles: z.number(),
  last_close: z.number(),
  support: z.array(TaLevelRowSchema),
  resistance: z.array(TaLevelRowSchema),
  high_52: z.number(),
  low_52: z.number()
})
export type TaLevels = z.infer<typeof TaLevelsSchema>

export const TaBacktestSchema = z.object({
  source: z.string(),
  strategy: TaStrategySchema,
  candles: z.number(),
  trades: z.number(),
  win_rate_pct: z.number().nullish(),
  total_return_pct: z.number(),
  buy_hold_return_pct: z.number(),
  max_drawdown_pct: z.number()
})
export type TaBacktest = z.infer<typeof TaBacktestSchema>

// ---------------------------------------------------------------------------
// `tribes-cli ta` command options.
// ---------------------------------------------------------------------------

export const TaIndicatorsCommandOptionsSchema = z.object({
  candlesFile: z.string().min(1),
  set: z.string().nullish(),
  length: z.number().int().min(2).max(500).nullish(),
  out: z.string().nullish()
})
export type TaIndicatorsCommandOptions = z.infer<typeof TaIndicatorsCommandOptionsSchema>

export const TaLevelsCommandOptionsSchema = z.object({
  candlesFile: z.string().min(1),
  out: z.string().nullish()
})
export type TaLevelsCommandOptions = z.infer<typeof TaLevelsCommandOptionsSchema>

export const TaBacktestCommandOptionsSchema = z.object({
  candlesFile: z.string().min(1),
  strategy: TaStrategySchema,
  fast: z.number().int().min(2).max(500).nullish(),
  slow: z.number().int().min(2).max(500).nullish(),
  rsiLow: z.number().min(1).max(99).nullish(),
  rsiHigh: z.number().min(1).max(99).nullish(),
  out: z.string().nullish()
})
export type TaBacktestCommandOptions = z.infer<typeof TaBacktestCommandOptionsSchema>
