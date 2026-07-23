import type {
  OptionsCandles,
  OptionsChain,
  OptionsContractDetail,
  OptionsContracts,
  OptionsContractType,
  OptionsLastTrade,
  OptionsPrevDay,
  OptionsProxyContract,
  OptionsQuotes,
  OptionsTrades
} from '@/types/Options'
import {
  MassiveOptionAggsResponseSchema,
  MassiveOptionContractsResponseSchema,
  MassiveOptionLastTradeResponseSchema,
  MassiveOptionQuotesResponseSchema,
  MassiveOptionTradesResponseSchema,
  OptionsCandlesSchema,
  OptionsChainSchema,
  OptionsContractDetailSchema,
  OptionsContractsSchema,
  OptionsLastTradeSchema,
  OptionsPrevDaySchema,
  OptionsProxyChainResponseSchema,
  OptionsProxyContractSchema,
  OptionsQuotesSchema,
  OptionsTradesSchema
} from '@/types/Options'
import { isNullish } from '@/utils/Lang'

type OptionsServiceParams = {
  readonly apiKey: string
  readonly apiBaseUrl: string
  readonly apiBearerToken: string
}

type GetChainParams = {
  readonly symbol: string
  readonly expiry: string | null | undefined
  readonly strikeGte: number | null | undefined
  readonly strikeLte: number | null | undefined
  readonly limit: number | null | undefined
}

type GetContractParams = {
  readonly contract: string
}

type GetContractsParams = {
  readonly symbol: string
  readonly expiry: string | null | undefined
  readonly type: OptionsContractType | null | undefined
  readonly limit: number
}

type GetTicksParams = {
  readonly contract: string
  readonly limit: number
}

type GetCandlesParams = {
  readonly contract: string
  readonly from: string | null | undefined
  readonly to: string | null | undefined
  readonly limit: number
}

// The chain and contract snapshots ride the Tribes /stocks/options proxy
// (bearer auth, no provider key needed). Everything else calls Massive
// directly with MASSIVE_API_KEY — Massive is not yet in the egress catalog,
// so inside a sandbox the key stays absent until the control plane adds the
// catalog entry, billing, and placeholder injection; the direct subcommands
// report themselves unavailable in-VM, which is expected.
const MASSIVE_BASE_URL = 'https://api.massive.com/'
const ERROR_BODY_MAX_CHARS = 300
const DEFAULT_CANDLES_WINDOW_DAYS = 180
const NANOS_PER_MILLI = 1_000_000
const MILLIS_PER_DAY = 86_400_000
// OCC option tickers end with a fixed 15-char tail: YYMMDD + C|P + 8-digit strike.
const OCC_TAIL_LENGTH = 15
const OCC_TAIL_PATTERN = /^\d{6}[CP]\d{8}$/

export class OptionsService {
  private readonly apiKey: string

  private readonly apiBaseUrl: string

  private readonly apiBearerToken: string

  constructor(params: OptionsServiceParams) {
    this.apiKey = params.apiKey
    this.apiBaseUrl = params.apiBaseUrl
    this.apiBearerToken = params.apiBearerToken
  }

  async getChain(params: GetChainParams): Promise<OptionsChain> {
    const raw = await this.fetchProxy(`/stocks/options/${encodeURIComponent(params.symbol)}`, {
      ...(isNullish(params.expiry) ? {} : { expiration_date: params.expiry }),
      ...(isNullish(params.strikeGte) ? {} : { strike_gte: String(params.strikeGte) }),
      ...(isNullish(params.strikeLte) ? {} : { strike_lte: String(params.strikeLte) }),
      ...(isNullish(params.limit) ? {} : { limit: String(params.limit) })
    })
    const contracts = OptionsProxyChainResponseSchema.parse(raw)
    return OptionsChainSchema.parse({
      source: 'massive',
      symbol: params.symbol,
      underlying_price: this.asFiniteNumber(contracts[0]?.underlying_asset?.price),
      contracts: contracts.map((contract) => ({
        contract: contract.details.ticker,
        type: contract.details.contract_type,
        strike: this.asFiniteNumber(contract.details.strike_price),
        expiry: contract.details.expiration_date,
        bid: this.asFiniteNumber(contract.last_quote?.bid),
        ask: this.asFiniteNumber(contract.last_quote?.ask),
        mid: this.asFiniteNumber(contract.last_quote?.midpoint),
        iv: this.asFiniteNumber(contract.implied_volatility),
        delta: this.asFiniteNumber(contract.greeks?.delta),
        gamma: this.asFiniteNumber(contract.greeks?.gamma),
        theta: this.asFiniteNumber(contract.greeks?.theta),
        vega: this.asFiniteNumber(contract.greeks?.vega),
        open_interest: contract.open_interest,
        day_volume: this.asFiniteNumber(contract.day?.v),
        break_even: this.asFiniteNumber(contract.break_even_price)
      }))
    })
  }

  async getContract(params: GetContractParams): Promise<OptionsContractDetail> {
    const underlying = this.deriveUnderlying(params.contract)
    const raw = await this.fetchProxy(
      `/stocks/options/${encodeURIComponent(underlying)}/contract/${encodeURIComponent(params.contract)}`,
      {}
    )
    const contract: OptionsProxyContract = OptionsProxyContractSchema.parse(raw)
    return OptionsContractDetailSchema.parse({
      source: 'massive',
      contract: contract.details.ticker,
      underlying: contract.underlying_asset?.ticker ?? underlying,
      underlying_price: this.asFiniteNumber(contract.underlying_asset?.price),
      type: contract.details.contract_type,
      strike: this.asFiniteNumber(contract.details.strike_price),
      expiry: contract.details.expiration_date,
      exercise_style: contract.details.exercise_style,
      shares_per_contract: contract.details.shares_per_contract,
      bid: this.asFiniteNumber(contract.last_quote?.bid),
      ask: this.asFiniteNumber(contract.last_quote?.ask),
      mid: this.asFiniteNumber(contract.last_quote?.midpoint),
      iv: this.asFiniteNumber(contract.implied_volatility),
      delta: this.asFiniteNumber(contract.greeks?.delta),
      gamma: this.asFiniteNumber(contract.greeks?.gamma),
      theta: this.asFiniteNumber(contract.greeks?.theta),
      vega: this.asFiniteNumber(contract.greeks?.vega),
      open_interest: contract.open_interest,
      day_open: this.asFiniteNumber(contract.day?.o),
      day_high: this.asFiniteNumber(contract.day?.h),
      day_low: this.asFiniteNumber(contract.day?.l),
      day_close: this.asFiniteNumber(contract.day?.c),
      day_volume: this.asFiniteNumber(contract.day?.v),
      day_change_pct: this.asFiniteNumber(contract.day?.change_percent),
      prev_close: this.asFiniteNumber(contract.day?.previous_close),
      break_even: this.asFiniteNumber(contract.break_even_price)
    })
  }

  async getContracts(params: GetContractsParams): Promise<OptionsContracts> {
    const raw = await this.fetchMassive('v3/reference/options/contracts', {
      underlying_ticker: params.symbol,
      limit: String(params.limit),
      ...(isNullish(params.expiry) ? {} : { expiration_date: params.expiry }),
      ...(isNullish(params.type) ? {} : { contract_type: params.type })
    })
    const parsed = MassiveOptionContractsResponseSchema.parse(raw)
    return OptionsContractsSchema.parse({
      source: 'massive',
      symbol: params.symbol,
      contracts: (parsed.results ?? []).map((row) => ({
        contract: row.ticker,
        type: row.contract_type,
        strike: row.strike_price,
        expiry: row.expiration_date,
        exercise_style: row.exercise_style,
        shares_per_contract: row.shares_per_contract
      }))
    })
  }

  async getTrades(params: GetTicksParams): Promise<OptionsTrades> {
    const raw = await this.fetchMassive(`v3/trades/${encodeURIComponent(params.contract)}`, {
      limit: String(params.limit),
      order: 'desc',
      sort: 'timestamp'
    })
    const parsed = MassiveOptionTradesResponseSchema.parse(raw)
    return OptionsTradesSchema.parse({
      source: 'massive',
      contract: params.contract,
      trades: (parsed.results ?? []).map((row) => ({
        t: Math.floor(row.sip_timestamp / NANOS_PER_MILLI),
        price: row.price,
        size: row.size,
        exchange: row.exchange
      }))
    })
  }

  async getQuotes(params: GetTicksParams): Promise<OptionsQuotes> {
    const raw = await this.fetchMassive(`v3/quotes/${encodeURIComponent(params.contract)}`, {
      limit: String(params.limit),
      order: 'desc',
      sort: 'timestamp'
    })
    const parsed = MassiveOptionQuotesResponseSchema.parse(raw)
    return OptionsQuotesSchema.parse({
      source: 'massive',
      contract: params.contract,
      quotes: (parsed.results ?? []).map((row) => ({
        t: isNullish(row.sip_timestamp) ? null : Math.floor(row.sip_timestamp / NANOS_PER_MILLI),
        bid: row.bid_price,
        bid_size: row.bid_size,
        ask: row.ask_price,
        ask_size: row.ask_size
      }))
    })
  }

  async getLastTrade(params: GetContractParams): Promise<OptionsLastTrade> {
    const raw = await this.fetchMassive(`v2/last/trade/${encodeURIComponent(params.contract)}`, {})
    const parsed = MassiveOptionLastTradeResponseSchema.parse(raw)
    const trade = parsed.results
    return OptionsLastTradeSchema.parse({
      source: 'massive',
      contract: params.contract,
      price: trade.p,
      size: trade.s,
      t: isNullish(trade.t) ? null : Math.floor(trade.t / NANOS_PER_MILLI),
      exchange: trade.x
    })
  }

  async getCandles(params: GetCandlesParams): Promise<OptionsCandles> {
    const to = params.to ?? this.isoDate(Date.now())
    const from =
      params.from ?? this.isoDate(Date.parse(to) - DEFAULT_CANDLES_WINDOW_DAYS * MILLIS_PER_DAY)
    const path =
      `v2/aggs/ticker/${encodeURIComponent(params.contract)}` +
      `/range/1/day/${encodeURIComponent(from)}/${encodeURIComponent(to)}`
    const raw = await this.fetchMassive(path, {
      adjusted: 'true',
      sort: 'asc',
      limit: String(params.limit)
    })
    const parsed = MassiveOptionAggsResponseSchema.parse(raw)
    return OptionsCandlesSchema.parse({
      source: 'massive',
      contract: params.contract,
      candles: (parsed.results ?? []).map((bar) => ({
        t: bar.t,
        o: bar.o,
        h: bar.h,
        l: bar.l,
        c: bar.c,
        v: bar.v
      }))
    })
  }

  async getPrevDay(params: GetContractParams): Promise<OptionsPrevDay> {
    const raw = await this.fetchMassive(
      `v2/aggs/ticker/${encodeURIComponent(params.contract)}/prev`,
      { adjusted: 'true' }
    )
    const parsed = MassiveOptionAggsResponseSchema.parse(raw)
    const bar = parsed.results?.[0]
    return OptionsPrevDaySchema.parse({
      source: 'massive',
      contract: params.contract,
      t: bar?.t,
      o: bar?.o,
      h: bar?.h,
      l: bar?.l,
      c: bar?.c,
      v: bar?.v
    })
  }

  // Derives the underlying stock ticker from an OCC option ticker
  // (O:AAPL250620C00200000 → AAPL); the proxy contract route needs both.
  private deriveUnderlying(contract: string): string {
    const body = contract.startsWith('O:') ? contract.slice(2) : contract
    const root = body.slice(0, -OCC_TAIL_LENGTH)
    const tail = body.slice(-OCC_TAIL_LENGTH)
    if (root === '' || !OCC_TAIL_PATTERN.test(tail)) {
      throw new Error(
        `Cannot derive the underlying ticker from option contract "${contract}" — ` +
          'expected an OCC ticker like O:AAPL250620C00200000'
      )
    }
    return root
  }

  private async fetchMassive(path: string, searchParams: Record<string, string>): Promise<unknown> {
    if (this.apiKey === '') {
      throw new Error(
        'MASSIVE_API_KEY is not set — the `options` command group is unavailable on this box'
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
        Authorization: `Bearer ${this.apiKey}`
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

  private async fetchProxy(path: string, searchParams: Record<string, string>): Promise<unknown> {
    const url = new URL(path, this.apiBaseUrl)
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, value)
    }
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${this.apiBearerToken}`
      }
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(
        `Options proxy ${path} failed: ${response.status} ${response.statusText} ${body.slice(0, ERROR_BODY_MAX_CHARS)}`
      )
    }
    const data: unknown = await response.json()
    return data
  }

  private isoDate(epochMs: number): string {
    return new Date(epochMs).toISOString().slice(0, 10)
  }

  // The options proxy serializes BigNumber fields as decimal strings; anything
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
