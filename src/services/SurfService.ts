import {
  type SurfEtfFlow,
  SurfEtfFlowSchema,
  type SurfFundingHistory,
  SurfFundingHistorySchema,
  type SurfLiquidation,
  SurfLiquidationSchema,
  type SurfLongShortRatio,
  SurfLongShortRatioSchema,
  type SurfOptions,
  SurfOptionsSchema
} from '@/types/Surf'
import { isNullish } from '@/utils/Lang'

const SURF_BASE_URL = 'https://api.asksurf.ai'
// The `/gateway` segment is mandatory. Without it the host 404s, and so does the
// marketing apex — neither is a routing detail worth rediscovering at runtime.
const SURF_API_PREFIX = '/gateway/v1'

type SurfServiceParams = {
  readonly apiKey: string
}

type FundingHistoryParams = {
  readonly pair: string
  readonly exchange: string | null
  readonly from: string | null
  readonly limit: number | null
}

type LongShortRatioParams = {
  readonly pair: string
  readonly interval: string | null
  readonly exchange: string | null
  readonly from: string | null
  readonly limit: number | null
}

type LiquidationChartParams = {
  readonly symbol: string
  readonly interval: string | null
  readonly exchange: string | null
  readonly limit: number | null
  readonly from: string | null
  readonly to: string | null
}

type LiquidationVenuesParams = {
  readonly symbol: string | null
  readonly timeRange: string | null
  readonly sortBy: string | null
  readonly order: string | null
}

type LiquidationOrdersParams = {
  readonly symbol: string | null
  readonly exchange: string | null
  readonly minAmount: number | null
  readonly side: string | null
  readonly sortBy: string | null
  readonly order: string | null
  readonly limit: number | null
}

type OptionsParams = {
  readonly symbol: string
  readonly sortBy: string | null
  readonly order: string | null
}

type EtfFlowParams = {
  readonly symbol: string
  readonly sortBy: string | null
  readonly order: string | null
  readonly from: string | null
  readonly to: string | null
}

// SurfAI Data API. Only the derivatives surface is wrapped — funding, long/short
// ratio, liquidations, options and ETF flows — because the rest duplicates
// providers the harness already pays for.
export class SurfService {
  private readonly apiKey: string

  constructor(params: SurfServiceParams) {
    this.apiKey = params.apiKey
  }

  // Perp funding-rate history. `pair` is a pair, not a ticker: 'BTC/USDT', or
  // 'BTC/USDC:USDC' for Hyperliquid's USDC-settled perps.
  async getFundingHistory(params: FundingHistoryParams): Promise<SurfFundingHistory> {
    const json = await this.get('/exchange/funding-history', {
      pair: params.pair,
      exchange: params.exchange,
      from: params.from,
      limit: params.limit
    })
    return SurfFundingHistorySchema.parse(json)
  }

  async getLongShortRatio(params: LongShortRatioParams): Promise<SurfLongShortRatio> {
    const json = await this.get('/exchange/long-short-ratio', {
      pair: params.pair,
      interval: params.interval,
      exchange: params.exchange,
      from: params.from,
      limit: params.limit
    })
    return SurfLongShortRatioSchema.parse(json)
  }

  // Aggregated liquidation volume over time.
  async getLiquidationChart(params: LiquidationChartParams): Promise<SurfLiquidation> {
    const json = await this.get('/market/liquidation/chart', {
      symbol: params.symbol,
      interval: params.interval,
      exchange: params.exchange,
      limit: params.limit,
      from: params.from,
      to: params.to
    })
    return SurfLiquidationSchema.parse(json)
  }

  // Cross-venue liquidation totals as one snapshot, not a series.
  async getLiquidationVenues(params: LiquidationVenuesParams): Promise<SurfLiquidation> {
    const json = await this.get('/market/liquidation/exchange-list', {
      symbol: params.symbol,
      time_range: params.timeRange,
      sort_by: params.sortBy,
      order: params.order
    })
    return SurfLiquidationSchema.parse(json)
  }

  // Individual liquidation prints above a USD threshold.
  async getLiquidationOrders(params: LiquidationOrdersParams): Promise<SurfLiquidation> {
    const json = await this.get('/market/liquidation/order', {
      symbol: params.symbol,
      exchange: params.exchange,
      min_amount: params.minAmount,
      side: params.side,
      sort_by: params.sortBy,
      order: params.order,
      limit: params.limit
    })
    return SurfLiquidationSchema.parse(json)
  }

  async getOptions(params: OptionsParams): Promise<SurfOptions> {
    const json = await this.get('/market/options', {
      symbol: params.symbol,
      sort_by: params.sortBy,
      order: params.order
    })
    return SurfOptionsSchema.parse(json)
  }

  async getEtfFlows(params: EtfFlowParams): Promise<SurfEtfFlow> {
    const json = await this.get('/market/etf', {
      symbol: params.symbol,
      sort_by: params.sortBy,
      order: params.order,
      from: params.from,
      to: params.to
    })
    return SurfEtfFlowSchema.parse(json)
  }

  // --- transport -----------------------------------------------------------

  private async get(path: string, query: Record<string, unknown>): Promise<unknown> {
    if (this.apiKey === '') {
      throw new Error(
        'SURFAI_API_KEY is not set — the `surf` command group is unavailable on this box'
      )
    }
    const url = new URL(`${SURF_API_PREFIX}${path}`, SURF_BASE_URL)
    for (const [key, value] of Object.entries(query)) {
      if (!isNullish(value)) {
        url.searchParams.set(key, String(value))
      }
    }
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        // Capital-B `Bearer` is required: SurfAI rejects a lowercase scheme, and
        // a bare key with no scheme at all, as a malformed header.
        Authorization: `Bearer ${this.apiKey}`
      }
    })
    if (!response.ok) {
      throw new Error(this.transportError({ path, status: response.status, response }))
    }
    const json: unknown = await response.json()
    return json
  }

  // A 402 here does not mean the balance is spent. SurfAI serves an anonymous
  // free tier that is evaluated BEFORE key auth, so a request that lost its
  // credential never 401s — it egresses unauthenticated and 402s once that
  // shared per-IP pool drains. Saying so turns an inscrutable quota error into
  // the injection failure it actually is.
  private transportError(params: {
    readonly path: string
    readonly status: number
    readonly response: Response
  }): string {
    const base = `SurfAI ${params.path} failed: ${params.status} ${params.response.statusText}`
    return params.status === 402
      ? `${base} — the request reached SurfAI without a key and fell back to the anonymous free tier, which is exhausted`
      : base
  }
}
