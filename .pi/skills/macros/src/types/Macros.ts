import { z } from 'zod'

const MacrosSeriesErrorSchema = z.object({
  series: z.string().min(1),
  error: z.string().min(1)
})

const MacrosSeriesPointSchema = z.object({
  value: z.number().nullish(),
  as_of: z.string().nullish()
})

const MacrosSeriesPointWithChangeSchema = z.object({
  value: z.number().nullish(),
  change_pct: z.number().nullish(),
  as_of: z.string().nullish()
})

const MacrosYieldsSnapshotSchema = z.object({
  us10y: z.number().nullish(),
  us2y: z.number().nullish(),
  curve_2s10s: z.number().nullish(),
  as_of: z.string().nullish()
})

const MacrosCpiSnapshotSchema = z.object({
  value: z.number().nullish(),
  yoy_pct: z.number().nullish(),
  as_of: z.string().nullish()
})

export const MacrosMarketSnapshotSchema = z.object({
  generated_at: z.string().min(1),
  source: z.literal('fred'),
  dxy: MacrosSeriesPointWithChangeSchema,
  yields: MacrosYieldsSnapshotSchema,
  vix: MacrosSeriesPointWithChangeSchema,
  fed_funds: MacrosSeriesPointSchema,
  cpi: MacrosCpiSnapshotSchema,
  unemployment: MacrosSeriesPointSchema,
  gold: MacrosSeriesPointWithChangeSchema,
  brent: MacrosSeriesPointWithChangeSchema,
  errors: MacrosSeriesErrorSchema.array()
})
export type MacrosMarketSnapshot = z.infer<typeof MacrosMarketSnapshotSchema>
