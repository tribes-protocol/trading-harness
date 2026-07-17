/**
 * Raw FRED API v1 response shapes, derived strictly from the documented
 * response fields in docs/research/providers/fred.json (official docs:
 * https://fred.stlouisfed.org/docs/api/fred/).
 *
 * Notes from the docs:
 *  - observation values are numeric STRINGS; missing observations are ".".
 *  - every payload echoes the real-time window (realtime_start/realtime_end)
 *    it was resolved against (ALFRED vintage semantics).
 */

/** Documented JSON error envelope: { error_code, error_message }. */
export interface FredErrorEnvelope {
  error_code: number;
  error_message: string;
}

/** One entry of `seriess[]` (fred/series, fred/series/search). */
export interface FredSeriesMeta {
  id: string;
  realtime_start: string;
  realtime_end: string;
  title: string;
  observation_start: string;
  observation_end: string;
  frequency: string;
  frequency_short: string;
  units: string;
  units_short: string;
  seasonal_adjustment: string;
  seasonal_adjustment_short: string;
  /** e.g. "2013-08-14 08:31:05-05" (space-separated, hour-only offset). */
  last_updated: string;
  popularity: number;
  notes?: string;
}

/** GET /fred/series response. */
export interface FredSeriesResponse {
  realtime_start: string;
  realtime_end: string;
  seriess: FredSeriesMeta[];
}

/** One entry of `observations[]` (fred/series/observations). */
export interface FredObservation {
  realtime_start: string;
  realtime_end: string;
  date: string;
  /** Numeric string; "." means the observation is missing. */
  value: string;
}

/** GET /fred/series/observations response. */
export interface FredObservationsResponse {
  realtime_start: string;
  realtime_end: string;
  observation_start: string;
  observation_end: string;
  units: string;
  output_type: number;
  file_type: string;
  order_by: string;
  sort_order: string;
  count: number;
  offset: number;
  limit: number;
  observations: FredObservation[];
}

/** GET /fred/series/search response. */
export interface FredSeriesSearchResponse {
  realtime_start: string;
  realtime_end: string;
  order_by: string;
  sort_order: string;
  count: number;
  offset: number;
  limit: number;
  seriess: FredSeriesMeta[];
}
