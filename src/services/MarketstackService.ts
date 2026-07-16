import { cachedProviderJson } from '@/helpers/ProviderCache'
import { providerFetchJson } from '@/helpers/ProviderHttp'
import type {
  MarketstackEodSeries,
  MarketstackIntradayInterval,
  MarketstackIntradaySeries,
  MarketstackTickerProfile,
  MarketstackTickerSearchResults
} from '@/types/Marketstack'
import {
  MarketstackEodResponseSchema,
  MarketstackEodSeriesSchema,
  MarketstackIntradayResponseSchema,
  MarketstackIntradaySeriesSchema,
  MarketstackTickerProfileResponseSchema,
  MarketstackTickerProfileSchema,
  MarketstackTickerSearchResultsSchema,
  MarketstackTickersListResponseSchema
} from '@/types/Marketstack'
import { compactMap, isNullish, isRecord } from '@/utils/Lang'

// Direct Marketstack v2 integration (stock market data: EOD/intraday OHLCV,
// ticker search, ticker profiles). Docs: https://marketstack.com/documentation_v2.
// Auth: `access_key` QUERY PARAM — the only mechanism Marketstack supports — so
// the key lands in the request URL. providerFetchJson redacts it from error text
// via `secrets`, and cache keys are built strictly from the non-secret query.
// Limits: 5 req/s on every plan; free plan is 100 req/mo and EOD-only — intraday
// is Basic+ and its plan-gate errors (403 function_access_restricted) surface
// plainly. Timestamps pass through as provider ISO strings ('2024-09-27T00:00:00+0000').

const MARKETSTACK_BASE_URL = 'https://api.marketstack.com'
const EOD_PATH = '/v2/eod'
const EOD_LATEST_PATH = '/v2/eod/latest'
const INTRADAY_PATH = '/v2/intraday'
const INTRADAY_LATEST_PATH = '/v2/intraday/latest'
const TICKERS_LIST_PATH = '/v2/tickerslist'
const TICKERS_PATH_PREFIX = '/v2/tickers/'

const EOD_CACHE_TTL_MS = 15 * 60 * 1000
const EOD_LATEST_CACHE_TTL_MS = 5 * 60 * 1000
const INTRADAY_CACHE_TTL_MS = 60 * 1000
const SEARCH_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const TICKER_CACHE_TTL_MS = 24 * 60 * 60 * 1000

type MarketstackServiceParams = {
  readonly apiKey: string
}

type GetEodBarsParams = {
  readonly symbols: string
  readonly dateFrom: string | null
  readonly dateTo: string | null
  readonly exchange?: string | null
  readonly limit: number
  // true -> /v2/eod/latest (latest bar per symbol; date range not applicable)
  readonly latest: boolean
}

type GetIntradayBarsParams = {
  readonly symbols: string
  readonly interval: MarketstackIntradayInterval
  readonly dateFrom: string | null
  readonly dateTo: string | null
  readonly limit: number
  // true -> /v2/intraday/latest (latest bar per symbol; date range not applicable)
  readonly latest: boolean
}

type SearchTickersParams = {
  readonly query: string
  readonly limit: number
}

type GetTickerProfileParams = {
  readonly symbol: string
}

export class MarketstackService {
  private readonly apiKey: string

  constructor(params: MarketstackServiceParams) {
    this.apiKey = params.apiKey
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0
  }

  private ensureConfigured(): void {
    if (!this.isConfigured()) {
      throw new Error('MARKETSTACK_API_KEY is not set; direct Marketstack stock data is disabled')
    }
  }

  // End-of-day OHLCV bars, newest first (provider default sort DESC).
  async getEodBars(params: GetEodBarsParams): Promise<MarketstackEodSeries> {
    this.ensureConfigured()
    const symbols = ensureSymbolList(params.symbols)
    const path = params.latest ? EOD_LATEST_PATH : EOD_PATH
    const query: Record<string, string> = { symbols, limit: String(params.limit) }
    if (typeof params.exchange === 'string' && params.exchange.length > 0) {
      query.exchange = params.exchange
    }
    if (!params.latest) {
      if (!isNullish(params.dateFrom)) {
        query.date_from = params.dateFrom
      }
      if (!isNullish(params.dateTo)) {
        query.date_to = params.dateTo
      }
    }
    const data = await cachedProviderJson({
      cacheKey: cacheKeyFor(path, query),
      ttlMs: params.latest ? EOD_LATEST_CACHE_TTL_MS : EOD_CACHE_TTL_MS,
      fetchFn: async () => this.fetchJson(path, query)
    })
    const parsed = MarketstackEodResponseSchema.parse(data)
    return MarketstackEodSeriesSchema.parse({
      source: 'marketstack',
      pagination: parsed.pagination,
      bars: parsed.data.map((row) => ({
        symbol: row.symbol,
        date: row.date,
        open: row.open ?? null,
        high: row.high ?? null,
        low: row.low ?? null,
        close: row.close ?? null,
        volume: row.volume ?? null,
        adj_close: row.adj_close ?? null,
        split_factor: row.split_factor ?? null,
        dividend: row.dividend ?? null,
        exchange_code: row.exchange_code ?? null,
        price_currency: row.price_currency ?? null
      }))
    })
  }

  // Intraday OHLCV bars (US tickers via IEX; Basic+ plans). Without IEX
  // entitlement the quote fields ('last', bid/ask) come back null — only
  // OHLCV plus marketstack_last are reliable.
  async getIntradayBars(params: GetIntradayBarsParams): Promise<MarketstackIntradaySeries> {
    this.ensureConfigured()
    // Marketstack's intraday routes want '-' instead of '.' in share classes
    // (BRK.B -> BRK-B).
    const symbols = ensureSymbolList(params.symbols).split('.').join('-')
    const path = params.latest ? INTRADAY_LATEST_PATH : INTRADAY_PATH
    const query: Record<string, string> = {
      symbols,
      interval: params.interval,
      limit: String(params.limit)
    }
    if (!params.latest) {
      if (!isNullish(params.dateFrom)) {
        query.date_from = params.dateFrom
      }
      if (!isNullish(params.dateTo)) {
        query.date_to = params.dateTo
      }
    }
    const data = await cachedProviderJson({
      cacheKey: cacheKeyFor(path, query),
      ttlMs: INTRADAY_CACHE_TTL_MS,
      fetchFn: async () => this.fetchJson(path, query)
    })
    const parsed = MarketstackIntradayResponseSchema.parse(data)
    return MarketstackIntradaySeriesSchema.parse({
      source: 'marketstack',
      pagination: parsed.pagination,
      bars: parsed.data.map((row) => ({
        symbol: row.symbol,
        date: row.date,
        open: row.open ?? null,
        high: row.high ?? null,
        low: row.low ?? null,
        close: row.close ?? null,
        volume: row.volume ?? null,
        last: row.last ?? null,
        marketstack_last: row.marketstack_last ?? null
      }))
    })
  }

  // Ticker search via /v2/tickerslist. NOTE: rows name the symbol field
  // 'ticker', not 'symbol' as the EOD/intraday rows do.
  async searchTickers(params: SearchTickersParams): Promise<MarketstackTickerSearchResults> {
    this.ensureConfigured()
    const search = params.query.trim()
    if (search.length === 0) {
      throw new Error('query must not be empty')
    }
    const query: Record<string, string> = { search, limit: String(params.limit) }
    const data = await cachedProviderJson({
      cacheKey: cacheKeyFor(TICKERS_LIST_PATH, query),
      ttlMs: SEARCH_CACHE_TTL_MS,
      fetchFn: async () => this.fetchJson(TICKERS_LIST_PATH, query)
    })
    const parsed = MarketstackTickersListResponseSchema.parse(data)
    return MarketstackTickerSearchResultsSchema.parse({
      source: 'marketstack',
      results: parsed.data.map((row) => ({
        name: row.name ?? null,
        ticker: row.ticker ?? null,
        has_intraday: row.has_intraday ?? null,
        has_eod: row.has_eod ?? null,
        exchange: isNullish(row.stock_exchange)
          ? null
          : {
              name: row.stock_exchange.name ?? null,
              acronym: row.stock_exchange.acronym ?? null,
              mic: row.stock_exchange.mic ?? null
            }
      }))
    })
  }

  // Compact profile for one ticker via /v2/tickers/{symbol} (bare object).
  async getTickerProfile(params: GetTickerProfileParams): Promise<MarketstackTickerProfile> {
    this.ensureConfigured()
    const symbol = params.symbol.trim().toUpperCase()
    if (symbol.length === 0) {
      throw new Error('symbol must not be empty')
    }
    const path = `${TICKERS_PATH_PREFIX}${encodeURIComponent(symbol)}`
    const data = await cachedProviderJson({
      cacheKey: cacheKeyFor(path, {}),
      ttlMs: TICKER_CACHE_TTL_MS,
      fetchFn: async () => this.fetchJson(path, {})
    })
    // Documented as a bare object, but unwrap a {data: {...}} envelope
    // defensively in case the provider wraps single resources too.
    const body = isRecord(data) && isRecord(data.data) ? data.data : data
    const parsed = MarketstackTickerProfileResponseSchema.parse(body)
    return MarketstackTickerProfileSchema.parse({
      source: 'marketstack',
      name: parsed.name ?? null,
      ticker: parsed.ticker ?? parsed.symbol ?? null,
      cik: isNullish(parsed.cik) ? null : String(parsed.cik),
      isin: parsed.isin ?? null,
      sector: parsed.sector ?? null,
      industry: parsed.industry ?? null,
      exchange: isNullish(parsed.stock_exchange)
        ? null
        : {
            name: parsed.stock_exchange.name ?? null,
            acronym: parsed.stock_exchange.acronym ?? null,
            mic: parsed.stock_exchange.mic ?? null,
            country: parsed.stock_exchange.country ?? null
          }
    })
  }

  private async fetchJson(path: string, query: Readonly<Record<string, string>>): Promise<unknown> {
    const url = new URL(path, MARKETSTACK_BASE_URL)
    for (const [name, value] of Object.entries(query)) {
      url.searchParams.set(name, value)
    }
    // The access_key is attached only here — after cache keys were derived from
    // `query` — and is passed as a secret so error text can never leak it.
    url.searchParams.set('access_key', this.apiKey)
    return providerFetchJson({ provider: 'marketstack', url, secrets: [this.apiKey] })
  }
}

// Logical cache key from the endpoint path plus the exact non-secret query sent.
// The API key is deliberately NOT part of `query` (see fetchJson).
function cacheKeyFor(path: string, query: Readonly<Record<string, string>>): string {
  return `marketstack:${path}:${new URLSearchParams(query).toString()}`
}

// Comma-separated symbol list: trimmed, uppercased, empties dropped.
function ensureSymbolList(symbols: string): string {
  const list = compactMap(
    symbols.split(',').map((symbol) => {
      const trimmed = symbol.trim().toUpperCase()
      return trimmed.length > 0 ? trimmed : null
    })
  ).join(',')
  if (list.length === 0) {
    throw new Error('symbols must contain at least one ticker, e.g. AAPL or AAPL,MSFT')
  }
  return list
}
