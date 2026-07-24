import type { StocksCandles, StocksDetail, StocksPrice, StocksSearchResults } from '@/types/Stocks'
import {
  MarketstackEodResponseSchema,
  MarketstackStockPriceResponseSchema,
  MarketstackTickerSchema,
  MarketstackTickersListResponseSchema,
  StocksCandlesSchema,
  StocksDetailSchema,
  StocksPriceSchema,
  StocksSearchResultsSchema
} from '@/types/Stocks'
import { compactMap, isNullish } from '@/utils/Lang'

type StocksServiceParams = {
  readonly apiKey: string
}

type GetCandlesParams = {
  readonly symbol: string
  readonly from: string | null | undefined
  readonly to: string | null | undefined
  readonly limit: number
}

type GetDetailParams = {
  readonly symbol: string
}

type GetStockPriceParams = {
  readonly symbol: string
}

type SearchParams = {
  readonly query: string
  readonly limit: number
}

const MARKETSTACK_BASE_URL = 'https://api.marketstack.com/'
const ERROR_BODY_MAX_CHARS = 300

export class StocksService {
  private readonly apiKey: string

  constructor(params: StocksServiceParams) {
    this.apiKey = params.apiKey
  }

  async getCandles(params: GetCandlesParams): Promise<StocksCandles> {
    const raw = await this.fetchMarketstack('v2/eod', {
      symbols: params.symbol,
      limit: String(params.limit),
      ...(isNullish(params.from) ? {} : { date_from: params.from }),
      ...(isNullish(params.to) ? {} : { date_to: params.to })
    })
    const parsed = MarketstackEodResponseSchema.parse(raw)
    const candles = compactMap(
      (parsed.data ?? []).map((row) => {
        const t = Date.parse(row.date)
        if (!Number.isFinite(t)) {
          return null
        }
        return { t, o: row.open, h: row.high, l: row.low, c: row.close, v: row.volume }
      })
    ).sort((a, b) => a.t - b.t)
    return StocksCandlesSchema.parse({ source: 'marketstack', symbol: params.symbol, candles })
  }

  // Marketstack rate-limits /v2/stockprice to 1 call per minute.
  async getStockPrice(params: GetStockPriceParams): Promise<StocksPrice> {
    const raw = await this.fetchMarketstack('v2/stockprice', { ticker: params.symbol }).catch(
      (error: unknown) => {
        if (error instanceof Error && error.message.includes('failed: 429')) {
          throw new Error(
            'Marketstack /v2/stockprice failed: 429 Too Many Requests — the endpoint is rate-limited to 1 call per minute; wait before retrying'
          )
        }
        throw error
      }
    )
    const parsed = MarketstackStockPriceResponseSchema.parse(raw)
    const row = (parsed.data ?? [])[0]
    const price = isNullish(row?.price) ? null : Number(row.price)
    return StocksPriceSchema.parse({
      source: 'marketstack',
      symbol: row?.ticker ?? params.symbol,
      price: price !== null && Number.isFinite(price) ? price : null,
      currency: row?.currency,
      trade_last: row?.trade_last
    })
  }

  async getDetail(params: GetDetailParams): Promise<StocksDetail> {
    const raw = await this.fetchMarketstack(`v2/tickers/${encodeURIComponent(params.symbol)}`, {})
    const ticker = MarketstackTickerSchema.parse(raw)
    return StocksDetailSchema.parse({
      source: 'marketstack',
      symbol: ticker.symbol,
      name: ticker.name,
      sector: ticker.sector,
      industry: ticker.industry,
      exchange: ticker.stock_exchange?.acronym ?? ticker.stock_exchange?.name,
      mic: ticker.stock_exchange?.mic,
      country: ticker.stock_exchange?.country
    })
  }

  async search(params: SearchParams): Promise<StocksSearchResults> {
    const raw = await this.fetchMarketstack('v2/tickerslist', {
      search: params.query,
      limit: String(params.limit)
    })
    const parsed = MarketstackTickersListResponseSchema.parse(raw)
    return StocksSearchResultsSchema.parse({
      source: 'marketstack',
      query: params.query,
      results: (parsed.data ?? []).map((row) => ({
        symbol: row.ticker,
        name: row.name,
        exchange: row.stock_exchange?.acronym ?? row.stock_exchange?.name,
        mic: row.stock_exchange?.mic,
        country: row.stock_exchange?.country
      }))
    })
  }

  private async fetchMarketstack(
    path: string,
    searchParams: Record<string, string>
  ): Promise<unknown> {
    if (this.apiKey === '') {
      throw new Error(
        'MARKETSTACK_API_KEY is not set — the `stocks` command group is unavailable on this box'
      )
    }
    const url = new URL(path, MARKETSTACK_BASE_URL)
    url.searchParams.set('access_key', this.apiKey)
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, value)
    }
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' }
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      // The access key rides the URL query, so the message references only the
      // request path — never the full URL.
      throw new Error(
        `Marketstack /${path} failed: ${response.status} ${response.statusText} ${body.slice(0, ERROR_BODY_MAX_CHARS)}`
      )
    }
    const data: unknown = await response.json()
    return data
  }
}
