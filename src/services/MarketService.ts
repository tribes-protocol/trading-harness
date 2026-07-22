import type {
  CoinGeckoMoversRow,
  MarketCapHistory,
  MarketCategories,
  MarketDefiSnapshot,
  MarketGlobalSnapshot,
  MarketHistoryDays,
  MarketMoverRow,
  MarketMovers,
  MarketMoversDuration,
  MarketNewCoins,
  MarketPrices,
  MarketSearchResults,
  MarketTopCoins,
  MarketTrending
} from '@/types/Market'
import {
  CoinGeckoCategoryRowSchema,
  CoinGeckoDefiResponseSchema,
  CoinGeckoGlobalResponseSchema,
  CoinGeckoMarketCapChartResponseSchema,
  CoinGeckoMarketsRowSchema,
  CoinGeckoMoversResponseSchema,
  CoinGeckoNewCoinRowSchema,
  CoinGeckoSearchResponseSchema,
  CoinGeckoSimplePriceResponseSchema,
  CoinGeckoTrendingResponseSchema,
  MarketCapHistorySchema,
  MarketCategoriesSchema,
  MarketDefiSnapshotSchema,
  MarketGlobalSnapshotSchema,
  MarketMoversSchema,
  MarketNewCoinsSchema,
  MarketPricesSchema,
  MarketSearchResultsSchema,
  MarketTopCoinsSchema,
  MarketTrendingSchema
} from '@/types/Market'
import { compactMap, isNullish } from '@/utils/Lang'

type MarketServiceParams = {
  readonly apiKey: string
}

type GetHistoryParams = {
  readonly days: MarketHistoryDays
}

type GetTopCoinsParams = {
  readonly limit: number
}

type GetMoversParams = {
  readonly duration: MarketMoversDuration
}

type GetCategoriesParams = {
  readonly limit: number
}

type GetNewCoinsParams = {
  readonly limit: number
}

type GetPricesParams = {
  readonly ids: string[]
}

type SearchParams = {
  readonly query: string
}

const COINGECKO_PRO_BASE_URL = 'https://pro-api.coingecko.com/'
const COINGECKO_KEY_HEADER = 'x-cg-pro-api-key'
const ERROR_BODY_MAX_CHARS = 300

export class MarketService {
  private readonly apiKey: string

  constructor(params: MarketServiceParams) {
    this.apiKey = params.apiKey
  }

  async getGlobal(): Promise<MarketGlobalSnapshot> {
    const raw = await this.fetch('api/v3/global', {})
    const parsed = CoinGeckoGlobalResponseSchema.parse(raw)
    const data = parsed.data
    return MarketGlobalSnapshotSchema.parse({
      source: 'coingecko',
      active_cryptocurrencies: data.active_cryptocurrencies,
      markets: data.markets,
      market_cap_usd: data.total_market_cap?.usd,
      volume_24h_usd: data.total_volume?.usd,
      btc_dominance_pct: data.market_cap_percentage?.btc,
      eth_dominance_pct: data.market_cap_percentage?.eth,
      market_cap_change_24h_pct: data.market_cap_change_percentage_24h_usd,
      updated_at: data.updated_at
    })
  }

  async getDefi(): Promise<MarketDefiSnapshot> {
    const raw = await this.fetch('api/v3/global/decentralized_finance_defi', {})
    const parsed = CoinGeckoDefiResponseSchema.parse(raw)
    const data = parsed.data
    return MarketDefiSnapshotSchema.parse({
      source: 'coingecko',
      defi_market_cap_usd: this.asFiniteNumber(data.defi_market_cap),
      trading_volume_24h_usd: this.asFiniteNumber(data.trading_volume_24h),
      defi_dominance_pct: this.asFiniteNumber(data.defi_dominance),
      top_coin_name: data.top_coin_name,
      top_coin_dominance_pct: data.top_coin_defi_dominance
    })
  }

  async getHistory(params: GetHistoryParams): Promise<MarketCapHistory> {
    const raw = await this.fetch('api/v3/global/market_cap_chart', { days: params.days })
    const parsed = CoinGeckoMarketCapChartResponseSchema.parse(raw)
    const chart = parsed.market_cap_chart
    return MarketCapHistorySchema.parse({
      source: 'coingecko',
      days: params.days,
      market_cap: (chart.market_cap ?? []).map((point) => ({ t: point[0], usd: point[1] })),
      volume: (chart.volume ?? []).map((point) => ({ t: point[0], usd: point[1] }))
    })
  }

  async getTopCoins(params: GetTopCoinsParams): Promise<MarketTopCoins> {
    const raw = await this.fetch('api/v3/coins/markets', {
      vs_currency: 'usd',
      order: 'market_cap_desc',
      per_page: String(params.limit),
      page: '1',
      price_change_percentage: '1h,24h,7d'
    })
    const rows = CoinGeckoMarketsRowSchema.array().parse(raw)
    return MarketTopCoinsSchema.parse({
      source: 'coingecko',
      coins: rows.map((row) => ({
        id: row.id,
        symbol: row.symbol,
        name: row.name,
        rank: row.market_cap_rank,
        price_usd: row.current_price,
        market_cap_usd: row.market_cap,
        volume_24h_usd: row.total_volume,
        change_1h_pct: row.price_change_percentage_1h_in_currency,
        change_24h_pct: row.price_change_percentage_24h_in_currency,
        change_7d_pct: row.price_change_percentage_7d_in_currency
      }))
    })
  }

  async getMovers(params: GetMoversParams): Promise<MarketMovers> {
    const raw = await this.fetch('api/v3/coins/top_gainers_losers', {
      vs_currency: 'usd',
      duration: params.duration
    })
    const parsed = CoinGeckoMoversResponseSchema.parse(raw)
    const changeField = `usd_${params.duration}_change`
    const shapeRow = (row: CoinGeckoMoversRow): MarketMoverRow => ({
      id: row.id,
      symbol: row.symbol,
      name: row.name,
      rank: row.market_cap_rank,
      price_usd: row.usd,
      volume_24h_usd: row.usd_24h_vol,
      change_pct: this.asFiniteNumber(row[changeField])
    })
    return MarketMoversSchema.parse({
      source: 'coingecko',
      duration: params.duration,
      gainers: (parsed.top_gainers ?? []).map(shapeRow),
      losers: (parsed.top_losers ?? []).map(shapeRow)
    })
  }

  async getCategories(params: GetCategoriesParams): Promise<MarketCategories> {
    const raw = await this.fetch('api/v3/coins/categories', { order: 'market_cap_desc' })
    const rows = CoinGeckoCategoryRowSchema.array().parse(raw)
    return MarketCategoriesSchema.parse({
      source: 'coingecko',
      categories: rows.slice(0, params.limit).map((row) => ({
        id: row.id,
        name: row.name,
        market_cap_usd: row.market_cap,
        change_24h_pct: row.market_cap_change_24h,
        volume_24h_usd: row.volume_24h,
        top_coins: compactMap(row.top_3_coins_id ?? [])
      }))
    })
  }

  async getNewCoins(params: GetNewCoinsParams): Promise<MarketNewCoins> {
    const raw = await this.fetch('api/v3/coins/list/new', {})
    const rows = CoinGeckoNewCoinRowSchema.array().parse(raw)
    return MarketNewCoinsSchema.parse({
      source: 'coingecko',
      coins: rows.slice(0, params.limit).map((row) => ({
        id: row.id,
        symbol: row.symbol,
        name: row.name,
        activated_at: row.activated_at
      }))
    })
  }

  async getPrices(params: GetPricesParams): Promise<MarketPrices> {
    const raw = await this.fetch('api/v3/simple/price', {
      ids: params.ids.join(','),
      vs_currencies: 'usd',
      include_market_cap: 'true',
      include_24hr_vol: 'true',
      include_24hr_change: 'true',
      include_last_updated_at: 'true'
    })
    const parsed = CoinGeckoSimplePriceResponseSchema.parse(raw)
    const prices = compactMap(
      params.ids.map((id) => {
        const entry = parsed[id]
        if (isNullish(entry)) {
          return null
        }
        return {
          id,
          price_usd: entry.usd,
          market_cap_usd: entry.usd_market_cap,
          volume_24h_usd: entry.usd_24h_vol,
          change_24h_pct: entry.usd_24h_change,
          updated_at: entry.last_updated_at
        }
      })
    )
    return MarketPricesSchema.parse({ source: 'coingecko', prices })
  }

  async search(params: SearchParams): Promise<MarketSearchResults> {
    const raw = await this.fetch('api/v3/search', { query: params.query })
    const parsed = CoinGeckoSearchResponseSchema.parse(raw)
    return MarketSearchResultsSchema.parse({
      source: 'coingecko',
      query: params.query,
      coins: (parsed.coins ?? []).map((coin) => ({
        id: coin.id,
        symbol: coin.symbol,
        name: coin.name,
        rank: coin.market_cap_rank
      }))
    })
  }

  async getTrending(): Promise<MarketTrending> {
    const raw = await this.fetch('api/v3/search/trending', {})
    const parsed = CoinGeckoTrendingResponseSchema.parse(raw)
    return MarketTrendingSchema.parse({
      source: 'coingecko',
      coins: (parsed.coins ?? []).map((coin) => ({
        id: coin.item.id,
        symbol: coin.item.symbol,
        name: coin.item.name,
        rank: coin.item.market_cap_rank,
        price_usd: coin.item.data?.price,
        change_24h_pct: coin.item.data?.price_change_percentage_24h?.usd
      }))
    })
  }

  private async fetch(path: string, searchParams: Record<string, string>): Promise<unknown> {
    if (this.apiKey === '') {
      throw new Error(
        'COIN_GECKO_PRO_API_KEY is not set — the `market` command group is unavailable on this box'
      )
    }
    const url = new URL(path, COINGECKO_PRO_BASE_URL)
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, value)
    }
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        [COINGECKO_KEY_HEADER]: this.apiKey
      }
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(
        `CoinGecko /${path} failed: ${response.status} ${response.statusText} ${body.slice(0, ERROR_BODY_MAX_CHARS)}`
      )
    }
    const data: unknown = await response.json()
    return data
  }

  // Accepts CoinGecko's mixed numeric encodings (decimal strings on the DeFi
  // endpoint, numbers elsewhere); anything non-finite collapses to null.
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
