import type { CandleAggregation, UnifiedCandle } from '@/types/Candles'
import { isNullish } from '@/utils/Lang'

// Roll finer candles into coarser ones. `fixed` groups N consecutive bars;
// `calendar` groups by UTC ISO week (Monday start) or calendar month. Each
// output bucket keeps open=first, high=max, low=min, close=last, volume=sum,
// timestamp=first bar's timestamp.
export function aggregateCandles(
  candles: UnifiedCandle[],
  config: CandleAggregation
): UnifiedCandle[] {
  const sorted = [...candles].sort((left, right) => left.timestamp - right.timestamp)
  switch (config.kind) {
    case 'fixed':
      return aggregateFixed(sorted, config.size)
    case 'calendar':
      return aggregateCalendar(sorted, config.boundary)
  }
}

function aggregateFixed(candles: UnifiedCandle[], size: number): UnifiedCandle[] {
  if (size <= 1) {
    return candles
  }
  const output: UnifiedCandle[] = []
  for (let index = 0; index < candles.length; index += size) {
    const rolled = rollupBucket(candles.slice(index, index + size))
    if (!isNullish(rolled)) {
      output.push(rolled)
    }
  }
  return output
}

function aggregateCalendar(candles: UnifiedCandle[], boundary: 'week' | 'month'): UnifiedCandle[] {
  const bucketsByKey = new Map<number, UnifiedCandle[]>()
  for (const candle of candles) {
    const key = calendarBucketKey(candle.timestamp, boundary)
    const existing = bucketsByKey.get(key)
    if (isNullish(existing)) {
      bucketsByKey.set(key, [candle])
      continue
    }
    existing.push(candle)
  }
  // Candles are sorted ascending, so Map insertion order is ascending too.
  const output: UnifiedCandle[] = []
  for (const bucket of bucketsByKey.values()) {
    const rolled = rollupBucket(bucket)
    if (!isNullish(rolled)) {
      output.push(rolled)
    }
  }
  return output
}

function rollupBucket(bucket: UnifiedCandle[]): UnifiedCandle | null {
  const first = bucket[0]
  const last = bucket[bucket.length - 1]
  if (isNullish(first) || isNullish(last)) {
    return null
  }
  let high = first.high
  let low = first.low
  let volume = first.volume
  for (let index = 1; index < bucket.length; index += 1) {
    const candle = bucket[index]
    if (isNullish(candle)) {
      continue
    }
    if (candle.high > high) {
      high = candle.high
    }
    if (candle.low < low) {
      low = candle.low
    }
    volume += candle.volume
  }
  return { timestamp: first.timestamp, open: first.open, high, low, close: last.close, volume }
}

function calendarBucketKey(unixSeconds: number, boundary: 'week' | 'month'): number {
  const date = new Date(unixSeconds * 1000)
  if (boundary === 'week') {
    // getUTCDay: 0=Sun..6=Sat. ISO week starts Monday, so map Mon->0 .. Sun->6.
    const daysFromMonday = (date.getUTCDay() + 6) % 7
    return Math.floor(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - daysFromMonday) / 1000
    )
  }
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / 1000)
}
