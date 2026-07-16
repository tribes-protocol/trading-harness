import { cachedProviderJson } from '@/helpers/ProviderCache'
import { providerFetchJson } from '@/helpers/ProviderHttp'
import type { FredSeries, FredSeriesPoint } from '@/types/Fred'
import { FredObservationsResponseSchema, FredSeriesSchema } from '@/types/Fred'
import type { MacrosMarketSnapshot } from '@/types/Macros'
import { MacrosMarketSnapshotSchema } from '@/types/Macros'
import { isNullish } from '@/utils/Lang'

// Direct FRED (Federal Reserve Economic Data) integration.
// Primary use: arbitrary macro series lookups (`macros series`) beyond the fixed
// proxy snapshot, plus a full snapshot builder used as the fallback when the
// Tribes `/agent/macros/market` proxy is unavailable.
// Auth: api_key query param (docs: fred.stlouisfed.org/docs/api/fred/).
// Limits: 120 requests/minute per key; responses cached 10 minutes.

const FRED_BASE_URL = 'https://api.stlouisfed.org'
const OBSERVATIONS_PATH = '/fred/series/observations'
const SERIES_CACHE_TTL_MS = 10 * 60 * 1000

// The proxy snapshot's series set (documented in skills/macros/SKILL.md); the
// direct fallback mirrors it so both paths produce the same payload shape.
// FRED discontinued its LBMA gold price series (GOLDAMGBD228NLBM) entirely, so
// the direct fallback cannot source gold from FRED at all — it reports the gap
// in `errors` instead of burning a doomed request on every snapshot.
const SNAPSHOT_SERIES = {
  dxy: 'DTWEXBGS',
  us10y: 'DGS10',
  us2y: 'DGS2',
  curve2s10s: 'T10Y2Y',
  vix: 'VIXCLS',
  fedFunds: 'DFF',
  cpi: 'CPIAUCSL',
  unemployment: 'UNRATE',
  brent: 'DCOILBRENTEU'
} as const

const GOLD_SERIES_ID = 'GOLDAMGBD228NLBM'
const GOLD_UNAVAILABLE_ERROR =
  'FRED discontinued its LBMA gold series; gold is unavailable via the direct FRED fallback'

// CPI YoY needs the same month one year back. Monthly series can have gaps
// (e.g. the never-published October 2025 CPI print), so fetch a wider window
// and locate the year-ago month BY DATE, never by index.
const CPI_OBSERVATION_COUNT = 16

// Daily market series often report '.' (missing) for holidays/weekends, so ask
// for a few extra rows to guarantee two real observations for change_pct.
const CHANGE_WINDOW_COUNT = 6

type FredServiceParams = {
  readonly apiKey: string
}

type GetSeriesParams = {
  readonly seriesId: string
  readonly limit: number
}

export class FredService {
  private readonly apiKey: string

  constructor(params: FredServiceParams) {
    this.apiKey = params.apiKey
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0
  }

  private ensureConfigured(): void {
    if (!this.isConfigured()) {
      throw new Error('FRED_API_KEY is not set; direct FRED lookups are disabled')
    }
  }

  // Latest observations for one series, newest first, missing values dropped.
  async getSeries(params: GetSeriesParams): Promise<FredSeries> {
    this.ensureConfigured()
    const seriesId = params.seriesId.toUpperCase()
    const data = await cachedProviderJson({
      cacheKey: `fred:observations:${seriesId}:${params.limit}`,
      ttlMs: SERIES_CACHE_TTL_MS,
      fetchFn: async () => {
        const url = new URL(OBSERVATIONS_PATH, FRED_BASE_URL)
        url.searchParams.set('series_id', seriesId)
        url.searchParams.set('api_key', this.apiKey)
        url.searchParams.set('file_type', 'json')
        url.searchParams.set('sort_order', 'desc')
        url.searchParams.set('limit', String(params.limit))
        return providerFetchJson({
          provider: 'fred',
          url,
          secrets: [this.apiKey]
        })
      }
    })
    const parsed = FredObservationsResponseSchema.parse(data)
    const points: FredSeriesPoint[] = []
    for (const observation of parsed.observations) {
      const value = Number(observation.value)
      if (observation.value !== '.' && Number.isFinite(value)) {
        points.push({ date: observation.date, value })
      }
    }
    return FredSeriesSchema.parse({ source: 'fred-direct', series_id: seriesId, points })
  }

  // Rebuild the proxy's macro market snapshot directly from FRED. Partial
  // outages degrade to nulls plus an `errors` entry, mirroring proxy semantics.
  async getMacrosSnapshotDirect(): Promise<MacrosMarketSnapshot> {
    this.ensureConfigured()
    const errors: { series: string; error: string }[] = []

    const fetchLatest = async (
      seriesId: string,
      limit: number
    ): Promise<FredSeriesPoint[] | null> => {
      try {
        const series = await this.getSeries({ seriesId, limit })
        if (series.points.length === 0) {
          errors.push({ series: seriesId, error: 'no observations returned' })
          return null
        }
        return series.points
      } catch (error: unknown) {
        errors.push({
          series: seriesId,
          error: error instanceof Error ? error.message : 'unknown error'
        })
        return null
      }
    }

    const [dxy, us10y, us2y, curve, vix, fedFunds, cpi, unemployment, brent] = await Promise.all([
      fetchLatest(SNAPSHOT_SERIES.dxy, CHANGE_WINDOW_COUNT),
      fetchLatest(SNAPSHOT_SERIES.us10y, CHANGE_WINDOW_COUNT),
      fetchLatest(SNAPSHOT_SERIES.us2y, CHANGE_WINDOW_COUNT),
      fetchLatest(SNAPSHOT_SERIES.curve2s10s, CHANGE_WINDOW_COUNT),
      fetchLatest(SNAPSHOT_SERIES.vix, CHANGE_WINDOW_COUNT),
      fetchLatest(SNAPSHOT_SERIES.fedFunds, CHANGE_WINDOW_COUNT),
      fetchLatest(SNAPSHOT_SERIES.cpi, CPI_OBSERVATION_COUNT),
      fetchLatest(SNAPSHOT_SERIES.unemployment, CHANGE_WINDOW_COUNT),
      fetchLatest(SNAPSHOT_SERIES.brent, CHANGE_WINDOW_COUNT)
    ])
    errors.push({ series: GOLD_SERIES_ID, error: GOLD_UNAVAILABLE_ERROR })

    return MacrosMarketSnapshotSchema.parse({
      generated_at: new Date().toISOString(),
      source: 'fred',
      dxy: toPointWithChange(dxy),
      yields: {
        us10y: latestValue(us10y),
        us2y: latestValue(us2y),
        curve_2s10s: latestValue(curve),
        as_of: latestDate(us10y) ?? latestDate(us2y)
      },
      vix: toPointWithChange(vix),
      fed_funds: { value: latestValue(fedFunds), as_of: latestDate(fedFunds) },
      cpi: toCpiSnapshot(cpi),
      unemployment: { value: latestValue(unemployment), as_of: latestDate(unemployment) },
      gold: { value: null, change_pct: null, as_of: null },
      brent: toPointWithChange(brent),
      errors
    })
  }
}

function latestValue(points: FredSeriesPoint[] | null): number | null {
  return points?.[0]?.value ?? null
}

function latestDate(points: FredSeriesPoint[] | null): string | null {
  return points?.[0]?.date ?? null
}

function toPointWithChange(points: FredSeriesPoint[] | null): {
  value: number | null
  change_pct: number | null
  as_of: string | null
} {
  const latest = points?.[0]
  const previous = points?.[1]
  if (isNullish(latest)) {
    return { value: null, change_pct: null, as_of: null }
  }
  const changePct =
    !isNullish(previous) && previous.value !== 0
      ? ((latest.value - previous.value) / previous.value) * 100
      : null
  return {
    value: latest.value,
    change_pct: isNullish(changePct) ? null : roundTo(changePct, 2),
    as_of: latest.date
  }
}

function toCpiSnapshot(points: FredSeriesPoint[] | null): {
  value: number | null
  yoy_pct: number | null
  as_of: string | null
} {
  const latest = points?.[0]
  if (isNullish(latest)) {
    return { value: null, yoy_pct: null, as_of: null }
  }
  const yearAgoDate = shiftYearMonth(latest.date, -12)
  const yearAgo = points?.find((point) => point.date.startsWith(yearAgoDate))
  const yoyPct =
    !isNullish(yearAgo) && yearAgo.value !== 0
      ? ((latest.value - yearAgo.value) / yearAgo.value) * 100
      : null
  return {
    value: latest.value,
    yoy_pct: isNullish(yoyPct) ? null : roundTo(yoyPct, 2),
    as_of: latest.date
  }
}

// '2026-06-01' shifted by -12 months → '2025-06' (yyyy-mm prefix for matching).
function shiftYearMonth(date: string, deltaMonths: number): string {
  const year = Number(date.slice(0, 4))
  const month = Number(date.slice(5, 7))
  const total = year * 12 + (month - 1) + deltaMonths
  const shiftedYear = Math.floor(total / 12)
  const shiftedMonth = (total % 12) + 1
  return `${shiftedYear}-${String(shiftedMonth).padStart(2, '0')}`
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}
