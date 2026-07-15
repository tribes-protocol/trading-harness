import type {
  FredNormalizedObservation,
  MacrosMarketSnapshot,
  MacrosSeriesPoint,
  MacrosSeriesPointWithChange
} from '@/types/Macros'
import { isNullish } from '@/utils/Lang'

interface LatestAndChange {
  readonly value: number | null
  readonly changePct: number | null
  readonly asOf: string | null
}

export function createEmptySnapshot(): MacrosMarketSnapshot {
  return {
    generated_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    source: 'fred',
    dxy: { value: null, change_pct: null, as_of: null },
    yields: { us10y: null, us2y: null, curve_2s10s: null, as_of: null },
    vix: { value: null, change_pct: null, as_of: null },
    fed_funds: { value: null, as_of: null },
    cpi: { value: null, yoy_pct: null, as_of: null },
    unemployment: { value: null, as_of: null },
    gold: { value: null, change_pct: null, as_of: null },
    brent: { value: null, change_pct: null, as_of: null },
    errors: []
  }
}

export function toSeriesPointWithChange(
  observations: FredNormalizedObservation[]
): MacrosSeriesPointWithChange {
  const latestAndChange = computeLatestAndChange(observations)
  return {
    value: latestAndChange.value,
    as_of: latestAndChange.asOf,
    change_pct: latestAndChange.changePct
  }
}

export function toSeriesPoint(observations: FredNormalizedObservation[]): MacrosSeriesPoint {
  const latestAndChange = computeLatestAndChange(observations)
  return {
    value: latestAndChange.value,
    as_of: latestAndChange.asOf
  }
}

export function computeYoyPercent(observations: FredNormalizedObservation[]): number | null {
  const latest = observations[0]
  const prior = observations[11]
  if (isNullish(latest) || isNullish(prior) || prior.value === 0) {
    return null
  }
  return ((latest.value - prior.value) / prior.value) * 100
}

function computeLatestAndChange(observations: FredNormalizedObservation[]): LatestAndChange {
  const latest = observations[0]
  if (isNullish(latest)) {
    return { value: null, changePct: null, asOf: null }
  }
  const prior = observations[1]
  if (isNullish(prior) || prior.value === 0) {
    return { value: latest.value, changePct: null, asOf: latest.date }
  }
  return {
    value: latest.value,
    changePct: ((latest.value - prior.value) / prior.value) * 100,
    asOf: latest.date
  }
}
