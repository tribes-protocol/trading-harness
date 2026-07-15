import { fetchFredSeriesObservations } from '@/helpers/Macros'
import type {
  FredNormalizedObservation,
  MacroSeriesDefinition,
  MacrosMarketSnapshot
} from '@/types/Macros'
import { MacrosMarketSnapshotSchema } from '@/types/Macros'
import { isNullish } from '@/utils/Lang'
import {
  computeYoyPercent,
  createEmptySnapshot,
  toSeriesPoint,
  toSeriesPointWithChange
} from '@/utils/Macros'

type MacrosServiceParams = {
  readonly fredApiKey: string
}

interface FetchSeriesResult {
  readonly definition: MacroSeriesDefinition
  readonly observations: FredNormalizedObservation[] | null
  readonly error: string | null
}

const SERIES_DEFINITIONS: MacroSeriesDefinition[] = [
  { seriesId: 'DTWEXBGS', slot: 'dxy', optional: false, limit: 4 },
  { seriesId: 'DGS10', slot: 'yields_us10y', optional: false, limit: 4 },
  { seriesId: 'DGS2', slot: 'yields_us2y', optional: false, limit: 4 },
  { seriesId: 'T10Y2Y', slot: 'yields_curve_2s10s', optional: false, limit: 4 },
  { seriesId: 'VIXCLS', slot: 'vix', optional: false, limit: 4 },
  { seriesId: 'DFF', slot: 'fed_funds', optional: false, limit: 4 },
  { seriesId: 'CPIAUCSL', slot: 'cpi', optional: false, limit: 14 },
  { seriesId: 'UNRATE', slot: 'unemployment', optional: false, limit: 4 },
  { seriesId: 'GOLDAMGBD228NLBM', slot: 'gold', optional: true, limit: 4 },
  { seriesId: 'DCOILBRENTEU', slot: 'brent', optional: false, limit: 4 }
]

export class MacrosService {
  private readonly fredApiKey: string

  constructor(params: MacrosServiceParams) {
    this.fredApiKey = params.fredApiKey
  }

  async getMarketSnapshot(): Promise<MacrosMarketSnapshot> {
    let snapshot = createEmptySnapshot()

    const fetchedSeries = await Promise.all(
      SERIES_DEFINITIONS.map((definition) => this.fetchSeries(definition))
    )
    for (const seriesResult of fetchedSeries) {
      snapshot = applySeriesResult(snapshot, seriesResult)
    }

    snapshot = deriveCurveSpread(snapshot)
    return MacrosMarketSnapshotSchema.parse(snapshot)
  }

  private async fetchSeries(definition: MacroSeriesDefinition): Promise<FetchSeriesResult> {
    try {
      const observations = await fetchFredSeriesObservations({
        seriesId: definition.seriesId,
        apiKey: this.fredApiKey,
        limit: definition.limit
      })
      if (observations.length === 0) {
        return { definition, observations: null, error: 'no observations' }
      }
      return { definition, observations, error: null }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { definition, observations: null, error: errorMessage }
    }
  }
}

function applySeriesResult(
  snapshot: MacrosMarketSnapshot,
  seriesResult: FetchSeriesResult
): MacrosMarketSnapshot {
  const observations = seriesResult.observations
  if (isNullish(observations)) {
    if (!seriesResult.definition.optional && !isNullish(seriesResult.error)) {
      return {
        ...snapshot,
        errors: [
          ...snapshot.errors,
          { series: seriesResult.definition.seriesId, error: seriesResult.error }
        ]
      }
    }
    return snapshot
  }

  const first = observations[0]
  if (isNullish(first)) {
    return snapshot
  }

  switch (seriesResult.definition.slot) {
    case 'dxy':
      return { ...snapshot, dxy: toSeriesPointWithChange(observations) }
    case 'vix':
      return { ...snapshot, vix: toSeriesPointWithChange(observations) }
    case 'fed_funds':
      return { ...snapshot, fed_funds: toSeriesPoint(observations) }
    case 'unemployment':
      return { ...snapshot, unemployment: toSeriesPoint(observations) }
    case 'gold':
      return { ...snapshot, gold: toSeriesPointWithChange(observations) }
    case 'brent':
      return { ...snapshot, brent: toSeriesPointWithChange(observations) }
    case 'yields_us10y':
      return { ...snapshot, yields: { ...snapshot.yields, us10y: first.value, as_of: first.date } }
    case 'yields_us2y':
      return {
        ...snapshot,
        yields: {
          ...snapshot.yields,
          us2y: first.value,
          as_of: isNullish(snapshot.yields.as_of) ? first.date : snapshot.yields.as_of
        }
      }
    case 'yields_curve_2s10s':
      return { ...snapshot, yields: { ...snapshot.yields, curve_2s10s: first.value } }
    case 'cpi':
      return {
        ...snapshot,
        cpi: {
          ...snapshot.cpi,
          value: first.value,
          as_of: first.date,
          yoy_pct: computeYoyPercent(observations)
        }
      }
  }
}

function deriveCurveSpread(snapshot: MacrosMarketSnapshot): MacrosMarketSnapshot {
  if (
    isNullish(snapshot.yields.curve_2s10s) &&
    !isNullish(snapshot.yields.us10y) &&
    !isNullish(snapshot.yields.us2y)
  ) {
    return {
      ...snapshot,
      yields: { ...snapshot.yields, curve_2s10s: snapshot.yields.us10y - snapshot.yields.us2y }
    }
  }
  return snapshot
}
