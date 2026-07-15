import { z } from 'zod'

export const MacroSeriesIdSchema = z.enum([
  'DTWEXBGS',
  'DGS10',
  'DGS2',
  'T10Y2Y',
  'VIXCLS',
  'DFF',
  'CPIAUCSL',
  'UNRATE',
  'GOLDAMGBD228NLBM',
  'DCOILBRENTEU'
])
export type MacroSeriesId = z.infer<typeof MacroSeriesIdSchema>

export const MacroSeriesSlotSchema = z.enum([
  'dxy',
  'yields_us10y',
  'yields_us2y',
  'yields_curve_2s10s',
  'vix',
  'fed_funds',
  'cpi',
  'unemployment',
  'gold',
  'brent'
])
type MacroSeriesSlot = z.infer<typeof MacroSeriesSlotSchema>

export interface MacroSeriesDefinition {
  readonly seriesId: MacroSeriesId
  readonly slot: MacroSeriesSlot
  readonly optional: boolean
  readonly limit: number
}

const FredObservationSchema = z
  .object({
    value: z.union([z.string(), z.number()]).nullish(),
    date: z.string().nullish()
  })
  .passthrough()
export type FredObservation = z.infer<typeof FredObservationSchema>

export const FredSeriesObservationsResponseSchema = z
  .object({
    observations: FredObservationSchema.array().nullish()
  })
  .passthrough()
export type FredSeriesObservationsResponse = z.infer<typeof FredSeriesObservationsResponseSchema>

export const FredNormalizedObservationSchema = z.object({
  value: z.number(),
  date: z.string().min(1)
})
export type FredNormalizedObservation = z.infer<typeof FredNormalizedObservationSchema>

const MacrosSeriesErrorSchema = z.object({
  series: z.string().min(1),
  error: z.string().min(1)
})

const MacrosSeriesPointSchema = z.object({
  value: z.number().nullish(),
  as_of: z.string().nullish()
})
export type MacrosSeriesPoint = z.infer<typeof MacrosSeriesPointSchema>

const MacrosSeriesPointWithChangeSchema = z.object({
  value: z.number().nullish(),
  change_pct: z.number().nullish(),
  as_of: z.string().nullish()
})
export type MacrosSeriesPointWithChange = z.infer<typeof MacrosSeriesPointWithChangeSchema>

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
