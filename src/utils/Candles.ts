import type { TaCandle } from '@/types/Ta'
import { isNullish } from '@/utils/Lang'

// Pure, sync candle rollup. Marketstack serves a fixed set of intervals, so any
// timeframe it does not offer (4h) and any coarser-than-daily timeframe (1w) is
// built here from a finer series rather than fetched.
//
// Every bucket is keyed by a TIME BOUNDARY and each output bar is STAMPED with
// that boundary, not with its first constituent bar's timestamp. That is what
// keeps a holiday-shortened week — or a session with a missing hourly bar — on
// the same grid as a full one. Grouping N consecutive rows instead (the shape
// the retired UnifiedOhlcvHelper used) silently drifts off the grid at the
// first market closure, and equities close every night.

// Roll finer bars up into ISO weeks (Monday 00:00 UTC start).
export function aggregateCandlesToIsoWeeks(candles: TaCandle[]): TaCandle[] {
  return rollUpByBoundary(candles, startOfIsoWeekUtcMs)
}

// Roll finer bars up into fixed-length buckets aligned to the epoch, e.g.
// 4h buckets land on 00:00/04:00/08:00/… UTC regardless of which bars exist.
export function aggregateCandlesToDuration(candles: TaCandle[], bucketMs: number): TaCandle[] {
  return rollUpByBoundary(candles, (epochMs) => Math.floor(epochMs / bucketMs) * bucketMs)
}

function rollUpByBoundary(
  candles: TaCandle[],
  toBoundary: (epochMs: number) => number
): TaCandle[] {
  const bucketByBoundary = new Map<number, TaCandle>()

  for (const candle of ascendingByTime(candles)) {
    const boundary = toBoundary(candle.t)
    const open = bucketByBoundary.get(boundary)
    if (isNullish(open)) {
      bucketByBoundary.set(boundary, {
        t: boundary,
        o: candle.o,
        h: candle.h,
        l: candle.l,
        c: candle.c,
        v: candle.v ?? null
      })
      continue
    }
    bucketByBoundary.set(boundary, {
      t: boundary,
      o: open.o,
      h: Math.max(open.h, candle.h),
      l: Math.min(open.l, candle.l),
      c: candle.c,
      v: addVolume(open.v, candle.v)
    })
  }

  return ascendingByTime(Array.from(bucketByBoundary.values()))
}

// Volume is unknown-propagating: a bucket containing any volume-less bar
// reports null rather than a total that silently omits it.
function addVolume(
  left: number | null | undefined,
  right: number | null | undefined
): number | null {
  if (isNullish(left) || isNullish(right)) {
    return null
  }
  return left + right
}

function startOfIsoWeekUtcMs(epochMs: number): number {
  const date = new Date(epochMs)
  // getUTCDay is 0=Sunday..6=Saturday; ISO weeks start Monday, so remap to
  // Monday=0..Sunday=6. Date.UTC normalises a non-positive day-of-month back
  // into the previous month.
  const daysFromMonday = (date.getUTCDay() + 6) % 7
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - daysFromMonday)
}

function ascendingByTime(candles: TaCandle[]): TaCandle[] {
  return [...candles].sort((left, right) => left.t - right.t)
}
