import type { z } from 'zod'

import type {
  MarketStackEodBar,
  MarketStackEodResponse,
  MarketStackIntradayBar,
  MarketStackIntradayInterval,
  MarketStackIntradayResponse,
  MarketStackSort,
  MarketStackStockPriceResponse,
  MarketStackTicker,
  MarketStackTickersListResponse,
  StockCandle,
  StockCandlesResult,
  StockDetails,
  StockFetchPlan,
  StockMarketSnapshotRow,
  StockSearchResult,
  StockSnapshot,
  StockTimeframe
} from '@/types/MarketStack'
import {
  MarketStackEodResponseSchema,
  MarketStackIntradayResponseSchema,
  MarketStackStockPriceResponseSchema,
  MarketStackTickerSchema,
  MarketStackTickersListResponseSchema,
  StockCandlesResultSchema,
  StockDetailsSchema,
  StockMarketSnapshotRowSchema,
  StockSearchResultSchema,
  StockSnapshotSchema
} from '@/types/MarketStack'
import { isNullish } from '@/utils/Lang'
import {
  aggregateCandles,
  assertMarketSnapshotTickerCount,
  computeSnapshotChange,
  dateStringToUnixEnd,
  dateStringToUnixStart,
  groupEodBarsBySymbol,
  indexIntradayBarsBySymbol,
  indexStockPricesByTicker,
  parseBarToCandle,
  parseCommaSeparatedTickers,
  resolvePrevClose,
  resolveSnapshotPrice,
  sortCandlesAscending,
  toMarketStackDate,
  toRecentDateRange,
  toSourceCandleMultiplier,
  toStockFetchPlan
} from '@/utils/MarketStack'

const MARKET_STACK_BASE_URL = 'https://api.marketstack.com'

// Marketstack caps a single page at 1000 rows.
const MAX_PAGE_SIZE = 1000

// Bounds an unlimited range request (e.g. 1m bars across a year) to 10k bars.
const MAX_PAGES = 10

// Days of EOD history pulled for a multi-ticker snapshot: enough to find a real
// previous close across weekends and market holidays.
const SNAPSHOT_EOD_LOOKBACK_DAYS = 14

type StockServiceParams = {
  readonly apiKey: string
}

type QueryValue = string | number | boolean | undefined

type CandlesParams = {
  readonly ticker: string
  readonly timeframe: StockTimeframe
  readonly from: string
  readonly to: string
  readonly limit: number | null | undefined
}

type FetchPageParams = {
  readonly ticker: string
  readonly plan: StockFetchPlan
  readonly dateFrom: string
  readonly dateTo: string
  readonly offset: number
  readonly limit: number
  readonly sort: MarketStackSort
}

type FetchPageResult = {
  readonly candles: StockCandle[]
  readonly pageCount: number
}

/**
 * Marketstack client: snapshots, candles, company details, and ticker search.
 */
export class StockService {
  private readonly apiKey: string

  constructor(params: StockServiceParams) {
    this.apiKey = params.apiKey
  }

  async getSnapshot(rawTicker: string): Promise<StockSnapshot> {
    const ticker = rawTicker.trim().toUpperCase()
    const [intradayResponse, eodResponse, stockPriceResponse] = await Promise.all([
      this.getLatestIntradayBars(ticker),
      this.getLatestEodBars(ticker, 2),
      this.tryGetStockPrice(ticker)
    ])

    const intraday = intradayResponse.data?.[0]
    const eodBars = eodResponse.data
    const latestEod = eodBars[0]
    const stockPrice = stockPriceResponse.data[0]

    const price = resolveSnapshotPrice({ stockPrice, intraday, latestEod })
    const prevClose = resolvePrevClose(eodBars)
    const { change, change_pct } = computeSnapshotChange(price, prevClose)

    return StockSnapshotSchema.parse({
      ticker,
      price,
      change,
      change_pct,
      day_open: intraday?.open ?? latestEod?.open ?? null,
      day_high: intraday?.high ?? latestEod?.high ?? null,
      day_low: intraday?.low ?? latestEod?.low ?? null,
      day_volume: intraday?.volume ?? latestEod?.volume ?? null,
      prev_close: prevClose,
      currency: stockPrice?.currency ?? null,
      as_of: stockPrice?.trade_last ?? intraday?.date ?? latestEod?.date ?? null
    })
  }

  async getMarketSnapshot(rawTickers: string): Promise<StockMarketSnapshotRow[]> {
    const tickers = parseCommaSeparatedTickers(rawTickers)
    assertMarketSnapshotTickerCount(tickers)

    const symbols = tickers.join(',')
    const { date_from, date_to } = toRecentDateRange(SNAPSHOT_EOD_LOOKBACK_DAYS)

    const [stockPriceResponse, intradayResponse, eodResponse] = await Promise.all([
      this.tryGetStockPrice(symbols),
      this.getLatestIntradayBars(symbols),
      this.getEodBars({
        symbols,
        date_from,
        date_to,
        limit: MAX_PAGE_SIZE,
        offset: 0,
        sort: 'DESC'
      })
    ])

    const priceByTicker = indexStockPricesByTicker(stockPriceResponse.data)
    const intradayBySymbol = indexIntradayBarsBySymbol(intradayResponse.data)
    const eodBySymbol = groupEodBarsBySymbol(eodResponse.data)

    return tickers.map((ticker) => {
      const eodBars = eodBySymbol.get(ticker) ?? []
      const price = resolveSnapshotPrice({
        stockPrice: priceByTicker.get(ticker),
        intraday: intradayBySymbol.get(ticker),
        latestEod: eodBars[0]
      })
      const { change, change_pct } = computeSnapshotChange(price, resolvePrevClose(eodBars))

      return StockMarketSnapshotRowSchema.parse({ ticker, price, change, change_pct })
    })
  }

  async getDetails(rawTicker: string): Promise<StockDetails> {
    const ticker = rawTicker.trim().toUpperCase()
    const details: MarketStackTicker = await this.get(
      `/v2/tickers/${encodeURIComponent(ticker)}`,
      MarketStackTickerSchema
    )
    const exchange = details.stock_exchange

    return StockDetailsSchema.parse({
      ticker: details.symbol,
      name: details.name,
      type: details.item_type ?? null,
      exchange: exchange?.acronym ?? exchange?.mic ?? exchange?.name ?? null,
      sector: details.sector ?? null,
      industry: details.industry ?? null,
      sic: details.sic_name ?? details.sic_code ?? null,
      cik: details.cik ?? null,
      isin: details.isin ?? null,
      cusip: details.cusip ?? null,
      country: exchange?.country ?? null
    })
  }

  async search(query: string, limit: number): Promise<StockSearchResult[]> {
    const response: MarketStackTickersListResponse = await this.get(
      '/v2/tickerslist',
      MarketStackTickersListResponseSchema,
      { search: query, limit }
    )

    return response.data.map((item) =>
      StockSearchResultSchema.parse({
        ticker: item.ticker,
        name: item.name,
        exchange: item.stock_exchange.acronym ?? item.stock_exchange.mic ?? null,
        has_eod: item.has_eod ?? false,
        has_intraday: item.has_intraday ?? false
      })
    )
  }

  async getCandles(params: CandlesParams): Promise<StockCandlesResult> {
    const ticker = params.ticker.trim().toUpperCase()
    const plan = toStockFetchPlan(params.timeframe)
    const timeFrom = dateStringToUnixStart(params.from)
    const timeTo = dateStringToUnixEnd(params.to)
    if (timeFrom > timeTo) {
      throw new Error(`Start date ${params.from} is after end date ${params.to}.`)
    }

    // With a limit the caller wants the MOST RECENT bars, so page newest-first
    // and stop early; without one, page the whole range oldest-first. The +1
    // bucket of slack covers the partial bucket at the far edge of a newest-first
    // window, which the final slice then drops.
    const multiplier = toSourceCandleMultiplier(plan.aggregation)
    const requiredSourceCandles = isNullish(params.limit)
      ? Number.POSITIVE_INFINITY
      : (params.limit + 1) * multiplier
    const sourceCandles = await this.fetchSourceCandles({
      ticker,
      plan,
      timeFrom,
      timeTo,
      requiredSourceCandles,
      sort: isNullish(params.limit) ? 'ASC' : 'DESC'
    })

    const aggregated = isNullish(plan.aggregation)
      ? sourceCandles
      : aggregateCandles(sourceCandles, plan.aggregation)
    const inRange = aggregated.filter((candle) => candle.t >= timeFrom && candle.t <= timeTo)
    const candles = isNullish(params.limit) ? inRange : inRange.slice(-params.limit)

    return StockCandlesResultSchema.parse({
      ticker,
      timeframe: params.timeframe,
      from: params.from,
      to: params.to,
      count: candles.length,
      candles
    })
  }

  private async fetchSourceCandles(params: {
    readonly ticker: string
    readonly plan: StockFetchPlan
    readonly timeFrom: number
    readonly timeTo: number
    readonly requiredSourceCandles: number
    readonly sort: MarketStackSort
  }): Promise<StockCandle[]> {
    const { ticker, plan, timeFrom, timeTo, requiredSourceCandles, sort } = params
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, requiredSourceCandles))
    const dateFrom = toMarketStackDate(timeFrom)
    const dateTo = toMarketStackDate(timeTo)
    const candlesByTimestamp = new Map<number, StockCandle>()

    let offset = 0
    for (let page = 0; page < MAX_PAGES; page += 1) {
      if (candlesByTimestamp.size >= requiredSourceCandles) {
        break
      }

      const result = await this.fetchPage({ ticker, plan, dateFrom, dateTo, offset, limit, sort })

      for (const candle of result.candles) {
        if (candle.t < timeFrom || candle.t > timeTo || candlesByTimestamp.has(candle.t)) {
          continue
        }
        candlesByTimestamp.set(candle.t, candle)
      }

      if (result.pageCount < limit || result.pageCount === 0) {
        break
      }

      offset += limit
    }

    return sortCandlesAscending(Array.from(candlesByTimestamp.values()))
  }

  private async fetchPage(params: FetchPageParams): Promise<FetchPageResult> {
    const { ticker, plan, dateFrom, dateTo, offset, limit, sort } = params

    if (plan.sourceKind === 'intraday') {
      if (isNullish(plan.interval)) {
        throw new Error('Intraday candle plan requires an interval')
      }

      const response = await this.getIntradayBars({
        symbols: ticker,
        interval: plan.interval,
        date_from: dateFrom,
        date_to: dateTo,
        limit,
        offset,
        sort
      })
      const bars = response.data ?? []
      return {
        candles: toCandles(bars),
        pageCount: response.pagination?.count ?? bars.length
      }
    }

    const response = await this.getEodBars({
      symbols: ticker,
      date_from: dateFrom,
      date_to: dateTo,
      limit,
      offset,
      sort
    })
    const bars = response.data
    return {
      candles: toCandles(bars),
      pageCount: response.pagination?.count ?? bars.length
    }
  }

  private async getIntradayBars(query: {
    readonly symbols: string
    readonly interval: MarketStackIntradayInterval
    readonly date_from: string
    readonly date_to: string
    readonly limit: number
    readonly offset: number
    readonly sort: MarketStackSort
  }): Promise<MarketStackIntradayResponse> {
    return this.get('/v2/intraday', MarketStackIntradayResponseSchema, query)
  }

  private async getEodBars(query: {
    readonly symbols: string
    readonly date_from: string
    readonly date_to: string
    readonly limit: number
    readonly offset: number
    readonly sort: MarketStackSort
  }): Promise<MarketStackEodResponse> {
    return this.get('/v2/eod', MarketStackEodResponseSchema, query)
  }

  private async getLatestEodBars(symbols: string, limit: number): Promise<MarketStackEodResponse> {
    return this.get('/v2/eod/latest', MarketStackEodResponseSchema, {
      symbols,
      limit,
      offset: 0,
      sort: 'DESC'
    })
  }

  private async getLatestIntradayBars(symbols: string): Promise<MarketStackIntradayResponse> {
    return this.get('/v2/intraday/latest', MarketStackIntradayResponseSchema, { symbols })
  }

  /**
   * The live-price endpoint is a paid Marketstack add-on: lower plans answer it
   * with 403 function_access_restricted. It is an enrichment, not the source of
   * truth, so a failure degrades to the intraday/EOD close rather than failing
   * the whole snapshot.
   */
  private async tryGetStockPrice(ticker: string): Promise<MarketStackStockPriceResponse> {
    try {
      return await this.get('/v2/stockprice', MarketStackStockPriceResponseSchema, { ticker })
    } catch {
      return { data: [] }
    }
  }

  private async get<Schema extends z.ZodTypeAny>(
    path: string,
    schema: Schema,
    query: Record<string, QueryValue> = {}
  ): Promise<z.output<Schema>> {
    if (this.apiKey.length === 0) {
      throw new Error('MARKETSTACK_API_KEY is not set; stock data is unavailable.')
    }

    const url = new URL(path, MARKET_STACK_BASE_URL)
    for (const [key, value] of Object.entries(query)) {
      if (isNullish(value)) continue
      url.searchParams.set(key, String(value))
    }
    url.searchParams.set('access_key', this.apiKey)

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(
        `Marketstack request failed for ${path}: ${response.status} ${response.statusText}`
      )
    }

    const data: unknown = await response.json()
    return schema.parse(data)
  }
}

function toCandles(bars: (MarketStackIntradayBar | MarketStackEodBar)[]): StockCandle[] {
  const candles: StockCandle[] = []
  for (const bar of bars) {
    const candle = parseBarToCandle(bar)
    if (isNullish(candle)) continue
    candles.push(candle)
  }
  return candles
}
