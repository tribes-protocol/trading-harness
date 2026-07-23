import type {
  CoinGeckoExchangeTicker,
  DerivativesExchanges,
  DerivativesTickers,
  ExchangeDetail,
  ExchangesList,
  ExchangesTreasuryCoin,
  ExchangesVolumeChartDays,
  ExchangeTickerRow,
  ExchangeTickers,
  ExchangeVolumeChart,
  PublicTreasury,
  TreasuryChartDays,
  TreasuryEntities,
  TreasuryEntityHoldings,
  TreasuryHistory,
  TreasuryHoldingChart
} from '@/types/Exchanges'
import {
  CoinGeckoDerivativeRowSchema,
  CoinGeckoDerivativesExchangeRowSchema,
  CoinGeckoEntityRowSchema,
  CoinGeckoExchangeDetailResponseSchema,
  CoinGeckoExchangeRowSchema,
  CoinGeckoExchangeTickersResponseSchema,
  CoinGeckoExchangeVolumeChartResponseSchema,
  CoinGeckoTreasuryEntityResponseSchema,
  CoinGeckoTreasuryHoldingChartResponseSchema,
  CoinGeckoTreasuryResponseSchema,
  CoinGeckoTreasuryTransactionHistoryResponseSchema,
  DerivativesExchangesSchema,
  DerivativesTickersSchema,
  ExchangeDetailSchema,
  ExchangesListSchema,
  ExchangeTickersSchema,
  ExchangeVolumeChartSchema,
  PublicTreasurySchema,
  TreasuryEntitiesSchema,
  TreasuryEntityHoldingsSchema,
  TreasuryHistorySchema,
  TreasuryHoldingChartSchema
} from '@/types/Exchanges'
import { isNullish } from '@/utils/Lang'

type ExchangesServiceParams = {
  readonly apiKey: string
}

type ListParams = {
  readonly limit: number
}

type DetailParams = {
  readonly id: string
}

type TickersParams = {
  readonly id: string
  readonly limit: number
}

type VolumeChartParams = {
  readonly id: string
  readonly days: ExchangesVolumeChartDays
}

type DerivativesParams = {
  readonly limit: number
}

type DerivativesExchangesParams = {
  readonly limit: number
}

type TreasuryParams = {
  readonly coin: ExchangesTreasuryCoin
}

type TreasuryEntitiesParams = {
  readonly limit: number
}

type TreasuryEntityParams = {
  readonly entity: string
  readonly coin: string | null
}

type TreasuryChartParams = {
  readonly entity: string
  readonly coin: string
  readonly days: TreasuryChartDays
}

type TreasuryHistoryParams = {
  readonly entity: string
  readonly limit: number
}

const COINGECKO_PRO_BASE_URL = 'https://pro-api.coingecko.com/'
const COINGECKO_KEY_HEADER = 'x-cg-pro-api-key'
const ERROR_BODY_MAX_CHARS = 300
const DETAIL_TOP_TICKERS = 10

export class ExchangesService {
  private readonly apiKey: string

  constructor(params: ExchangesServiceParams) {
    this.apiKey = params.apiKey
  }

  async list(params: ListParams): Promise<ExchangesList> {
    const raw = await this.fetch('api/v3/exchanges', {
      per_page: String(params.limit),
      page: '1'
    })
    const rows = CoinGeckoExchangeRowSchema.array().parse(raw)
    return ExchangesListSchema.parse({
      source: 'coingecko',
      exchanges: rows.map((row) => ({
        id: row.id,
        name: row.name,
        trust_score: row.trust_score,
        trust_rank: row.trust_score_rank,
        volume_24h_btc: row.trade_volume_24h_btc
      }))
    })
  }

  async detail(params: DetailParams): Promise<ExchangeDetail> {
    const raw = await this.fetch(`api/v3/exchanges/${encodeURIComponent(params.id)}`, {})
    const parsed = CoinGeckoExchangeDetailResponseSchema.parse(raw)
    return ExchangeDetailSchema.parse({
      source: 'coingecko',
      id: params.id,
      name: parsed.name,
      country: parsed.country,
      year_established: parsed.year_established,
      trust_score: parsed.trust_score,
      trust_rank: parsed.trust_score_rank,
      volume_24h_btc: parsed.trade_volume_24h_btc,
      top_tickers: (parsed.tickers ?? [])
        .slice(0, DETAIL_TOP_TICKERS)
        .map((ticker) => this.shapeTicker(ticker))
    })
  }

  async tickers(params: TickersParams): Promise<ExchangeTickers> {
    const raw = await this.fetch(`api/v3/exchanges/${encodeURIComponent(params.id)}/tickers`, {
      page: '1'
    })
    const parsed = CoinGeckoExchangeTickersResponseSchema.parse(raw)
    return ExchangeTickersSchema.parse({
      source: 'coingecko',
      id: params.id,
      tickers: (parsed.tickers ?? [])
        .slice(0, params.limit)
        .map((ticker) => this.shapeTicker(ticker))
    })
  }

  async volumeChart(params: VolumeChartParams): Promise<ExchangeVolumeChart> {
    const raw = await this.fetch(`api/v3/exchanges/${encodeURIComponent(params.id)}/volume_chart`, {
      days: params.days
    })
    const points = CoinGeckoExchangeVolumeChartResponseSchema.parse(raw)
    return ExchangeVolumeChartSchema.parse({
      source: 'coingecko',
      id: params.id,
      days: params.days,
      points: points.map((point) => ({ t: point[0], volume_btc: this.asFiniteNumber(point[1]) }))
    })
  }

  async derivatives(params: DerivativesParams): Promise<DerivativesTickers> {
    const raw = await this.fetch('api/v3/derivatives', {})
    const rows = CoinGeckoDerivativeRowSchema.array().parse(raw)
    return DerivativesTickersSchema.parse({
      source: 'coingecko',
      tickers: rows.slice(0, params.limit).map((row) => ({
        market: row.market,
        symbol: row.symbol,
        contract_type: row.contract_type,
        price_usd: this.asFiniteNumber(row.price),
        change_24h_pct: row.price_percentage_change_24h,
        open_interest_usd: row.open_interest,
        volume_24h_usd: row.volume_24h,
        funding_rate_pct: row.funding_rate,
        spread_pct: row.spread
      }))
    })
  }

  async derivativesExchanges(params: DerivativesExchangesParams): Promise<DerivativesExchanges> {
    const raw = await this.fetch('api/v3/derivatives/exchanges', {
      order: 'open_interest_btc_desc',
      per_page: String(params.limit),
      page: '1'
    })
    const rows = CoinGeckoDerivativesExchangeRowSchema.array().parse(raw)
    return DerivativesExchangesSchema.parse({
      source: 'coingecko',
      exchanges: rows.map((row) => ({
        id: row.id,
        name: row.name,
        open_interest_btc: row.open_interest_btc,
        volume_24h_btc: this.asFiniteNumber(row.trade_volume_24h_btc),
        perpetual_pairs: row.number_of_perpetual_pairs,
        futures_pairs: row.number_of_futures_pairs
      }))
    })
  }

  async treasury(params: TreasuryParams): Promise<PublicTreasury> {
    const raw = await this.fetch(`api/v3/companies/public_treasury/${params.coin}`, {})
    const parsed = CoinGeckoTreasuryResponseSchema.parse(raw)
    return PublicTreasurySchema.parse({
      source: 'coingecko',
      coin: params.coin,
      total_holdings: parsed.total_holdings,
      total_value_usd: parsed.total_value_usd,
      market_cap_dominance_pct: parsed.market_cap_dominance,
      companies: (parsed.companies ?? []).map((company) => ({
        name: company.name,
        symbol: company.symbol,
        country: company.country,
        total_holdings: company.total_holdings,
        entry_value_usd: company.total_entry_value_usd,
        current_value_usd: company.total_current_value_usd,
        pct_of_total_supply: company.percentage_of_total_supply
      }))
    })
  }

  async treasuryEntities(params: TreasuryEntitiesParams): Promise<TreasuryEntities> {
    const raw = await this.fetch('api/v3/entities/list', {
      per_page: String(params.limit),
      page: '1'
    })
    const rows = CoinGeckoEntityRowSchema.array().parse(raw)
    return TreasuryEntitiesSchema.parse({
      source: 'coingecko',
      entities: rows.map((row) => ({
        id: row.id,
        name: row.name,
        symbol: row.symbol,
        country: row.country
      }))
    })
  }

  async treasuryEntity(params: TreasuryEntityParams): Promise<TreasuryEntityHoldings> {
    const raw = await this.fetch(`api/v3/public_treasury/${encodeURIComponent(params.entity)}`, {})
    const parsed = CoinGeckoTreasuryEntityResponseSchema.parse(raw)
    // The endpoint has no coin filter, so --coin narrows holdings client-side.
    const holdings = (parsed.holdings ?? []).filter(
      (holding) => isNullish(params.coin) || holding.coin_id === params.coin
    )
    return TreasuryEntityHoldingsSchema.parse({
      source: 'coingecko',
      entity: params.entity,
      name: parsed.name,
      type: parsed.type,
      symbol: parsed.symbol,
      country: parsed.country,
      total_value_usd: parsed.total_treasury_value_usd,
      unrealized_pnl_usd: parsed.unrealized_pnl,
      holdings: holdings.map((holding) => ({
        coin_id: holding.coin_id,
        amount: holding.amount,
        current_value_usd: holding.current_value_usd,
        entry_value_usd: holding.total_entry_value_usd,
        avg_entry_value_usd: holding.average_entry_value_usd,
        pct_of_total_supply: holding.percentage_of_total_supply,
        unrealized_pnl_usd: holding.unrealized_pnl
      }))
    })
  }

  async treasuryChart(params: TreasuryChartParams): Promise<TreasuryHoldingChart> {
    const raw = await this.fetch(
      `api/v3/public_treasury/${encodeURIComponent(params.entity)}/${encodeURIComponent(params.coin)}/holding_chart`,
      { days: params.days }
    )
    const parsed = CoinGeckoTreasuryHoldingChartResponseSchema.parse(raw)
    return TreasuryHoldingChartSchema.parse({
      source: 'coingecko',
      entity: params.entity,
      coin: params.coin,
      days: params.days,
      holdings: (parsed.holdings ?? []).map((point) => ({ t: point[0], amount: point[1] })),
      value_usd: (parsed.holding_value_in_usd ?? []).map((point) => ({
        t: point[0],
        usd: point[1]
      }))
    })
  }

  async treasuryHistory(params: TreasuryHistoryParams): Promise<TreasuryHistory> {
    const raw = await this.fetch(
      `api/v3/public_treasury/${encodeURIComponent(params.entity)}/transaction_history`,
      { per_page: String(params.limit), page: '1' }
    )
    const parsed = CoinGeckoTreasuryTransactionHistoryResponseSchema.parse(raw)
    return TreasuryHistorySchema.parse({
      source: 'coingecko',
      entity: params.entity,
      transactions: (parsed.transactions ?? []).map((transaction) => ({
        date: transaction.date,
        coin_id: transaction.coin_id,
        type: transaction.type,
        net_change: transaction.holding_net_change,
        value_usd: transaction.transaction_value_usd,
        balance: transaction.holding_balance,
        avg_entry_value_usd: transaction.average_entry_value_usd
      }))
    })
  }

  private shapeTicker(ticker: CoinGeckoExchangeTicker): ExchangeTickerRow {
    return {
      pair: `${ticker.base ?? '?'}/${ticker.target ?? '?'}`,
      price_usd: ticker.converted_last?.usd,
      volume_24h_usd: ticker.converted_volume?.usd,
      spread_pct: ticker.bid_ask_spread_percentage,
      trust_score: ticker.trust_score
    }
  }

  private async fetch(path: string, searchParams: Record<string, string>): Promise<unknown> {
    if (this.apiKey === '') {
      throw new Error(
        'COIN_GECKO_PRO_API_KEY is not set — the `exchanges` command group is unavailable on this box'
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

  // Accepts CoinGecko's mixed numeric encodings (decimal strings on volume
  // charts and derivatives prices, numbers elsewhere); non-finite → null.
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
