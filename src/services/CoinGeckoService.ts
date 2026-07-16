import { cachedProviderJson } from '@/helpers/ProviderCache'
import { providerFetchJson } from '@/helpers/ProviderHttp'
import type {
  CoinGeckoChangeWindow,
  CoinGeckoCoinProfile,
  CoinGeckoGlobalSnapshot,
  CoinGeckoOhlcDays,
  CoinGeckoOhlcSeries,
  CoinGeckoOrder,
  CoinGeckoPrices,
  CoinGeckoSearchResults,
  CoinGeckoTopCoins,
  CoinGeckoTrendingCoins
} from '@/types/CoinGecko'
import {
  CoinGeckoCoinProfileSchema,
  CoinGeckoCoinResponseSchema,
  CoinGeckoGlobalResponseSchema,
  CoinGeckoGlobalSnapshotSchema,
  CoinGeckoMarketsResponseSchema,
  CoinGeckoOhlcResponseSchema,
  CoinGeckoOhlcSeriesSchema,
  CoinGeckoPricesSchema,
  CoinGeckoSearchResponseSchema,
  CoinGeckoSearchResultsSchema,
  CoinGeckoSimplePriceResponseSchema,
  CoinGeckoTopCoinsSchema,
  CoinGeckoTrendingCoinsSchema,
  CoinGeckoTrendingResponseSchema
} from '@/types/CoinGecko'
import { compactMap, isNullish } from '@/utils/Lang'

// Direct CoinGecko Pro integration (crypto market data for the `market-data` CLI).
// Auth: Pro keys only, sent via the `x-cg-pro-api-key` header against
// pro-api.coingecko.com — demo keys are NOT supported here (the Pro host rejects
// them with error_code 10011). Docs: docs.coingecko.com.
// Every response is cached read-through (TTL per endpoint below); the RAW payload
// is cached and zod-parsed after retrieval so corrupt cache entries fail loudly.

const COINGECKO_BASE_URL = 'https://pro-api.coingecko.com'
const SIMPLE_PRICE_PATH = '/api/v3/simple/price'
const COINS_MARKETS_PATH = '/api/v3/coins/markets'
const GLOBAL_PATH = '/api/v3/global'
const TRENDING_PATH = '/api/v3/search/trending'
const SEARCH_PATH = '/api/v3/search'

const PRICES_CACHE_TTL_MS = 60 * 1000
const TOP_CACHE_TTL_MS = 2 * 60 * 1000
const GLOBAL_CACHE_TTL_MS = 5 * 60 * 1000
const TRENDING_CACHE_TTL_MS = 10 * 60 * 1000
const COIN_CACHE_TTL_MS = 10 * 60 * 1000
const OHLC_CACHE_TTL_MS = 5 * 60 * 1000
const SEARCH_CACHE_TTL_MS = 24 * 60 * 60 * 1000

const COIN_DESCRIPTION_MAX_CHARS = 1200

type CoinGeckoServiceParams = {
  readonly apiKey: string
}

type GetPricesParams = {
  readonly ids: readonly string[]
  readonly vs: string
}

type GetTopParams = {
  readonly vs: string
  readonly limit: number
  readonly page: number
  readonly category: string | null
  readonly change: readonly CoinGeckoChangeWindow[] | null
  readonly order: CoinGeckoOrder
}

type GetCoinParams = {
  readonly id: string
}

type GetOhlcParams = {
  readonly id: string
  readonly days: CoinGeckoOhlcDays
  readonly vs: string
}

type SearchParams = {
  readonly query: string
}

export class CoinGeckoService {
  private readonly apiKey: string

  constructor(params: CoinGeckoServiceParams) {
    this.apiKey = params.apiKey
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0
  }

  private ensureConfigured(): void {
    if (!this.isConfigured()) {
      throw new Error('COIN_GECKO_PRO_API_KEY is not set; direct CoinGecko market data is disabled')
    }
  }

  // Multi-coin spot prices; the keyed-object response is flattened to one row
  // per requested id (ids missing from the response are dropped).
  async getPrices(params: GetPricesParams): Promise<CoinGeckoPrices> {
    this.ensureConfigured()
    const ids = compactMap(
      params.ids.map((id) => {
        const normalized = id.trim().toLowerCase()
        return normalized.length > 0 ? normalized : null
      })
    )
    const vs = params.vs.trim().toLowerCase()
    const data = await cachedProviderJson({
      cacheKey: `coingecko:simple-price:${ids.join(',')}:${vs}`,
      ttlMs: PRICES_CACHE_TTL_MS,
      fetchFn: async () =>
        this.fetchJson({
          path: SIMPLE_PRICE_PATH,
          searchParams: {
            ids: ids.join(','),
            vs_currencies: vs,
            include_market_cap: 'true',
            include_24hr_vol: 'true',
            include_24hr_change: 'true',
            include_last_updated_at: 'true'
          }
        })
    })
    const parsed = CoinGeckoSimplePriceResponseSchema.parse(data)
    const prices = compactMap(
      ids.map((id) => {
        const entry = parsed[id]
        if (isNullish(entry)) {
          return null
        }
        return {
          id,
          vs,
          price: entry[vs] ?? null,
          market_cap: entry[`${vs}_market_cap`] ?? null,
          volume_24h: entry[`${vs}_24h_vol`] ?? null,
          change_24h_pct: entry[`${vs}_24h_change`] ?? null,
          last_updated_at: entry.last_updated_at ?? null
        }
      })
    )
    return CoinGeckoPricesSchema.parse({ source: 'coingecko', prices })
  }

  // Ranked coin list (coins/markets); requested change windows map onto the
  // provider's *_in_currency fields as change_1h_pct/change_24h_pct/change_7d_pct.
  async getTop(params: GetTopParams): Promise<CoinGeckoTopCoins> {
    this.ensureConfigured()
    const vs = params.vs.trim().toLowerCase()
    const change = params.change ?? []
    const searchParams: Record<string, string> = {
      vs_currency: vs,
      order: params.order,
      per_page: String(params.limit),
      page: String(params.page)
    }
    if (!isNullish(params.category)) {
      searchParams.category = params.category
    }
    if (change.length > 0) {
      searchParams.price_change_percentage = change.join(',')
    }
    const data = await cachedProviderJson({
      cacheKey:
        `coingecko:coins-markets:${vs}:${params.order}:${params.limit}:${params.page}` +
        `:${params.category ?? ''}:${change.join(',')}`,
      ttlMs: TOP_CACHE_TTL_MS,
      fetchFn: async () => this.fetchJson({ path: COINS_MARKETS_PATH, searchParams })
    })
    const parsed = CoinGeckoMarketsResponseSchema.parse(data)
    const coins = parsed.map((row) => ({
      id: row.id,
      symbol: row.symbol ?? null,
      name: row.name ?? null,
      current_price: row.current_price ?? null,
      market_cap: row.market_cap ?? null,
      market_cap_rank: row.market_cap_rank ?? null,
      total_volume: row.total_volume ?? null,
      high_24h: row.high_24h ?? null,
      low_24h: row.low_24h ?? null,
      price_change_percentage_24h: row.price_change_percentage_24h ?? null,
      circulating_supply: row.circulating_supply ?? null,
      change_1h_pct: row.price_change_percentage_1h_in_currency ?? null,
      change_24h_pct: row.price_change_percentage_24h_in_currency ?? null,
      change_7d_pct: row.price_change_percentage_7d_in_currency ?? null
    }))
    return CoinGeckoTopCoinsSchema.parse({ source: 'coingecko', vs, coins })
  }

  // Global market aggregates; the provider wraps the payload in {data: {...}}.
  async getGlobal(): Promise<CoinGeckoGlobalSnapshot> {
    this.ensureConfigured()
    const data = await cachedProviderJson({
      cacheKey: 'coingecko:global',
      ttlMs: GLOBAL_CACHE_TTL_MS,
      fetchFn: async () => this.fetchJson({ path: GLOBAL_PATH, searchParams: {} })
    })
    const parsed = CoinGeckoGlobalResponseSchema.parse(data)
    const snapshot = parsed.data
    return CoinGeckoGlobalSnapshotSchema.parse({
      source: 'coingecko',
      active_cryptocurrencies: snapshot.active_cryptocurrencies ?? null,
      markets: snapshot.markets ?? null,
      total_market_cap_usd: snapshot.total_market_cap?.usd ?? null,
      total_volume_usd: snapshot.total_volume?.usd ?? null,
      btc_dominance_pct: snapshot.market_cap_percentage?.btc ?? null,
      eth_dominance_pct: snapshot.market_cap_percentage?.eth ?? null,
      market_cap_change_percentage_24h_usd: snapshot.market_cap_change_percentage_24h_usd ?? null,
      updated_at: snapshot.updated_at ?? null
    })
  }

  // Trending searches; coins[].item.data mixes numbers with formatted display
  // strings, so only reliably numeric fields are surfaced (others become null).
  async getTrending(): Promise<CoinGeckoTrendingCoins> {
    this.ensureConfigured()
    const data = await cachedProviderJson({
      cacheKey: 'coingecko:trending',
      ttlMs: TRENDING_CACHE_TTL_MS,
      fetchFn: async () => this.fetchJson({ path: TRENDING_PATH, searchParams: {} })
    })
    const parsed = CoinGeckoTrendingResponseSchema.parse(data)
    const coins = (parsed.coins ?? []).map(({ item }) => ({
      id: item.id,
      symbol: item.symbol ?? null,
      name: item.name ?? null,
      market_cap_rank: item.market_cap_rank ?? null,
      price_usd: toFiniteNumber(item.data?.price),
      change_24h_usd_pct: toFiniteNumber(item.data?.price_change_percentage_24h?.usd)
    }))
    return CoinGeckoTrendingCoinsSchema.parse({ source: 'coingecko', coins })
  }

  // Compact research profile for one coin (market data only; localization,
  // tickers, community and developer payloads are explicitly disabled).
  async getCoin(params: GetCoinParams): Promise<CoinGeckoCoinProfile> {
    this.ensureConfigured()
    const id = params.id.trim().toLowerCase()
    const data = await cachedProviderJson({
      cacheKey: `coingecko:coin:${id}`,
      ttlMs: COIN_CACHE_TTL_MS,
      fetchFn: async () =>
        this.fetchJson({
          path: `/api/v3/coins/${encodeURIComponent(id)}`,
          searchParams: {
            localization: 'false',
            tickers: 'false',
            market_data: 'true',
            community_data: 'false',
            developer_data: 'false',
            sparkline: 'false'
          }
        })
    })
    const parsed = CoinGeckoCoinResponseSchema.parse(data)
    const market = parsed.market_data
    return CoinGeckoCoinProfileSchema.parse({
      source: 'coingecko',
      id: parsed.id,
      symbol: parsed.symbol ?? null,
      name: parsed.name ?? null,
      description: toTruncatedDescription(parsed.description?.en),
      homepage: toFirstNonEmpty(parsed.links?.homepage),
      categories: compactMap(parsed.categories ?? []),
      market_cap_rank: parsed.market_cap_rank ?? null,
      platforms: toPlatformMap(parsed.platforms),
      market: {
        price_usd: market?.current_price?.usd ?? null,
        market_cap_usd: market?.market_cap?.usd ?? null,
        fdv_usd: market?.fully_diluted_valuation?.usd ?? null,
        volume_24h_usd: market?.total_volume?.usd ?? null,
        change_24h_pct: market?.price_change_percentage_24h ?? null,
        change_7d_pct: market?.price_change_percentage_7d ?? null,
        change_30d_pct: market?.price_change_percentage_30d ?? null,
        ath_usd: market?.ath?.usd ?? null,
        ath_date: market?.ath_date?.usd ?? null,
        atl_usd: market?.atl?.usd ?? null,
        atl_date: market?.atl_date?.usd ?? null,
        circulating_supply: market?.circulating_supply ?? null,
        total_supply: market?.total_supply ?? null,
        max_supply: market?.max_supply ?? null
      },
      sentiment_votes_up_percentage: parsed.sentiment_votes_up_percentage ?? null,
      genesis_date: parsed.genesis_date ?? null
    })
  }

  // OHLC candles as [timestamp_ms, o, h, l, c] tuples. The `interval` param is
  // deliberately never sent — it is gated to higher paid plans (error 10005).
  async getOhlc(params: GetOhlcParams): Promise<CoinGeckoOhlcSeries> {
    this.ensureConfigured()
    const id = params.id.trim().toLowerCase()
    const vs = params.vs.trim().toLowerCase()
    const data = await cachedProviderJson({
      cacheKey: `coingecko:ohlc:${id}:${vs}:${params.days}`,
      ttlMs: OHLC_CACHE_TTL_MS,
      fetchFn: async () =>
        this.fetchJson({
          path: `/api/v3/coins/${encodeURIComponent(id)}/ohlc`,
          searchParams: { vs_currency: vs, days: params.days }
        })
    })
    const parsed = CoinGeckoOhlcResponseSchema.parse(data)
    const candles = parsed.map((candle) => ({
      time_ms: candle[0],
      open: candle[1],
      high: candle[2],
      low: candle[3],
      close: candle[4]
    }))
    return CoinGeckoOhlcSeriesSchema.parse({
      source: 'coingecko',
      id,
      vs,
      days: params.days,
      candles
    })
  }

  // Coin search by name or symbol; only the coins block is surfaced.
  async search(params: SearchParams): Promise<CoinGeckoSearchResults> {
    this.ensureConfigured()
    const query = params.query.trim()
    const data = await cachedProviderJson({
      cacheKey: `coingecko:search:${query.toLowerCase()}`,
      ttlMs: SEARCH_CACHE_TTL_MS,
      fetchFn: async () => this.fetchJson({ path: SEARCH_PATH, searchParams: { query } })
    })
    const parsed = CoinGeckoSearchResponseSchema.parse(data)
    const coins = (parsed.coins ?? []).map((coin) => ({
      id: coin.id,
      symbol: coin.symbol ?? null,
      name: coin.name ?? null,
      market_cap_rank: coin.market_cap_rank ?? null
    }))
    return CoinGeckoSearchResultsSchema.parse({ source: 'coingecko', query, coins })
  }

  private async fetchJson(params: {
    readonly path: string
    readonly searchParams: Readonly<Record<string, string>>
  }): Promise<unknown> {
    const url = new URL(params.path, COINGECKO_BASE_URL)
    for (const [key, value] of Object.entries(params.searchParams)) {
      url.searchParams.set(key, value)
    }
    return providerFetchJson({
      provider: 'coingecko',
      url,
      headers: { 'x-cg-pro-api-key': this.apiKey },
      secrets: [this.apiKey]
    })
  }
}

// Accepts real numbers and plain numeric strings; formatted display strings
// ("$205,847,196", "12%") and everything else normalize to null.
function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.length > 0) {
      const parsed = Number(trimmed)
      if (Number.isFinite(parsed)) {
        return parsed
      }
    }
  }
  return null
}

function toTruncatedDescription(value: string | null | undefined): string | null {
  if (isNullish(value)) {
    return null
  }
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return null
  }
  return trimmed.slice(0, COIN_DESCRIPTION_MAX_CHARS)
}

function toFirstNonEmpty(values: (string | null | undefined)[] | null | undefined): string | null {
  for (const value of values ?? []) {
    if (!isNullish(value) && value.trim().length > 0) {
      return value
    }
  }
  return null
}

// Native coins arrive as {"": ""}; drop empty keys/values so the normalized
// platforms map only carries real contract addresses.
function toPlatformMap(
  platforms: Record<string, string | null | undefined> | null | undefined
): Record<string, string> {
  const entries: [string, string][] = []
  for (const [key, value] of Object.entries(platforms ?? {})) {
    if (key.length > 0 && !isNullish(value) && value.length > 0) {
      entries.push([key, value])
    }
  }
  return Object.fromEntries(entries)
}
