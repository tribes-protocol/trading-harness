import type {
  CoinCandles,
  CoinChart,
  CoinContract,
  CoinDays,
  CoinExchangeRates,
  CoinProfile,
  CoinSupplyHistory,
  CoinTickers
} from '@/types/Coin'
import {
  CoinCandlesSchema,
  CoinChartSchema,
  CoinContractSchema,
  CoinExchangeRatesSchema,
  CoinGeckoCoinProfileResponseSchema,
  CoinGeckoContractResponseSchema,
  CoinGeckoExchangeRatesResponseSchema,
  CoinGeckoMarketChartResponseSchema,
  CoinGeckoOhlcResponseSchema,
  CoinGeckoSupplyChartResponseSchema,
  CoinGeckoTickersResponseSchema,
  CoinProfileSchema,
  CoinSupplyHistorySchema,
  CoinTickersSchema
} from '@/types/Coin'
import { compactMap, isNullish } from '@/utils/Lang'

type CoinServiceParams = {
  readonly apiKey: string
}

type GetProfileParams = {
  readonly id: string
}

type GetChartParams = {
  readonly id: string
  readonly days: CoinDays
}

type GetOhlcParams = {
  readonly id: string
  readonly days: CoinDays
}

type GetTickersParams = {
  readonly id: string
  readonly limit: number
}

type GetContractParams = {
  readonly platform: string
  readonly address: string
}

type GetSupplyHistoryParams = {
  readonly id: string
  readonly days: CoinDays
}

const COINGECKO_PRO_BASE_URL = 'https://pro-api.coingecko.com/'
const COINGECKO_KEY_HEADER = 'x-cg-pro-api-key'
const ERROR_BODY_MAX_CHARS = 300
const DESCRIPTION_MAX_CHARS = 1200

export class CoinService {
  private readonly apiKey: string

  constructor(params: CoinServiceParams) {
    this.apiKey = params.apiKey
  }

  async getProfile(params: GetProfileParams): Promise<CoinProfile> {
    const raw = await this.fetch(`api/v3/coins/${encodeURIComponent(params.id)}`, {
      localization: 'false',
      tickers: 'false',
      market_data: 'true',
      community_data: 'true',
      developer_data: 'true',
      sparkline: 'false'
    })
    const parsed = CoinGeckoCoinProfileResponseSchema.parse(raw)
    const market = parsed.market_data
    const description = parsed.description?.en
    return CoinProfileSchema.parse({
      source: 'coingecko',
      id: parsed.id,
      symbol: parsed.symbol,
      name: parsed.name,
      rank: parsed.market_cap_rank,
      price_usd: market?.current_price?.usd,
      market_cap_usd: market?.market_cap?.usd,
      fdv_usd: market?.fully_diluted_valuation?.usd,
      volume_24h_usd: market?.total_volume?.usd,
      high_24h_usd: market?.high_24h?.usd,
      low_24h_usd: market?.low_24h?.usd,
      change_24h_pct: market?.price_change_percentage_24h,
      change_7d_pct: market?.price_change_percentage_7d,
      change_30d_pct: market?.price_change_percentage_30d,
      ath_usd: market?.ath?.usd,
      ath_change_pct: market?.ath_change_percentage?.usd,
      ath_date: market?.ath_date?.usd,
      atl_usd: market?.atl?.usd,
      atl_change_pct: market?.atl_change_percentage?.usd,
      atl_date: market?.atl_date?.usd,
      circulating_supply: market?.circulating_supply,
      total_supply: market?.total_supply,
      max_supply: market?.max_supply,
      sentiment_up_pct: parsed.sentiment_votes_up_percentage,
      sentiment_down_pct: parsed.sentiment_votes_down_percentage,
      twitter_followers: parsed.community_data?.twitter_followers,
      reddit_subscribers: parsed.community_data?.reddit_subscribers,
      github_stars: parsed.developer_data?.stars,
      github_forks: parsed.developer_data?.forks,
      commits_4w: parsed.developer_data?.commit_count_4_weeks,
      categories: compactMap(parsed.categories ?? []),
      links: {
        homepage: this.firstNonEmpty(parsed.links?.homepage),
        twitter: parsed.links?.twitter_screen_name,
        subreddit: parsed.links?.subreddit_url,
        github: this.firstNonEmpty(parsed.links?.repos_url?.github)
      },
      description: isNullish(description) ? null : description.slice(0, DESCRIPTION_MAX_CHARS)
    })
  }

  async getChart(params: GetChartParams): Promise<CoinChart> {
    const raw = await this.fetch(`api/v3/coins/${encodeURIComponent(params.id)}/market_chart`, {
      vs_currency: 'usd',
      days: params.days
    })
    const parsed = CoinGeckoMarketChartResponseSchema.parse(raw)
    return CoinChartSchema.parse({
      source: 'coingecko',
      id: params.id,
      days: params.days,
      prices: (parsed.prices ?? []).map((point) => ({ t: point[0], usd: point[1] })),
      market_caps: (parsed.market_caps ?? []).map((point) => ({ t: point[0], usd: point[1] })),
      volumes: (parsed.total_volumes ?? []).map((point) => ({ t: point[0], usd: point[1] }))
    })
  }

  async getOhlc(params: GetOhlcParams): Promise<CoinCandles> {
    const raw = await this.fetch(`api/v3/coins/${encodeURIComponent(params.id)}/ohlc`, {
      vs_currency: 'usd',
      days: params.days
    })
    const rows = CoinGeckoOhlcResponseSchema.parse(raw)
    return CoinCandlesSchema.parse({
      source: 'coingecko',
      candles: rows.map((row) => ({
        t: row[0],
        o: row[1],
        h: row[2],
        l: row[3],
        c: row[4],
        v: null
      }))
    })
  }

  async getTickers(params: GetTickersParams): Promise<CoinTickers> {
    const raw = await this.fetch(`api/v3/coins/${encodeURIComponent(params.id)}/tickers`, {})
    const parsed = CoinGeckoTickersResponseSchema.parse(raw)
    return CoinTickersSchema.parse({
      source: 'coingecko',
      id: params.id,
      tickers: (parsed.tickers ?? []).slice(0, params.limit).map((ticker) => ({
        market: ticker.market?.name,
        pair:
          isNullish(ticker.base) || isNullish(ticker.target)
            ? null
            : `${ticker.base}/${ticker.target}`,
        price_usd: ticker.converted_last?.usd,
        volume_24h_usd: ticker.converted_volume?.usd,
        trust_score: ticker.trust_score
      }))
    })
  }

  async getContract(params: GetContractParams): Promise<CoinContract> {
    const raw = await this.fetch(
      `api/v3/coins/${encodeURIComponent(params.platform)}/contract/${encodeURIComponent(params.address)}`,
      {}
    )
    const parsed = CoinGeckoContractResponseSchema.parse(raw)
    const market = parsed.market_data
    return CoinContractSchema.parse({
      source: 'coingecko',
      id: parsed.id,
      symbol: parsed.symbol,
      name: parsed.name,
      rank: parsed.market_cap_rank,
      platform: params.platform,
      address: parsed.contract_address ?? params.address,
      price_usd: market?.current_price?.usd,
      market_cap_usd: market?.market_cap?.usd,
      fdv_usd: market?.fully_diluted_valuation?.usd,
      volume_24h_usd: market?.total_volume?.usd,
      change_24h_pct: market?.price_change_percentage_24h
    })
  }

  async getSupplyHistory(params: GetSupplyHistoryParams): Promise<CoinSupplyHistory> {
    const raw = await this.fetch(
      `api/v3/coins/${encodeURIComponent(params.id)}/circulating_supply_chart`,
      { days: params.days }
    )
    const parsed = CoinGeckoSupplyChartResponseSchema.parse(raw)
    return CoinSupplyHistorySchema.parse({
      source: 'coingecko',
      id: params.id,
      days: params.days,
      supply: (parsed.circulating_supply ?? []).map((point) => ({
        t: point[0],
        supply: this.asFiniteNumber(point[1])
      }))
    })
  }

  async getRates(): Promise<CoinExchangeRates> {
    const raw = await this.fetch('api/v3/exchange_rates', {})
    const parsed = CoinGeckoExchangeRatesResponseSchema.parse(raw)
    return CoinExchangeRatesSchema.parse({
      source: 'coingecko',
      base: 'btc',
      rates: Object.entries(parsed.rates).map(([id, rate]) => ({
        id,
        name: rate.name,
        unit: rate.unit,
        value: rate.value,
        type: rate.type
      }))
    })
  }

  private async fetch(path: string, searchParams: Record<string, string>): Promise<unknown> {
    if (this.apiKey === '') {
      throw new Error(
        'COIN_GECKO_PRO_API_KEY is not set — the `coin` command group is unavailable on this box'
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

  private firstNonEmpty(values: (string | null | undefined)[] | null | undefined): string | null {
    const found = compactMap(values ?? []).find((value) => value.trim() !== '')
    return found ?? null
  }

  // Accepts CoinGecko's mixed numeric encodings (decimal strings on the
  // supply-chart endpoint, numbers elsewhere); anything non-finite collapses
  // to null.
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
