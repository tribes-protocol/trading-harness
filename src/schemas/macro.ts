import { z } from 'zod';
import { FrequencySchema, IsoDate, IsoTimestamp, SourcedSchema } from './common.js';

/**
 * Macroeconomic time series. Macro data is revised: observations carry
 * optional real-time (vintage) windows so point-in-time analysis never
 * silently mixes vintages with latest values.
 */

export const MacroSeriesInfoSchema = z.object({
  /** Provider-native series id, e.g. FRED "CPIAUCSL". */
  id: z.string().min(1),
  title: z.string(),
  units: z.string().optional(),
  frequency: FrequencySchema.optional(),
  /** Provider's own frequency label, preserved verbatim. */
  frequencyRaw: z.string().optional(),
  seasonalAdjustment: z.string().optional(),
  lastUpdated: IsoTimestamp.optional(),
  notes: z.string().optional(),
});
export type MacroSeriesInfo = z.infer<typeof MacroSeriesInfoSchema>;

export const MacroObservationSchema = z.object({
  date: IsoDate,
  /** null = provider reported a missing value ('.'), preserved explicitly. */
  value: z.number().finite().nullable(),
  /** Vintage window when requested point-in-time (ALFRED-style). */
  realtimeStart: IsoDate.optional(),
  realtimeEnd: IsoDate.optional(),
});
export type MacroObservation = z.infer<typeof MacroObservationSchema>;

export const MacroVintageSchema = z.enum(['latest', 'point_in_time']);

export const MacroSeriesSchema = SourcedSchema.extend({
  info: MacroSeriesInfoSchema,
  vintage: MacroVintageSchema.default('latest'),
  observations: z.array(MacroObservationSchema),
});
export type MacroSeries = z.infer<typeof MacroSeriesSchema>;
