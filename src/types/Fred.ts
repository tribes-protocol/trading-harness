import { z } from 'zod'

// FRED (Federal Reserve Economic Data) direct-API types.
// Raw API: observations arrive as strings, with '.' standing for a missing value.

const FredRawObservationSchema = z.object({
  date: z.string().min(1),
  value: z.string()
})

export const FredObservationsResponseSchema = z.object({
  observations: FredRawObservationSchema.array()
})
export type FredObservationsResponse = z.infer<typeof FredObservationsResponseSchema>

// Normalized internal shape: numeric values, missing observations dropped.
const FredSeriesPointSchema = z.object({
  date: z.string().min(1),
  value: z.number()
})
export type FredSeriesPoint = z.infer<typeof FredSeriesPointSchema>

export const FredSeriesSchema = z.object({
  source: z.literal('fred-direct'),
  series_id: z.string().min(1),
  points: FredSeriesPointSchema.array()
})
export type FredSeries = z.infer<typeof FredSeriesSchema>

export const FredSeriesCommandOptionsSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .regex(/^[A-Za-z0-9_]+$/, 'FRED series ids are alphanumeric, e.g. DGS10'),
  limit: z.coerce.number().int().min(1).max(120).default(12),
  out: z.string().nullish()
})
export type FredSeriesCommandOptions = z.infer<typeof FredSeriesCommandOptionsSchema>
