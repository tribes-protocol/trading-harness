import type {
  CandleAggregation,
  MarketStackEodBar,
  MarketStackIntradayBar,
  MarketStackStockPriceItem,
  StockCandle,
  StockFetchPlan,
  StockTimeframe
} from '@/types/MarketStack'
import { StockCandleSchema } from '@/types/MarketStack'
import { isNullish } from '@/utils/Lang'

const MAX_MARKET_SNAPSHOT_TICKERS = 50

type SnapshotChange = {
  readonly change: number | null
  readonly change_pct: number | null
}

type RecentDateRange = {
  readonly date_from: string
  readonly date_to: string
}

type ResolveSnapshotPriceParams = {
  readonly stockPrice: MarketStackStockPriceItem | null | undefined
  readonly intraday: MarketStackIntradayBar | null | undefined
  readonly latestEod: MarketStackEodBar | null | undefined
}

export function parseCommaSeparatedTickers(tickers: string): string[] {
  const parsed = tickers
    .split(',')
    .map((ticker) => ticker.trim().toUpperCase())
    .filter((ticker) => ticker.length > 0)

  return [...new Set(parsed)]
}

export function assertMarketSnapshotTickerCount(tickers: string[]): void {
  if (tickers.length === 0) {
    throw new Error('Provide at least one ticker symbol.')
  }

  if (tickers.length > MAX_MARKET_SNAPSHOT_TICKERS) {
    throw new Error(`Market snapshot supports at most ${MAX_MARKET_SNAPSHOT_TICKERS} tickers.`)
  }
}

export function toRecentDateRange(days: number): RecentDateRange {
  const dateTo = new Date()
  const dateFrom = new Date()
  dateFrom.setUTCDate(dateFrom.getUTCDate() - days)

  return {
    date_from: dateFrom.toISOString().slice(0, 10),
    date_to: dateTo.toISOString().slice(0, 10)
  }
}

export function groupEodBarsBySymbol(
  bars: MarketStackEodBar[] | null | undefined
): Map<string, MarketStackEodBar[]> {
  const grouped = new Map<string, MarketStackEodBar[]>()

  for (const bar of bars ?? []) {
    const symbol = bar.symbol.toUpperCase()
    const existing = grouped.get(symbol) ?? []
    existing.push(bar)
    grouped.set(symbol, existing)
  }

  for (const [symbol, symbolBars] of grouped) {
    grouped.set(
      symbol,
      [...symbolBars].sort((left, right) => right.date.localeCompare(left.date))
    )
  }

  return grouped
}

export function indexIntradayBarsBySymbol(
  bars: MarketStackIntradayBar[] | null | undefined
): Map<string, MarketStackIntradayBar> {
  const indexed = new Map<string, MarketStackIntradayBar>()

  for (const bar of bars ?? []) {
    indexed.set(bar.symbol.toUpperCase(), bar)
  }

  return indexed
}

export function indexStockPricesByTicker(
  items: MarketStackStockPriceItem[] | null | undefined
): Map<string, MarketStackStockPriceItem> {
  const indexed = new Map<string, MarketStackStockPriceItem>()

  for (const item of items ?? []) {
    indexed.set(item.ticker.toUpperCase(), item)
  }

  return indexed
}

// The latest EOD bar is today's own close once the session has settled, so it
// is not a previous close. Fall back to the bar before it in that case.
export function resolvePrevClose(eodBars: MarketStackEodBar[]): number | null {
  const latest = eodBars[0]
  if (isNullish(latest)) {
    return null
  }

  const latestClose = latest.close ?? latest.adj_close ?? null
  if (eodBars.length === 1) {
    return latestClose
  }

  const previous = eodBars[1]
  const isLatestToday = latest.date.slice(0, 10) === new Date().toISOString().slice(0, 10)
  if (isLatestToday) {
    return previous?.close ?? previous?.adj_close ?? null
  }

  return latestClose
}

export function resolveSnapshotPrice(params: ResolveSnapshotPriceParams): number | null {
  const { stockPrice, intraday, latestEod } = params

  if (!isNullish(stockPrice)) {
    return stockPrice.price
  }

  if (!isNullish(intraday?.close)) {
    return intraday.close
  }

  if (!isNullish(latestEod?.close)) {
    return latestEod.close
  }

  return null
}

export function computeSnapshotChange(
  price: number | null,
  prevClose: number | null
): SnapshotChange {
  if (isNullish(price) || isNullish(prevClose)) {
    return { change: null, change_pct: null }
  }

  const change = price - prevClose
  const change_pct = prevClose === 0 ? null : (change / prevClose) * 100

  return { change, change_pct }
}

export function toStockFetchPlan(timeframe: StockTimeframe): StockFetchPlan {
  switch (timeframe) {
    case '1m':
      return { sourceKind: 'intraday', interval: '1min' }
    case '3m':
      return { sourceKind: 'intraday', interval: '1min', aggregation: { kind: 'fixed', size: 3 } }
    case '5m':
      return { sourceKind: 'intraday', interval: '5min' }
    case '15m':
      return { sourceKind: 'intraday', interval: '15min' }
    case '30m':
      return { sourceKind: 'intraday', interval: '30min' }
    case '1H':
      return { sourceKind: 'intraday', interval: '1hour' }
    case '2H':
      return { sourceKind: 'intraday', interval: '1hour', aggregation: { kind: 'fixed', size: 2 } }
    case '4H':
      return { sourceKind: 'intraday', interval: '1hour', aggregation: { kind: 'fixed', size: 4 } }
    case '6H':
      return { sourceKind: 'intraday', interval: '6hour' }
    case '8H':
      return { sourceKind: 'intraday', interval: '1hour', aggregation: { kind: 'fixed', size: 8 } }
    case '12H':
      return { sourceKind: 'intraday', interval: '12hour' }
    case '1D':
      return { sourceKind: 'eod' }
    case '3D':
      return { sourceKind: 'eod', aggregation: { kind: 'fixed', size: 3 } }
    case '1W':
      return { sourceKind: 'eod', aggregation: { kind: 'calendar', boundary: 'week' } }
    case '1M':
      return { sourceKind: 'eod', aggregation: { kind: 'calendar', boundary: 'month' } }
  }
}

// Upper bound on source bars per output bucket, used to size how many raw bars
// to page in. Overestimating is safe: pagination stops early once the provider
// runs out of rows in the requested date range.
export function toSourceCandleMultiplier(
  aggregation: CandleAggregation | null | undefined
): number {
  if (isNullish(aggregation)) {
    return 1
  }

  switch (aggregation.kind) {
    case 'fixed':
      return Math.max(1, aggregation.size)
    case 'calendar':
      return aggregation.boundary === 'week' ? 7 : 31
  }
}

export function parseBarToCandle(
  bar: MarketStackIntradayBar | MarketStackEodBar
): StockCandle | null {
  if (
    isNullish(bar.open) ||
    isNullish(bar.high) ||
    isNullish(bar.low) ||
    isNullish(bar.close) ||
    bar.date.length === 0
  ) {
    return null
  }

  const unixTimeMs = Date.parse(bar.date)
  if (!Number.isFinite(unixTimeMs)) {
    return null
  }

  return StockCandleSchema.parse({
    t: Math.floor(unixTimeMs / 1000),
    o: bar.open,
    h: bar.high,
    l: bar.low,
    c: bar.close,
    v: bar.volume ?? 0
  })
}

export function sortCandlesAscending(candles: StockCandle[]): StockCandle[] {
  return [...candles].sort((left, right) => left.t - right.t)
}

export function aggregateCandles(
  candles: StockCandle[],
  aggregation: CandleAggregation
): StockCandle[] {
  const sorted = sortCandlesAscending(candles)

  if (aggregation.kind === 'fixed') {
    if (aggregation.size <= 1) {
      return sorted
    }

    const output: StockCandle[] = []
    for (let index = 0; index < sorted.length; index += aggregation.size) {
      output.push(rollupBucket(sorted.slice(index, index + aggregation.size)))
    }
    return output
  }

  const bucketsByKey = new Map<number, StockCandle[]>()
  for (const candle of sorted) {
    const key = calendarBucketKey(candle.t, aggregation.boundary)
    const existing = bucketsByKey.get(key)
    if (isNullish(existing)) {
      bucketsByKey.set(key, [candle])
      continue
    }
    existing.push(candle)
  }

  // Candles are sorted ascending, so Map insertion order is ascending too.
  return Array.from(bucketsByKey.values()).map((bucket) => rollupBucket(bucket))
}

export function toMarketStackDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10)
}

export function dateStringToUnixStart(date: string): number {
  const parsed = Date.parse(`${date}T00:00:00.000Z`)
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid start date: ${date}`)
  }

  return Math.floor(parsed / 1000)
}

export function dateStringToUnixEnd(date: string): number {
  const parsed = Date.parse(`${date}T23:59:59.999Z`)
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid end date: ${date}`)
  }

  return Math.floor(parsed / 1000)
}

function rollupBucket(bucket: StockCandle[]): StockCandle {
  const first = bucket[0]
  const last = bucket[bucket.length - 1]
  if (isNullish(first) || isNullish(last)) {
    throw new Error('Cannot roll up an empty candle bucket')
  }

  let high = first.h
  let low = first.l
  let volume = first.v

  for (const candle of bucket.slice(1)) {
    high = Math.max(high, candle.h)
    low = Math.min(low, candle.l)
    volume += candle.v
  }

  return StockCandleSchema.parse({
    t: first.t,
    o: first.o,
    h: high,
    l: low,
    c: last.c,
    v: volume
  })
}

function calendarBucketKey(unixSeconds: number, boundary: 'week' | 'month'): number {
  const date = new Date(unixSeconds * 1000)

  if (boundary === 'month') {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / 1000
  }

  // ISO weeks start on Monday: shift Sunday (0) back six days, others back to Monday.
  const dayOffset = (date.getUTCDay() + 6) % 7
  const monday = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - dayOffset)
  return monday / 1000
}
