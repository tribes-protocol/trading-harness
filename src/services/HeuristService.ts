import {
  type HeuristAllFundingRates,
  HeuristAllFundingRatesSchema,
  type HeuristBasisOpportunities,
  HeuristBasisOpportunitiesSchema,
  type HeuristDefiMetrics,
  HeuristDefiMetricsSchema,
  HeuristEnvelopeSchema,
  type HeuristMentions,
  HeuristMentionsSchema,
  type HeuristSymbolFundingResponse,
  HeuristSymbolFundingResponseSchema,
  type HeuristTokenSecurity,
  HeuristTokenSecuritySchema,
  HeuristToolErrorSchema,
  type HeuristTrendingTokens,
  HeuristTrendingTokensSchema
} from '@/types/Heurist'
import { ensureJsonTreeString, isNullish } from '@/utils/Lang'

const HEURIST_BASE_URL = 'https://mesh.heurist.xyz'
const MESH_REQUEST_PATH = '/mesh_request'

// Agent ids are case-sensitive and are the keys of Heurist's metadata.json.
const FUNDING_AGENT = 'FundingRateAgent'
const SOCIAL_AGENT = 'ElfaTwitterIntelligenceAgent'
const SECURITY_AGENT = 'GoplusAnalysisAgent'
const DEFI_AGENT = 'DefiLlamaAgent'

type HeuristServiceParams = {
  readonly apiKey: string
}

type GetSymbolFundingParams = {
  readonly symbol: string
  readonly includeOpenInterest: boolean
}

type FindBasisParams = {
  readonly minFundingRate: number | null
}

type SearchMentionsParams = {
  readonly keywords: string[]
  readonly daysAgo: number | null
  readonly limit: number | null
}

type SearchAccountParams = {
  readonly username: string
  readonly daysAgo: number | null
  readonly limit: number | null
}

type TrendingTokensParams = {
  readonly timeWindow: string | null
}

type TokenSecurityParams = {
  readonly contractAddress: string
  readonly chainId: string | null
}

type ProtocolMetricsParams = {
  readonly protocol: string
}

type ChainMetricsParams = {
  readonly chain: string
}

type SearchYieldPoolsParams = {
  readonly chains: string[] | null
  readonly projects: string[] | null
  readonly symbols: string[] | null
  readonly stablecoin: boolean | null
  readonly limit: number | null
}

// Heurist Mesh. Every capability is one POST to the same path, distinguished by
// agent_id + tool in the body, so this service is a thin typed wrapper over that
// single call rather than a family of endpoints.
export class HeuristService {
  private readonly apiKey: string

  constructor(params: HeuristServiceParams) {
    this.apiKey = params.apiKey
  }

  // --- funding rates + open interest --------------------------------------

  // Funding for one perp. `includeOpenInterest` switches to the sibling tool
  // that appends an OI trend summary; it costs the same 0.1 credits, but the OI
  // it adds is English prose rather than numbers, so it is opt-in.
  async getSymbolFunding(params: GetSymbolFundingParams): Promise<HeuristSymbolFundingResponse> {
    const data = await this.callTool({
      agentId: FUNDING_AGENT,
      tool: params.includeOpenInterest ? 'get_symbol_oi_and_funding' : 'get_symbol_funding_rates',
      toolArguments: { symbol: params.symbol }
    })
    return HeuristSymbolFundingResponseSchema.parse(data)
  }

  // Funding across the majors. Heurist hardcodes the symbol set (BTC, ETH, SOL,
  // BNB, XRP) despite the tool name — this is not a venue-wide sweep, and a
  // symbol missing from the result was never queried rather than having no data.
  async getAllFundingRates(): Promise<HeuristAllFundingRates> {
    const data = await this.callTool({
      agentId: FUNDING_AGENT,
      tool: 'get_all_funding_rates',
      toolArguments: {}
    })
    return HeuristAllFundingRatesSchema.parse(data)
  }

  async findBasisOpportunities(params: FindBasisParams): Promise<HeuristBasisOpportunities> {
    const data = await this.callTool({
      agentId: FUNDING_AGENT,
      tool: 'find_spot_futures_opportunities',
      toolArguments: isNullish(params.minFundingRate)
        ? {}
        : { min_funding_rate: params.minFundingRate }
    })
    return HeuristBasisOpportunitiesSchema.parse(data)
  }

  // --- social intelligence -------------------------------------------------

  async searchMentions(params: SearchMentionsParams): Promise<HeuristMentions> {
    const data = await this.callTool({
      agentId: SOCIAL_AGENT,
      tool: 'search_mentions',
      toolArguments: {
        keywords: params.keywords,
        ...(isNullish(params.daysAgo) ? {} : { days_ago: params.daysAgo }),
        ...(isNullish(params.limit) ? {} : { limit: params.limit })
      }
    })
    return HeuristMentionsSchema.parse(data)
  }

  async searchAccount(params: SearchAccountParams): Promise<HeuristMentions> {
    const data = await this.callTool({
      agentId: SOCIAL_AGENT,
      tool: 'search_account',
      toolArguments: {
        username: params.username,
        ...(isNullish(params.daysAgo) ? {} : { days_ago: params.daysAgo }),
        ...(isNullish(params.limit) ? {} : { limit: params.limit })
      }
    })
    return HeuristMentionsSchema.parse(data)
  }

  async getTrendingTokens(params: TrendingTokensParams): Promise<HeuristTrendingTokens> {
    const data = await this.callTool({
      agentId: SOCIAL_AGENT,
      tool: 'get_trending_tokens',
      toolArguments: isNullish(params.timeWindow) ? {} : { time_window: params.timeWindow }
    })
    return HeuristTrendingTokensSchema.parse(data)
  }

  // --- token security ------------------------------------------------------

  async getTokenSecurity(params: TokenSecurityParams): Promise<HeuristTokenSecurity> {
    const data = await this.callTool({
      agentId: SECURITY_AGENT,
      tool: 'fetch_security_details',
      toolArguments: {
        contract_address: params.contractAddress,
        ...(isNullish(params.chainId) ? {} : { chain_id: params.chainId })
      }
    })
    return HeuristTokenSecuritySchema.parse(data)
  }

  // --- DeFi metrics --------------------------------------------------------

  async getProtocolMetrics(params: ProtocolMetricsParams): Promise<HeuristDefiMetrics> {
    const data = await this.callTool({
      agentId: DEFI_AGENT,
      tool: 'get_protocol_metrics',
      toolArguments: { protocol: params.protocol }
    })
    return HeuristDefiMetricsSchema.parse(data)
  }

  async getChainMetrics(params: ChainMetricsParams): Promise<HeuristDefiMetrics> {
    const data = await this.callTool({
      agentId: DEFI_AGENT,
      tool: 'get_chain_metrics',
      toolArguments: { chain: params.chain }
    })
    return HeuristDefiMetricsSchema.parse(data)
  }

  async searchYieldPools(params: SearchYieldPoolsParams): Promise<HeuristDefiMetrics> {
    const data = await this.callTool({
      agentId: DEFI_AGENT,
      tool: 'search_yield_pools',
      toolArguments: {
        ...(isNullish(params.chains) ? {} : { chains: params.chains }),
        ...(isNullish(params.projects) ? {} : { projects: params.projects }),
        ...(isNullish(params.symbols) ? {} : { symbols: params.symbols }),
        ...(isNullish(params.stablecoin) ? {} : { stablecoin: params.stablecoin }),
        ...(isNullish(params.limit) ? {} : { limit: params.limit })
      }
    })
    return HeuristDefiMetricsSchema.parse(data)
  }

  // --- transport -----------------------------------------------------------

  // One direct tool call. The key rides `Authorization: Bearer` — Heurist also
  // accepts an `api_key` body field, but the header wins when both are present
  // and the body is the one place the egress proxy cannot reach, so the header
  // is the only form this harness ever sends.
  private async callTool(params: {
    readonly agentId: string
    readonly tool: string
    readonly toolArguments: Record<string, unknown>
  }): Promise<unknown> {
    if (this.apiKey === '') {
      throw new Error(
        'HEURIST_API_KEY is not set — the `mesh` command group is unavailable on this box'
      )
    }
    const url = new URL(MESH_REQUEST_PATH, HEURIST_BASE_URL)
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`
      },
      body: ensureJsonTreeString({
        agent_id: params.agentId,
        input: { tool: params.tool, tool_arguments: params.toolArguments }
      })
    })
    if (!response.ok) {
      throw new Error(
        `Heurist ${params.agentId}.${params.tool} failed: ${response.status} ${response.statusText}`
      )
    }
    const json: unknown = await response.json()
    const envelope = HeuristEnvelopeSchema.parse(json)
    this.assertToolSucceeded({ agentId: params.agentId, tool: params.tool, data: envelope.data })
    return envelope.data
  }

  // A failed Heurist tool answers 200 with the failure inside `data`, and the
  // credit is spent either way. Without this check a caller would parse an error
  // body as a result and report "no funding data" for what was actually an
  // upstream outage — so surface it as the error it is.
  private assertToolSucceeded(params: {
    readonly agentId: string
    readonly tool: string
    readonly data: unknown
  }): void {
    const parsed = HeuristToolErrorSchema.safeParse(params.data)
    if (!parsed.success) {
      return
    }
    const { status, error, message } = parsed.data
    const failed = !isNullish(error) || status === 'error'
    if (!failed) {
      return
    }
    const detail = error ?? message ?? 'unknown error'
    throw new Error(`Heurist ${params.agentId}.${params.tool} failed: ${detail}`)
  }
}
