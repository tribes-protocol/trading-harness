import { z } from 'zod'

// ---------------------------------------------------------------------------
// Heurist Mesh (mesh.heurist.xyz). One POST /mesh_request endpoint fronts every
// "agent"; the agent_id + tool in the BODY select the capability, and the reply
// is always `{ data: <tool payload> }` for a direct tool call.
//
// Two properties of this API shape the schemas below:
//
//  1. A tool-level failure is NOT an HTTP error. It arrives as 200 with the
//     failure inside `data` — either `data.error` or `data.status === 'error'`
//     — and it still burns the credit. Every schema therefore models the error
//     channel alongside the success channel, and the service inspects it.
//  2. Payload shapes are set by Heurist's per-agent code and are not versioned.
//     Known fields are typed; `.passthrough()` keeps everything else so a
//     Heurist-side addition reaches the agent instead of being silently dropped.
// ---------------------------------------------------------------------------

// The direct-tool-call envelope. `data` is the tool payload verbatim; the
// LLM-routed `query` mode would add a `response` string, which the harness never
// uses because it is slower and nondeterministic.
export const HeuristEnvelopeSchema = z
  .object({
    data: z.unknown()
  })
  .passthrough()
export type HeuristEnvelope = z.infer<typeof HeuristEnvelopeSchema>

// The failure channel carried inside a 200. `status` is present on the agents
// that use the status/data convention; `error` is the free-form message.
export const HeuristToolErrorSchema = z
  .object({
    status: z.string().nullish(),
    error: z.string().nullish(),
    message: z.string().nullish()
  })
  .passthrough()
export type HeuristToolError = z.infer<typeof HeuristToolErrorSchema>

// --- funding rates + open interest (FundingRateAgent) ---------------------

// Binance USDS-M premiumIndex + fundingRate history. `interval_hours` matters:
// funding is NOT universally 8h, so an APR computed against a hardcoded
// interval is wrong for any market on a 4h or 1h schedule.
export const HeuristFundingBlockSchema = z
  .object({
    latest_rate: z.number().nullish(),
    latest_rate_pct: z.string().nullish(),
    interval_hours: z.number().nullish(),
    apr: z.number().nullish(),
    apr_pct: z.string().nullish(),
    intervals_per_year: z.number().nullish()
  })
  .passthrough()
export type HeuristFundingBlock = z.infer<typeof HeuristFundingBlockSchema>

// get_symbol_funding_rates / get_symbol_oi_and_funding. `open_interest` is a
// pre-rendered English SENTENCE, not numbers — Heurist computes the structured
// OI trend internally and then throws it away before responding. It is passed
// through verbatim rather than parsed back out of prose.
export const HeuristSymbolFundingSchema = z
  .object({
    symbol: z.string().nullish(),
    funding: HeuristFundingBlockSchema.nullish(),
    open_interest: z.string().nullish()
  })
  .passthrough()
export type HeuristSymbolFunding = z.infer<typeof HeuristSymbolFundingSchema>

// A symbol whose market does not exist comes back as status 'no_data' rather
// than an error, so the caller can distinguish "unlisted" from "call failed".
export const HeuristSymbolFundingResponseSchema = z
  .object({
    status: z.string().nullish(),
    message: z.string().nullish(),
    data: HeuristSymbolFundingSchema.nullish()
  })
  .passthrough()
export type HeuristSymbolFundingResponse = z.infer<typeof HeuristSymbolFundingResponseSchema>

// get_all_funding_rates returns positional rows, not objects: `format` names the
// columns and `rates` holds [symbol, rate, interval, apr] tuples. Despite the
// tool name it covers only the five majors Heurist hardcodes (BTC/ETH/SOL/BNB/
// XRP), so it is a snapshot of the majors, never a venue-wide sweep.
export const HeuristAllFundingRatesSchema = z
  .object({
    rates: z.array(z.array(z.union([z.string(), z.number()]))).nullish(),
    format: z.array(z.string()).nullish()
  })
  .passthrough()
export type HeuristAllFundingRates = z.infer<typeof HeuristAllFundingRatesSchema>

// find_spot_futures_opportunities — cash-and-carry candidates above a funding
// floor. Row shape is Heurist-defined and undocumented; kept permissive.
export const HeuristBasisOpportunitiesSchema = z
  .object({
    opportunities: z.array(z.record(z.string(), z.unknown())).nullish(),
    status: z.string().nullish()
  })
  .passthrough()
export type HeuristBasisOpportunities = z.infer<typeof HeuristBasisOpportunitiesSchema>

// --- social intelligence (ElfaTwitterIntelligenceAgent) --------------------

// Elfa indexes SMART/influential accounts only — never the full firehose. That
// is the reason to call it alongside the raw X provider rather than instead of
// it: coverage is deliberately narrow and the signal is the curation.
export const HeuristMentionsSchema = z
  .object({
    status: z.string().nullish(),
    data: z.unknown(),
    error: z.string().nullish()
  })
  .passthrough()
export type HeuristMentions = z.infer<typeof HeuristMentionsSchema>

// get_trending_tokens deliberately discards Elfa's mention counts, change rates
// and sentiment, returning bare ticker strings. Treat it as a watchlist seed,
// not a ranking.
export const HeuristTrendingTokensSchema = z
  .object({
    status: z.string().nullish(),
    data: z
      .object({
        tokens: z.array(z.string()).nullish()
      })
      .passthrough()
      .nullish(),
    error: z.string().nullish()
  })
  .passthrough()
export type HeuristTrendingTokens = z.infer<typeof HeuristTrendingTokensSchema>

// --- token security (GoplusAnalysisAgent) ----------------------------------

// Honeypot / mint-authority / tax and LP-lock screening. Nothing else in the
// harness answers "can this token actually be sold", which is why it gates
// position sizing on low-caps rather than informing it.
export const HeuristTokenSecuritySchema = z
  .object({
    status: z.string().nullish(),
    data: z.unknown(),
    error: z.string().nullish()
  })
  .passthrough()
export type HeuristTokenSecurity = z.infer<typeof HeuristTokenSecuritySchema>

// --- DeFi metrics (DefiLlamaAgent) -----------------------------------------

// TVL, chain aggregates and yield pools — none of which the price-oriented
// providers (CoinGecko / BirdEye / GeckoTerminal) carry.
export const HeuristDefiMetricsSchema = z
  .object({
    status: z.string().nullish(),
    data: z.unknown(),
    error: z.string().nullish()
  })
  .passthrough()
export type HeuristDefiMetrics = z.infer<typeof HeuristDefiMetricsSchema>

// ---------------------------------------------------------------------------
// `tribes-cli mesh` command options.
// ---------------------------------------------------------------------------

const OutOptionSchema = z.string().nullish()

export const MeshFundingCommandOptionsSchema = z.object({
  symbol: z.string().min(1).nullish(),
  oi: z.boolean().nullish(),
  out: OutOptionSchema
})
export type MeshFundingCommandOptions = z.infer<typeof MeshFundingCommandOptionsSchema>

export const MeshBasisCommandOptionsSchema = z.object({
  minRate: z.number().nullish(),
  out: OutOptionSchema
})
export type MeshBasisCommandOptions = z.infer<typeof MeshBasisCommandOptionsSchema>

export const MeshMentionsCommandOptionsSchema = z.object({
  // Elfa caps this at three, and each entry must be a word or short phrase —
  // a sentence returns nothing.
  keyword: z.array(z.string().min(1)).min(1).max(3),
  days: z.number().int().min(1).nullish(),
  limit: z.number().int().min(1).max(100).nullish(),
  out: OutOptionSchema
})
export type MeshMentionsCommandOptions = z.infer<typeof MeshMentionsCommandOptionsSchema>

export const MeshAccountCommandOptionsSchema = z.object({
  username: z.string().min(1),
  days: z.number().int().min(1).nullish(),
  limit: z.number().int().min(1).max(100).nullish(),
  out: OutOptionSchema
})
export type MeshAccountCommandOptions = z.infer<typeof MeshAccountCommandOptionsSchema>

export const MeshTrendingCommandOptionsSchema = z.object({
  window: z.string().min(1).nullish(),
  out: OutOptionSchema
})
export type MeshTrendingCommandOptions = z.infer<typeof MeshTrendingCommandOptionsSchema>

export const MeshTokenSafetyCommandOptionsSchema = z.object({
  address: z.string().min(1),
  chainId: z.string().min(1).nullish(),
  out: OutOptionSchema
})
export type MeshTokenSafetyCommandOptions = z.infer<typeof MeshTokenSafetyCommandOptionsSchema>

export const MeshProtocolCommandOptionsSchema = z.object({
  protocol: z.string().min(1),
  out: OutOptionSchema
})
export type MeshProtocolCommandOptions = z.infer<typeof MeshProtocolCommandOptionsSchema>

export const MeshChainCommandOptionsSchema = z.object({
  chain: z.string().min(1),
  out: OutOptionSchema
})
export type MeshChainCommandOptions = z.infer<typeof MeshChainCommandOptionsSchema>

export const MeshYieldsCommandOptionsSchema = z.object({
  chain: z.array(z.string().min(1)).nullish(),
  project: z.array(z.string().min(1)).nullish(),
  symbol: z.array(z.string().min(1)).nullish(),
  stablecoin: z.boolean().nullish(),
  limit: z.number().int().min(1).max(100).nullish(),
  out: OutOptionSchema
})
export type MeshYieldsCommandOptions = z.infer<typeof MeshYieldsCommandOptionsSchema>
