import { cachedProviderJson } from '@/helpers/ProviderCache'
import { NANSEN_CHAIN_SLUGS } from '@/helpers/ProviderChains'
import { providerFetchJson } from '@/helpers/ProviderHttp'
import type { ChainId } from '@/types/ChainId'
import { SUPPORTED_CHAIN_IDS } from '@/types/ChainId'
import type {
  NansenNetflowTimeframe,
  NansenRawNumber,
  SmartMoneyDexTrades,
  SmartMoneyHoldings,
  SmartMoneyNetflows,
  SmartMoneyTokenFlows,
  SmartMoneyWalletPnl
} from '@/types/Nansen'
import {
  NansenDexTradesResponseSchema,
  NansenHoldingsResponseSchema,
  NansenNetflowResponseSchema,
  NansenPnlSummaryResponseSchema,
  NansenTokenFlowsResponseSchema,
  SmartMoneyDexTradesSchema,
  SmartMoneyHoldingsSchema,
  SmartMoneyNetflowsSchema,
  SmartMoneyTokenFlowsSchema,
  SmartMoneyWalletPnlSchema
} from '@/types/Nansen'
import { isNullish, uniquify } from '@/utils/Lang'

// Direct Nansen API v1 integration (docs.nansen.ai) backing the `smart-money`
// CLI group: smart-money netflows/holdings/dex-trades, Token God Mode daily
// flows for the smart-money cohort, and profiler wallet PnL summaries.
// Auth: API key in the `apikey` header (never a query param). All endpoints
// are POST with a JSON body: root-level snake_case fields, a `filters` object,
// `pagination: {page, per_page}` and `order_by: [{field, direction}]`.
// Smart-money endpoints take a plural `chains` array; TGM and profiler
// endpoints take a singular `chain` string (NANSEN_CHAIN_SLUGS slugs).

const NANSEN_BASE_URL = 'https://api.nansen.ai'
const NETFLOW_PATH = '/api/v1/smart-money/netflow'
const HOLDINGS_PATH = '/api/v1/smart-money/holdings'
const DEX_TRADES_PATH = '/api/v1/smart-money/dex-trades'
const TGM_FLOWS_PATH = '/api/v1/tgm/flows'
const PNL_SUMMARY_PATH = '/api/v1/profiler/address/pnl-summary'

// Smart-money aggregates move slowly enough for a 5 minute cache; the daily
// TGM flow series and wallet PnL summaries are even slower (10 minutes).
const SMART_MONEY_CACHE_TTL_MS = 5 * 60 * 1000
const TOKEN_FLOWS_CACHE_TTL_MS = 10 * 60 * 1000

// Nansen tgm/flows switches from daily to hourly rows once the requested date
// window is about a week or shorter (verified live); page size for the
// whole-window pagination loop.
const HOURLY_GRANULARITY_MAX_DAYS = 7
const TOKEN_FLOWS_PAGE_SIZE = 100
const WALLET_PNL_CACHE_TTL_MS = 10 * 60 * 1000

const SMART_MONEY_LABEL = 'smart_money'
const DAY_MS = 24 * 60 * 60 * 1000

type NansenServiceParams = {
  readonly apiKey: string
}

type GetNetflowsParams = {
  readonly chains?: readonly ChainId[]
  readonly timeframe: NansenNetflowTimeframe
  readonly limit: number
}

type GetHoldingsParams = {
  readonly chains?: readonly ChainId[]
  readonly limit: number
}

type GetDexTradesParams = {
  readonly chains?: readonly ChainId[]
  readonly limit: number
}

type GetTokenFlowsParams = {
  readonly tokenAddress: string
  readonly chain: ChainId
  readonly days: number
}

type GetWalletPnlParams = {
  readonly address: string
  readonly chain: ChainId
  readonly days: number
}

export class NansenService {
  private readonly apiKey: string

  constructor(params: NansenServiceParams) {
    this.apiKey = params.apiKey
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0
  }

  private ensureConfigured(): void {
    if (!this.isConfigured()) {
      throw new Error('NANSEN_API_KEY is not set; Nansen smart-money lookups are disabled')
    }
  }

  // Tokens smart money is accumulating/distributing, ranked by the requested
  // netflow window (the endpoint has no timeframe parameter; the timeframe
  // selects the net_flow_<tf>_usd order_by column).
  async getNetflows(params: GetNetflowsParams): Promise<SmartMoneyNetflows> {
    this.ensureConfigured()
    const chains = toNansenChains(params.chains)
    const orderField = `net_flow_${params.timeframe}_usd`
    const data = await cachedProviderJson({
      cacheKey: `nansen:smart-money-netflow:${chains.join(',')}:${orderField}:${params.limit}`,
      ttlMs: SMART_MONEY_CACHE_TTL_MS,
      fetchFn: async () =>
        this.postJson(NETFLOW_PATH, {
          chains,
          pagination: { page: 1, per_page: params.limit },
          order_by: [{ field: orderField, direction: 'DESC' }]
        })
    })
    const parsed = NansenNetflowResponseSchema.parse(data)
    return SmartMoneyNetflowsSchema.parse({
      source: 'nansen',
      chains,
      timeframe: params.timeframe,
      rows: (parsed.data ?? []).map((row) => ({
        chain: row.chain ?? null,
        token_address: row.token_address ?? null,
        symbol: row.token_symbol ?? null,
        net_flow_1h_usd: toFiniteNumber(row.net_flow_1h_usd),
        net_flow_24h_usd: toFiniteNumber(row.net_flow_24h_usd),
        net_flow_7d_usd: toFiniteNumber(row.net_flow_7d_usd),
        net_flow_30d_usd: toFiniteNumber(row.net_flow_30d_usd),
        trader_count: toFiniteNumber(row.trader_count),
        token_sectors: row.token_sectors ?? [],
        token_age_days: toFiniteNumber(row.token_age_days),
        market_cap_usd: toFiniteNumber(row.market_cap_usd)
      }))
    })
  }

  // Aggregate smart-money portfolio holdings per token, largest USD value first.
  async getHoldings(params: GetHoldingsParams): Promise<SmartMoneyHoldings> {
    this.ensureConfigured()
    const chains = toNansenChains(params.chains)
    const data = await cachedProviderJson({
      cacheKey: `nansen:smart-money-holdings:${chains.join(',')}:${params.limit}`,
      ttlMs: SMART_MONEY_CACHE_TTL_MS,
      fetchFn: async () =>
        this.postJson(HOLDINGS_PATH, {
          chains,
          pagination: { page: 1, per_page: params.limit },
          order_by: [{ field: 'value_usd', direction: 'DESC' }]
        })
    })
    const parsed = NansenHoldingsResponseSchema.parse(data)
    return SmartMoneyHoldingsSchema.parse({
      source: 'nansen',
      chains,
      rows: (parsed.data ?? []).map((row) => ({
        chain: row.chain ?? null,
        token_address: row.token_address ?? null,
        symbol: row.token_symbol ?? null,
        balance_usd: toFiniteNumber(row.value_usd),
        balance_24h_percent_change: toFiniteNumber(row.balance_24h_percent_change),
        holders_count: toFiniteNumber(row.holders_count),
        share_of_holdings_pct: toFiniteNumber(row.share_of_holdings_percent),
        token_sectors: row.token_sectors ?? [],
        token_age_days: toFiniteNumber(row.token_age_days),
        market_cap_usd: toFiniteNumber(row.market_cap_usd)
      }))
    })
  }

  // Individual DEX trades by smart-money wallets, newest first.
  async getDexTrades(params: GetDexTradesParams): Promise<SmartMoneyDexTrades> {
    this.ensureConfigured()
    const chains = toNansenChains(params.chains)
    const data = await cachedProviderJson({
      cacheKey: `nansen:smart-money-dex-trades:${chains.join(',')}:${params.limit}`,
      ttlMs: SMART_MONEY_CACHE_TTL_MS,
      fetchFn: async () =>
        this.postJson(DEX_TRADES_PATH, {
          chains,
          pagination: { page: 1, per_page: params.limit },
          order_by: [{ field: 'block_timestamp', direction: 'DESC' }]
        })
    })
    const parsed = NansenDexTradesResponseSchema.parse(data)
    return SmartMoneyDexTradesSchema.parse({
      source: 'nansen',
      chains,
      rows: (parsed.data ?? []).map((row) => ({
        chain: row.chain ?? null,
        tx_hash: row.transaction_hash ?? null,
        timestamp: row.block_timestamp ?? null,
        wallet_address: row.trader_address ?? null,
        wallet_label: row.trader_address_label ?? null,
        token_bought: {
          address: row.token_bought_address ?? null,
          symbol: row.token_bought_symbol ?? null,
          amount: toFiniteNumber(row.token_bought_amount)
        },
        token_sold: {
          address: row.token_sold_address ?? null,
          symbol: row.token_sold_symbol ?? null,
          amount: toFiniteNumber(row.token_sold_amount)
        },
        value_usd: toFiniteNumber(row.trade_value_usd)
      }))
    })
  }

  // Token God Mode flow series for one token, scoped to the smart-money label
  // cohort over the trailing --days window (computed from Date.now()). Nansen
  // returns HOURLY rows for windows of ~7 days or less and daily rows beyond,
  // so the whole window is fetched page by page and the detected granularity
  // is reported alongside the rows.
  async getTokenFlows(params: GetTokenFlowsParams): Promise<SmartMoneyTokenFlows> {
    this.ensureConfigured()
    const chain = NANSEN_CHAIN_SLUGS[params.chain]
    const dateTo = toIsoDate(Date.now())
    const dateFrom = toIsoDate(Date.now() - params.days * DAY_MS)
    const neededRows =
      params.days <= HOURLY_GRANULARITY_MAX_DAYS ? params.days * 24 + 2 : params.days + 2
    const data = await cachedProviderJson({
      cacheKey:
        `nansen:tgm-flows:${chain}:${params.tokenAddress}:${SMART_MONEY_LABEL}:` +
        `${dateFrom}:${dateTo}:${neededRows}`,
      ttlMs: TOKEN_FLOWS_CACHE_TTL_MS,
      fetchFn: async () => {
        const perPage = Math.min(neededRows, TOKEN_FLOWS_PAGE_SIZE)
        const maxPages = Math.ceil(neededRows / perPage)
        const rows: unknown[] = []
        for (let page = 1; page <= maxPages; page += 1) {
          const pageData = await this.postJson(TGM_FLOWS_PATH, {
            chain,
            token_address: params.tokenAddress,
            date: { from: dateFrom, to: dateTo },
            label: SMART_MONEY_LABEL,
            pagination: { page, per_page: perPage },
            order_by: [{ field: 'date', direction: 'DESC' }]
          })
          const pageRows = NansenTokenFlowsResponseSchema.parse(pageData).data ?? []
          rows.push(...pageRows)
          if (pageRows.length < perPage) {
            break
          }
        }
        return { data: rows }
      }
    })
    const parsed = NansenTokenFlowsResponseSchema.parse(data)
    const firstRowDate = parsed.data?.[0]?.date
    return SmartMoneyTokenFlowsSchema.parse({
      source: 'nansen',
      chain,
      token_address: params.tokenAddress,
      label: SMART_MONEY_LABEL,
      date_from: dateFrom,
      date_to: dateTo,
      granularity: isNullish(firstRowDate) ? null : firstRowDate.includes('T') ? 'hourly' : 'daily',
      rows: (parsed.data ?? []).map((row) => ({
        date: row.date ?? null,
        price_usd: toFiniteNumber(row.price_usd),
        token_amount: toFiniteNumber(row.token_amount),
        value_usd: toFiniteNumber(row.value_usd),
        holders_count: toFiniteNumber(row.holders_count),
        total_inflows_count: toFiniteNumber(row.total_inflows_count),
        total_outflows_count: toFiniteNumber(row.total_outflows_count),
        total_inflows_dex: toFiniteNumber(row.total_inflows_dex),
        total_outflows_dex: toFiniteNumber(row.total_outflows_dex),
        total_inflows_cex: toFiniteNumber(row.total_inflows_cex),
        total_outflows_cex: toFiniteNumber(row.total_outflows_cex)
      }))
    })
  }

  // Profiler wallet PnL summary: realized PnL, win rate and top-5 tokens over
  // the trailing --days window (the endpoint REQUIRES a date range and reports
  // realized figures only, so unrealized_pnl_usd is null).
  async getWalletPnl(params: GetWalletPnlParams): Promise<SmartMoneyWalletPnl> {
    this.ensureConfigured()
    const chain = NANSEN_CHAIN_SLUGS[params.chain]
    const dateTo = toIsoDate(Date.now())
    const dateFrom = toIsoDate(Date.now() - params.days * DAY_MS)
    const data = await cachedProviderJson({
      cacheKey: `nansen:profiler-pnl-summary:${chain}:${params.address}:${dateFrom}:${dateTo}`,
      ttlMs: WALLET_PNL_CACHE_TTL_MS,
      fetchFn: async () =>
        this.postJson(PNL_SUMMARY_PATH, {
          address: params.address,
          chain,
          date: { from: dateFrom, to: dateTo }
        })
    })
    const parsed = NansenPnlSummaryResponseSchema.parse(data)
    return SmartMoneyWalletPnlSchema.parse({
      source: 'nansen',
      address: params.address,
      chain,
      realized_pnl_usd: toFiniteNumber(parsed.realized_pnl_usd),
      realized_pnl_percent: toFiniteNumber(parsed.realized_pnl_percent),
      unrealized_pnl_usd: null,
      win_rate_pct: toFiniteNumber(parsed.win_rate),
      traded_token_count: toFiniteNumber(parsed.traded_token_count),
      traded_times: toFiniteNumber(parsed.traded_times),
      top_tokens: (parsed.top5_tokens ?? []).map((token) => ({
        chain: token.chain ?? null,
        token_address: token.token_address ?? null,
        symbol: token.token_symbol ?? null,
        realized_pnl_usd: toFiniteNumber(token.realized_pnl),
        realized_roi: toFiniteNumber(token.realized_roi)
      }))
    })
  }

  private async postJson(path: string, jsonBody: unknown): Promise<unknown> {
    return providerFetchJson({
      provider: 'nansen',
      url: new URL(path, NANSEN_BASE_URL),
      method: 'POST',
      headers: { apikey: this.apiKey },
      jsonBody,
      secrets: [this.apiKey]
    })
  }
}

// Translate harness chain ids to Nansen slugs; no --chains means all supported
// chains. Deduped and sorted so equivalent requests share one cache entry.
function toNansenChains(chains: readonly ChainId[] | undefined): string[] {
  const chainIds = isNullish(chains) || chains.length === 0 ? SUPPORTED_CHAIN_IDS : chains
  return uniquify(chainIds.map((chainId) => NANSEN_CHAIN_SLUGS[chainId])).sort()
}

function toIsoDate(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10)
}

function toFiniteNumber(value: NansenRawNumber): number | null {
  if (isNullish(value)) {
    return null
  }
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
