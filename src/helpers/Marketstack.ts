import { fetchJson } from '@/helpers/HttpJson'
import {
  type MarketStackBar,
  type MarketStackPlan,
  MarketStackResponseSchema,
  type UnifiedCandle
} from '@/types/Candles'
import { toFiniteNumber } from '@/utils/Candles'
import { isNullish } from '@/utils/Lang'

const MARKETSTACK_BASE_URL = 'https://api.marketstack.com'
const PAGE_LIMIT = 1000
const MAX_PAGES = 20

export class MarketstackHelper {
  constructor(private readonly apiKey: string) {}

  // Page through the source (EOD or intraday) across [dateFrom, dateTo],
  // ascending, dropping bars with null OHLC, deduped by timestamp.
  async fetchSourceCandles(params: {
    plan: MarketStackPlan
    ticker: string
    dateFrom: string
    dateTo: string
  }): Promise<UnifiedCandle[]> {
    const byTimestamp = new Map<number, UnifiedCandle>()

    let offset = 0
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const bars = await this.fetchPage({ ...params, offset })
      for (const bar of bars) {
        const candle = toCandle(bar)
        if (!isNullish(candle) && !byTimestamp.has(candle.timestamp)) {
          byTimestamp.set(candle.timestamp, candle)
        }
      }
      if (bars.length < PAGE_LIMIT) {
        break
      }
      offset += PAGE_LIMIT
    }

    return Array.from(byTimestamp.values()).sort((left, right) => left.timestamp - right.timestamp)
  }

  private async fetchPage(params: {
    plan: MarketStackPlan
    ticker: string
    dateFrom: string
    dateTo: string
    offset: number
  }): Promise<MarketStackBar[]> {
    const path = params.plan.sourceKind === 'eod' ? '/v2/eod' : '/v2/intraday'
    const url = new URL(path, MARKETSTACK_BASE_URL)
    url.searchParams.set('access_key', this.apiKey)
    url.searchParams.set('symbols', params.ticker)
    url.searchParams.set('date_from', params.dateFrom)
    url.searchParams.set('date_to', params.dateTo)
    url.searchParams.set('sort', 'ASC')
    url.searchParams.set('limit', String(PAGE_LIMIT))
    url.searchParams.set('offset', String(params.offset))
    if (params.plan.sourceKind === 'intraday') {
      url.searchParams.set('interval', params.plan.interval)
    }

    const json = await fetchJson(url, { method: 'GET' }, 'Marketstack')
    return MarketStackResponseSchema.parse(json).data ?? []
  }
}

function toCandle(bar: MarketStackBar): UnifiedCandle | null {
  const open = toFiniteNumber(bar.open)
  const high = toFiniteNumber(bar.high)
  const low = toFiniteNumber(bar.low)
  const close = toFiniteNumber(bar.close)
  const volume = toFiniteNumber(bar.volume)
  if (
    isNullish(bar.date) ||
    isNullish(open) ||
    isNullish(high) ||
    isNullish(low) ||
    isNullish(close)
  ) {
    return null
  }
  const unixTimeMs = Date.parse(bar.date)
  if (!Number.isFinite(unixTimeMs)) {
    return null
  }
  return {
    timestamp: Math.floor(unixTimeMs / 1000),
    open,
    high,
    low,
    close,
    volume: volume ?? 0
  }
}
