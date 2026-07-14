import type { z } from 'zod'

import type {
  CoinGeckoCoinDetail,
  CoinGeckoDays,
  CoinGeckoInterval,
  CoinGeckoMarketChart,
  CoinGeckoOhlcDays,
  CoinGeckoSimplePrice,
  CoinHistorySnapshot,
  CoinProfile,
  CoinSearchResult,
  CoinTickerRow,
  ExchangeRateRow,
  MarketChartPoint,
  MarketChartResult,
  OhlcResult,
  SupplyChartResult,
  SupplyKind,
  TickersOrder
} from '@/types/CoinGecko'
import {
  CoinGeckoCoinDetailSchema,
  CoinGeckoCoinHistorySchema,
  CoinGeckoCoinTickersSchema,
  CoinGeckoErrorSchema,
  CoinGeckoExchangeRatesSchema,
  CoinGeckoMarketChartSchema,
  CoinGeckoOhlcSchema,
  CoinGeckoSearchSchema,
  CoinGeckoSimplePriceSchema,
  CoinGeckoSupplyChartSchema,
  CoinGeckoSupportedCurrenciesSchema,
  CoinHistorySnapshotSchema,
  CoinProfileSchema,
  CoinSearchResultSchema,
  CoinTickerRowSchema,
  ExchangeRateRowSchema,
  MarketChartPointSchema,
  MarketChartResultSchema,
  OhlcResultSchema,
  SupplyChartResultSchema
} from '@/types/CoinGecko'
import { isNullish } from '@/utils/Lang'

const COIN_GECKO_PRO_BASE_URL = 'https://pro-api.coingecko.com'

type FundamentalsServiceParams = {
  readonly apiKey: string
}

type QueryValue = string | number | boolean | undefined

type RangeParams = {
  readonly from: number | null | undefined
  readonly to: number | null | undefined
}

type MarketChartParams = RangeParams & {
  readonly id: string
  readonly vsCurrency: string
  readonly days: CoinGeckoDays
  readonly interval: CoinGeckoInterval | null | undefined
  readonly precision: string | null | undefined
  readonly limit: number | null | undefined
}

type OhlcParams = RangeParams & {
  readonly id: string
  readonly vsCurrency: string
  readonly days: CoinGeckoOhlcDays
  readonly interval: CoinGeckoInterval | null | undefined
  readonly limit: number | null | undefined
}

type SupplyChartParams = RangeParams & {
  readonly id: string
  readonly kind: SupplyKind
  readonly days: CoinGeckoDays
  readonly limit: number | null | undefined
}

type ContractMarketChartParams = RangeParams & {
  readonly network: string
  readonly address: string
  readonly vsCurrency: string
  readonly days: CoinGeckoDays
  readonly limit: number | null | undefined
}

type TickersParams = {
  readonly id: string
  readonly exchangeIds: string | null | undefined
  readonly page: number | null | undefined
  readonly order: TickersOrder | null | undefined
  readonly limit: number
}

type TokenPriceParams = {
  readonly platform: string
  readonly addresses: string
  readonly vsCurrencies: string
}

/**
 * CoinGecko Pro client: coin profiles, historical charts, supply analytics,
 * exchange tickers, and contract-addressed lookups.
 */
export class FundamentalsService {
  private readonly apiKey: string

  constructor(params: FundamentalsServiceParams) {
    this.apiKey = params.apiKey
  }

  async getCoinProfile(
    id: string,
    include: { readonly community: boolean; readonly developer: boolean }
  ): Promise<CoinProfile> {
    const coin = await this.get(
      `/api/v3/coins/${encodeURIComponent(id)}`,
      CoinGeckoCoinDetailSchema,
      {
        localization: false,
        tickers: false,
        market_data: true,
        community_data: include.community,
        developer_data: include.developer,
        sparkline: false
      }
    )

    return toCoinProfile(coin, include)
  }

  // Every other command is keyed by CoinGecko's coin ID (`render-token`), which
  // is neither the symbol nor the display name, so this is how a caller gets one.
  async searchCoins(query: string, limit: number): Promise<CoinSearchResult[]> {
    const response = await this.get('/api/v3/search', CoinGeckoSearchSchema, { query })

    return (response.coins ?? []).slice(0, limit).map((coin) =>
      CoinSearchResultSchema.parse({
        id: coin.id,
        symbol: coin.symbol,
        name: coin.name,
        rank: coin.market_cap_rank
      })
    )
  }

  async getCoinHistory(id: string, date: string): Promise<CoinHistorySnapshot> {
    const history = await this.get(
      `/api/v3/coins/${encodeURIComponent(id)}/history`,
      CoinGeckoCoinHistorySchema,
      { date, localization: false }
    )

    return CoinHistorySnapshotSchema.parse({
      id: history.id,
      symbol: history.symbol,
      name: history.name,
      date,
      price_usd: usd(history, 'current_price'),
      market_cap_usd: usd(history, 'market_cap'),
      volume_24h_usd: usd(history, 'total_volume')
    })
  }

  async getMarketChart(params: MarketChartParams): Promise<MarketChartResult> {
    const id = encodeURIComponent(params.id)
    const isRange = !isNullish(params.from) && !isNullish(params.to)
    const chart = isRange
      ? await this.get(`/api/v3/coins/${id}/market_chart/range`, CoinGeckoMarketChartSchema, {
          vs_currency: params.vsCurrency,
          from: params.from ?? undefined,
          to: params.to ?? undefined,
          interval: params.interval ?? undefined,
          precision: params.precision ?? undefined
        })
      : await this.get(`/api/v3/coins/${id}/market_chart`, CoinGeckoMarketChartSchema, {
          vs_currency: params.vsCurrency,
          days: params.days,
          interval: params.interval ?? undefined,
          precision: params.precision ?? undefined
        })

    return MarketChartResultSchema.parse({
      id: params.id,
      vs_currency: params.vsCurrency,
      ...toChartPoints(chart, params.limit)
    })
  }

  async getOhlc(params: OhlcParams): Promise<OhlcResult> {
    const id = encodeURIComponent(params.id)
    const isRange = !isNullish(params.from) && !isNullish(params.to)
    const rows = isRange
      ? await this.get(`/api/v3/coins/${id}/ohlc/range`, CoinGeckoOhlcSchema, {
          vs_currency: params.vsCurrency,
          from: params.from ?? undefined,
          to: params.to ?? undefined,
          interval: params.interval ?? undefined
        })
      : await this.get(`/api/v3/coins/${id}/ohlc`, CoinGeckoOhlcSchema, {
          vs_currency: params.vsCurrency,
          days: params.days
        })

    const candles = rows.map(([t, o, h, l, c]) => ({ t: toSeconds(t), o, h, l, c }))
    const limited = takeLatest(candles, params.limit)

    return OhlcResultSchema.parse({
      id: params.id,
      vs_currency: params.vsCurrency,
      count: limited.length,
      candles: limited
    })
  }

  async getSupplyChart(params: SupplyChartParams): Promise<SupplyChartResult> {
    const id = encodeURIComponent(params.id)
    const isRange = !isNullish(params.from) && !isNullish(params.to)
    const segment =
      params.kind === 'circulating' ? 'circulating_supply_chart' : 'total_supply_chart'
    const rows = isRange
      ? await this.get(`/api/v3/coins/${id}/${segment}/range`, CoinGeckoSupplyChartSchema, {
          from: params.from ?? undefined,
          to: params.to ?? undefined
        })
      : await this.get(`/api/v3/coins/${id}/${segment}`, CoinGeckoSupplyChartSchema, {
          days: params.days
        })

    const points = takeLatest(
      rows.map(([t, supply]) => ({ t: toSeconds(t), supply })),
      params.limit
    )

    return SupplyChartResultSchema.parse({
      id: params.id,
      kind: params.kind,
      count: points.length,
      points
    })
  }

  async getTickers(params: TickersParams): Promise<CoinTickerRow[]> {
    const tickers = await this.get(
      `/api/v3/coins/${encodeURIComponent(params.id)}/tickers`,
      CoinGeckoCoinTickersSchema,
      {
        exchange_ids: params.exchangeIds ?? undefined,
        page: params.page ?? undefined,
        order: params.order ?? undefined
      }
    )

    return (tickers.tickers ?? []).slice(0, params.limit).map((ticker) =>
      CoinTickerRowSchema.parse({
        exchange: ticker.market?.name ?? ticker.market?.identifier ?? null,
        base: ticker.base,
        target: ticker.target,
        last: ticker.last,
        volume: ticker.volume,
        converted_last_usd: ticker.converted_last?.usd,
        converted_volume_usd: ticker.converted_volume?.usd,
        trust_score: ticker.trust_score,
        trade_url: ticker.trade_url
      })
    )
  }

  async getContractProfile(network: string, address: string): Promise<CoinProfile> {
    const coin = await this.get(
      `/api/v3/coins/${encodeURIComponent(network)}/contract/${encodeURIComponent(address)}`,
      CoinGeckoCoinDetailSchema
    )

    // The contract endpoint returns the same payload as /coins/{id}, minus the
    // community/developer sections it has no flags for.
    return toCoinProfile(coin, { community: false, developer: false })
  }

  async getContractMarketChart(params: ContractMarketChartParams): Promise<MarketChartResult> {
    const base = `/api/v3/coins/${encodeURIComponent(params.network)}/contract/${encodeURIComponent(params.address)}`
    const isRange = !isNullish(params.from) && !isNullish(params.to)
    const chart = isRange
      ? await this.get(`${base}/market_chart/range`, CoinGeckoMarketChartSchema, {
          vs_currency: params.vsCurrency,
          from: params.from ?? undefined,
          to: params.to ?? undefined
        })
      : await this.get(`${base}/market_chart`, CoinGeckoMarketChartSchema, {
          vs_currency: params.vsCurrency,
          days: params.days
        })

    return MarketChartResultSchema.parse({
      id: params.address,
      vs_currency: params.vsCurrency,
      ...toChartPoints(chart, params.limit)
    })
  }

  async getTokenPrice(params: TokenPriceParams): Promise<CoinGeckoSimplePrice> {
    return this.get(
      `/api/v3/simple/token_price/${encodeURIComponent(params.platform)}`,
      CoinGeckoSimplePriceSchema,
      {
        contract_addresses: params.addresses,
        vs_currencies: params.vsCurrencies,
        include_market_cap: true,
        include_24hr_vol: true,
        include_24hr_change: true,
        include_last_updated_at: true
      }
    )
  }

  async getExchangeRates(): Promise<ExchangeRateRow[]> {
    const response = await this.get('/api/v3/exchange_rates', CoinGeckoExchangeRatesSchema)

    return Object.entries(response.rates).map(([code, rate]) =>
      ExchangeRateRowSchema.parse({
        code,
        name: rate.name,
        unit: rate.unit,
        value: rate.value,
        type: rate.type
      })
    )
  }

  async getSupportedCurrencies(): Promise<string[]> {
    return this.get('/api/v3/simple/supported_vs_currencies', CoinGeckoSupportedCurrenciesSchema)
  }

  private async get<Schema extends z.ZodTypeAny>(
    path: string,
    schema: Schema,
    query: Record<string, QueryValue> = {}
  ): Promise<z.output<Schema>> {
    if (this.apiKey.length === 0) {
      throw new Error('COIN_GECKO_PRO_API_KEY is not set; fundamentals data is unavailable.')
    }

    const url = new URL(path, COIN_GECKO_PRO_BASE_URL)
    for (const [key, value] of Object.entries(query)) {
      if (isNullish(value)) continue
      url.searchParams.set(key, String(value))
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'x-cg-pro-api-key': this.apiKey
      }
    })

    const data: unknown = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(
        `CoinGecko request failed for ${path}: ${response.status} ${describeError(data) ?? response.statusText}`
      )
    }

    return schema.parse(data)
  }
}

// CoinGecko reports failures as `{error}` or `{status:{error_message}}`; the
// bare status line does not say which coin or plan tripped.
function describeError(data: unknown): string | null {
  const parsed = CoinGeckoErrorSchema.safeParse(data)
  if (!parsed.success) {
    return null
  }

  if ('error' in parsed.data) {
    return parsed.data.error
  }

  return parsed.data.status.error_message ?? null
}

function toCoinProfile(
  coin: CoinGeckoCoinDetail,
  include: { readonly community: boolean; readonly developer: boolean }
): CoinProfile {
  return CoinProfileSchema.parse({
    id: coin.id,
    symbol: coin.symbol,
    name: coin.name,
    rank: coin.market_cap_rank,
    price_usd: usd(coin, 'current_price'),
    market_cap_usd: usd(coin, 'market_cap'),
    volume_24h_usd: usd(coin, 'total_volume'),
    change_24h_pct: coin.market_data?.price_change_percentage_24h,
    circulating_supply: coin.market_data?.circulating_supply,
    total_supply: coin.market_data?.total_supply,
    max_supply: coin.market_data?.max_supply,
    categories: (coin.categories ?? []).filter((value): value is string => !isNullish(value)),
    homepage: coin.links?.homepage?.find((url) => url.length > 0) ?? null,
    genesis_date: coin.genesis_date,
    country_origin: coin.country_origin,
    description: emptyToNull(coin.description?.en),
    community: include.community ? coin.community_data : null,
    developer: include.developer ? coin.developer_data : null,
    last_updated: coin.last_updated
  })
}

type MarketDataHolder = {
  readonly market_data?: {
    readonly current_price?: Record<string, number | null | undefined> | null
    readonly market_cap?: Record<string, number | null | undefined> | null
    readonly total_volume?: Record<string, number | null | undefined> | null
  } | null
}

function usd(
  payload: MarketDataHolder,
  field: 'current_price' | 'market_cap' | 'total_volume'
): number | null {
  return payload.market_data?.[field]?.usd ?? null
}

function emptyToNull(value: string | null | undefined): string | null {
  if (isNullish(value) || value.length === 0) {
    return null
  }
  return value
}

function toSeconds(timestampMs: number): number {
  return Math.floor(timestampMs / 1000)
}

function takeLatest<T>(rows: T[], limit: number | null | undefined): T[] {
  if (isNullish(limit)) {
    return rows
  }
  return rows.slice(-limit)
}

type ChartPoints = {
  readonly count: number
  readonly points: MarketChartPoint[]
}

// CoinGecko returns prices, market caps, and volumes as three parallel series
// keyed by the same timestamps; zip them back into one point per timestamp.
function toChartPoints(chart: CoinGeckoMarketChart, limit: number | null | undefined): ChartPoints {
  const capsByTime = new Map((chart.market_caps ?? []).map(([t, value]) => [t, value]))
  const volumesByTime = new Map((chart.total_volumes ?? []).map(([t, value]) => [t, value]))

  const points = (chart.prices ?? []).map((price) =>
    MarketChartPointSchema.parse({
      t: toSeconds(price[0]),
      price: price[1],
      market_cap: capsByTime.get(price[0]) ?? null,
      volume: volumesByTime.get(price[0]) ?? null
    })
  )
  const limited = takeLatest(points, limit)

  return { count: limited.length, points: limited }
}
