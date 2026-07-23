import type {
  StocksCandles,
  StocksDetail,
  StocksMarketStatus,
  StocksMoverRow,
  StocksMovers,
  StocksMoversDirection,
  StocksQuote,
  StocksSearchResults
} from '@/types/Stocks'
import {
  MarketstackEodResponseSchema,
  MarketstackTickerSchema,
  MarketstackTickersResponseSchema,
  MassiveStocksMarketStatusSchema,
  MassiveStocksTopMoversResponseSchema,
  StocksCandlesSchema,
  StocksDetailSchema,
  StocksMarketStatusSchema,
  StocksMoversSchema,
  StocksProxySnapshotSchema,
  StocksQuoteSchema,
  StocksSearchResultsSchema
} from '@/types/Stocks'
import { compactMap, isNullish } from '@/utils/Lang'

type StocksServiceParams = {
  readonly apiKey: string
  readonly massiveApiKey: string
  readonly apiBaseUrl: string
  readonly apiBearerToken: string
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

type SearchParams = {
  readonly query: string
  readonly limit: number
}

type GetQuoteParams = {
  readonly symbol: string
}

type GetMoversParams = {
  readonly direction: StocksMoversDirection
  readonly limit: number
}

const MARKETSTACK_BASE_URL = 'https://api.marketstack.com/'
// market-status and movers have no Tribes proxy route, so they call Massive
// directly with MASSIVE_API_KEY (same split as OptionsService).
const MASSIVE_BASE_URL = 'https://api.massive.com/'
const ERROR_BODY_MAX_CHARS = 300

export class StocksService {
  private readonly apiKey: string

  private readonly massiveApiKey: string

  private readonly apiBaseUrl: string

  private readonly apiBearerToken: string

  constructor(params: StocksServiceParams) {
    this.apiKey = params.apiKey
    this.massiveApiKey = params.massiveApiKey
    this.apiBaseUrl = params.apiBaseUrl
    this.apiBearerToken = params.apiBearerToken
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
    const raw = await this.fetchMarketstack('v2/tickers', {
      search: params.query,
      limit: String(params.limit)
    })
    const parsed = MarketstackTickersResponseSchema.parse(raw)
    return StocksSearchResultsSchema.parse({
      source: 'marketstack',
      query: params.query,
      results: (parsed.data ?? []).map((row) => ({
        symbol: row.symbol,
        name: row.name,
        exchange: row.stock_exchange?.acronym ?? row.stock_exchange?.name,
        mic: row.stock_exchange?.mic,
        country: row.stock_exchange?.country
      }))
    })
  }

  async getQuote(params: GetQuoteParams): Promise<StocksQuote> {
    const path = `/stocks/snapshot/${encodeURIComponent(params.symbol)}`
    const response = await fetch(new URL(path, this.apiBaseUrl), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${this.apiBearerToken}`
      }
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(
        `Stocks proxy ${path} failed: ${response.status} ${response.statusText} ${body.slice(0, ERROR_BODY_MAX_CHARS)}`
      )
    }
    const data: unknown = await response.json()
    const snapshot = StocksProxySnapshotSchema.parse(data)
    return StocksQuoteSchema.parse({
      source: 'massive',
      symbol: snapshot.ticker,
      name: snapshot.name,
      price: this.asFiniteNumber(snapshot.price),
      change: this.asFiniteNumber(snapshot.change),
      change_pct: this.asFiniteNumber(snapshot.changePercent),
      volume: this.asFiniteNumber(snapshot.volume),
      day_open: this.asFiniteNumber(snapshot.dayOpen),
      day_high: this.asFiniteNumber(snapshot.dayHigh),
      day_low: this.asFiniteNumber(snapshot.dayLow),
      prev_close: this.asFiniteNumber(snapshot.prevClose),
      market_cap: this.asFiniteNumber(snapshot.marketCap),
      exchange: snapshot.primaryExchange,
      updated_at: snapshot.updated
    })
  }

  async getMarketStatus(): Promise<StocksMarketStatus> {
    const raw = await this.fetchMassive('v1/marketstatus/now', {})
    const parsed = MassiveStocksMarketStatusSchema.parse(raw)
    return StocksMarketStatusSchema.parse({
      source: 'massive',
      market: parsed.market,
      server_time: parsed.serverTime,
      after_hours: parsed.afterHours,
      early_hours: parsed.earlyHours
    })
  }

  async getMovers(params: GetMoversParams): Promise<StocksMovers> {
    const [gainers, losers] = await Promise.all([
      params.direction === 'losers' ? null : this.fetchMovers('gainers', params.limit),
      params.direction === 'gainers' ? null : this.fetchMovers('losers', params.limit)
    ])
    return StocksMoversSchema.parse({
      source: 'massive',
      direction: params.direction,
      gainers,
      losers
    })
  }

  private async fetchMovers(
    direction: 'gainers' | 'losers',
    limit: number
  ): Promise<StocksMoverRow[]> {
    const raw = await this.fetchMassive(`v2/snapshot/locale/us/markets/stocks/${direction}`, {})
    const parsed = MassiveStocksTopMoversResponseSchema.parse(raw)
    return (parsed.tickers ?? []).slice(0, limit).map((row) => ({
      symbol: row.ticker,
      price: row.lastTrade?.p ?? row.day?.c,
      change: row.todaysChange,
      change_pct: row.todaysChangePerc,
      volume: row.day?.v
    }))
  }

  private async fetchMassive(path: string, searchParams: Record<string, string>): Promise<unknown> {
    if (this.massiveApiKey === '') {
      throw new Error(
        'MASSIVE_API_KEY is not set — `stocks market-status` and `stocks movers` are unavailable on this box'
      )
    }
    const url = new URL(path, MASSIVE_BASE_URL)
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, value)
    }
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${this.massiveApiKey}`
      }
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(
        `Massive /${path} failed: ${response.status} ${response.statusText} ${body.slice(0, ERROR_BODY_MAX_CHARS)}`
      )
    }
    const data: unknown = await response.json()
    return data
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

  // The stocks proxy serializes BigNumber fields as decimal strings; anything
  // non-finite collapses to null.
  private asFiniteNumber(value: unknown): number | null {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null
    }
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value)
      return Number.isFinite(parsed) ? parsed : null
    }
    return null
  }
}
