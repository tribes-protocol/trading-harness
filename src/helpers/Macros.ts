import type {
  FredNormalizedObservation,
  FredObservation,
  FredSeriesObservationsResponse,
  MacroSeriesId
} from '@/types/Macros'
import { FredSeriesObservationsResponseSchema } from '@/types/Macros'
import { isNullish } from '@/utils/Lang'

const FRED_BASE_URL = 'https://api.stlouisfed.org'
const FRED_USER_AGENT = 'tribes-terminal-api/1.0'

interface FetchFredSeriesObservationsParams {
  readonly seriesId: MacroSeriesId
  readonly apiKey: string
  readonly limit: number
}

export async function fetchFredSeriesObservations(
  params: FetchFredSeriesObservationsParams
): Promise<FredNormalizedObservation[]> {
  const url = new URL('/fred/series/observations', FRED_BASE_URL)
  url.searchParams.set('series_id', params.seriesId)
  url.searchParams.set('api_key', params.apiKey)
  url.searchParams.set('file_type', 'json')
  url.searchParams.set('sort_order', 'desc')
  url.searchParams.set('limit', String(params.limit))

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'User-Agent': FRED_USER_AGENT
    }
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(
      `FRED observations request failed: ${response.status} ${response.statusText} ${body}`
    )
  }

  const data: unknown = await response.json()
  const parsed: FredSeriesObservationsResponse = FredSeriesObservationsResponseSchema.parse(data)
  return normalizeObservations(parsed.observations ?? [])
}

function normalizeObservations(observations: FredObservation[]): FredNormalizedObservation[] {
  const normalized: FredNormalizedObservation[] = []
  for (const observation of observations) {
    const parsed = normalizeObservation(observation)
    if (!isNullish(parsed)) {
      normalized.push(parsed)
    }
  }
  return normalized
}

function normalizeObservation(observation: FredObservation): FredNormalizedObservation | null {
  if (isNullish(observation.date) || observation.date.length === 0) {
    return null
  }
  if (isNullish(observation.value) || observation.value === '.') {
    return null
  }
  const parsedValue =
    typeof observation.value === 'number' ? observation.value : Number(observation.value)
  if (!Number.isFinite(parsedValue)) {
    return null
  }
  return {
    value: parsedValue,
    date: observation.date
  }
}
