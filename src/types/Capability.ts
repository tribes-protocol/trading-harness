import { z } from 'zod'

import { CoinDaysSchema } from '@/types/Coin'

// ---------------------------------------------------------------------------
// Unified capability payloads printed by `tribes-cli asset`. One shape per
// capability regardless of which provider answered; every response carries the
// routing envelope: `source` (the provider that answered) and `attempted`
// (every provider tried, with the reason it was skipped).
// ---------------------------------------------------------------------------

const CAPABILITY_OUTCOME_PATTERN = /^(ok|key_unset|timeout|empty|parse_error|not_found|http_\d{3})$/

export type CapabilityAttemptOutcome =
  | 'ok'
  | 'key_unset'
  | 'timeout'
  | 'empty'
  | 'parse_error'
  | 'not_found'
  | `http_${number}`

export const CapabilityAttemptOutcomeSchema = z.custom<CapabilityAttemptOutcome>(
  (value) => typeof value === 'string' && CAPABILITY_OUTCOME_PATTERN.test(value),
  { message: 'invalid capability attempt outcome' }
)

export const CapabilityAttemptSchema = z.object({
  provider: z.string(),
  outcome: CapabilityAttemptOutcomeSchema,
  detail: z.string().nullish()
})
export type CapabilityAttempt = z.infer<typeof CapabilityAttemptSchema>

const CapabilityEnvelopeSchema = z.object({
  source: z.string(),
  attempted: z.array(CapabilityAttemptSchema)
})

export const AssetTimeframeSchema = z.enum(['1m', '5m', '15m', '1h', '4h', '1d', '1w'])
export type AssetTimeframe = z.infer<typeof AssetTimeframeSchema>

export const AssetSpaceSchema = z.enum(['onchain', 'coins'])
export type AssetSpace = z.infer<typeof AssetSpaceSchema>

// --- price ---------------------------------------------------------------

export const AssetPriceQuotePayloadSchema = z.object({
  symbol: z.string().nullish(),
  price_usd: z.number().nullish(),
  market_cap_usd: z.number().nullish(),
  volume_24h_usd: z.number().nullish(),
  change_24h_pct: z.number().nullish(),
  liquidity_usd: z.number().nullish(),
  // Epoch seconds of the provider's last update, when reported.
  updated_at: z.number().nullish(),
  // True when the quote is a latest EOD close rather than a live price.
  stale: z.boolean().nullish()
})
export type AssetPriceQuotePayload = z.infer<typeof AssetPriceQuotePayloadSchema>

export const AssetPriceQuoteSchema = CapabilityEnvelopeSchema.extend(
  AssetPriceQuotePayloadSchema.shape
)
export type AssetPriceQuote = z.infer<typeof AssetPriceQuoteSchema>

// --- candles -------------------------------------------------------------

// Shared candle contract: t is epoch ms; v is nullish (CoinGecko coin OHLC
// has no volume).
const AssetCandleSchema = z.object({
  t: z.number(),
  o: z.number(),
  h: z.number(),
  l: z.number(),
  c: z.number(),
  v: z.number().nullish()
})

export const AssetCandlesPayloadSchema = z.object({
  candles: z.array(AssetCandleSchema)
})
export type AssetCandlesPayload = z.infer<typeof AssetCandlesPayloadSchema>

export const AssetCandlesSchema = CapabilityEnvelopeSchema.extend(AssetCandlesPayloadSchema.shape)
export type AssetCandles = z.infer<typeof AssetCandlesSchema>

// --- profile -------------------------------------------------------------

export const AssetProfilePayloadSchema = z.object({
  symbol: z.string().nullish(),
  name: z.string().nullish(),
  address: z.string().nullish(),
  id: z.string().nullish(),
  chain: z.string().nullish(),
  rank: z.number().nullish(),
  price_usd: z.number().nullish(),
  market_cap_usd: z.number().nullish(),
  fdv_usd: z.number().nullish(),
  liquidity_usd: z.number().nullish(),
  volume_24h_usd: z.number().nullish(),
  holders: z.number().nullish(),
  change_24h_pct: z.number().nullish(),
  sector: z.string().nullish(),
  industry: z.string().nullish(),
  exchange: z.string().nullish(),
  country: z.string().nullish(),
  links: z
    .object({
      homepage: z.string().nullish(),
      twitter: z.string().nullish(),
      telegram: z.string().nullish(),
      discord: z.string().nullish()
    })
    .nullish(),
  description: z.string().nullish()
})
export type AssetProfilePayload = z.infer<typeof AssetProfilePayloadSchema>

export const AssetProfileSchema = CapabilityEnvelopeSchema.extend(AssetProfilePayloadSchema.shape)
export type AssetProfile = z.infer<typeof AssetProfileSchema>

// --- trending / new listings ---------------------------------------------

const AssetListRowSchema = z.object({
  address: z.string().nullish(),
  id: z.string().nullish(),
  symbol: z.string().nullish(),
  name: z.string().nullish(),
  network: z.string().nullish(),
  rank: z.number().nullish(),
  price_usd: z.number().nullish(),
  change_24h_pct: z.number().nullish(),
  volume_24h_usd: z.number().nullish(),
  liquidity_usd: z.number().nullish(),
  market_cap_usd: z.number().nullish()
})

export const AssetTrendingListPayloadSchema = z.object({
  space: AssetSpaceSchema,
  items: z.array(AssetListRowSchema)
})
export type AssetTrendingListPayload = z.infer<typeof AssetTrendingListPayloadSchema>

export const AssetTrendingListSchema = CapabilityEnvelopeSchema.extend(
  AssetTrendingListPayloadSchema.shape
)
export type AssetTrendingList = z.infer<typeof AssetTrendingListSchema>

const AssetNewRowSchema = z.object({
  address: z.string().nullish(),
  id: z.string().nullish(),
  symbol: z.string().nullish(),
  name: z.string().nullish(),
  network: z.string().nullish(),
  liquidity_usd: z.number().nullish(),
  // ISO string (onchain listings) or epoch seconds (coin activations).
  listed_at: z.union([z.string(), z.number()]).nullish(),
  dex: z.string().nullish()
})

export const AssetNewListPayloadSchema = z.object({
  space: AssetSpaceSchema,
  items: z.array(AssetNewRowSchema)
})
export type AssetNewListPayload = z.infer<typeof AssetNewListPayloadSchema>

export const AssetNewListSchema = CapabilityEnvelopeSchema.extend(AssetNewListPayloadSchema.shape)
export type AssetNewList = z.infer<typeof AssetNewListSchema>

// --- search ---------------------------------------------------------------

const AssetSearchRowSchema = z.object({
  address: z.string().nullish(),
  id: z.string().nullish(),
  symbol: z.string().nullish(),
  name: z.string().nullish(),
  network: z.string().nullish(),
  rank: z.number().nullish(),
  price_usd: z.number().nullish(),
  liquidity_usd: z.number().nullish(),
  volume_24h_usd: z.number().nullish()
})

export const AssetSearchResultsPayloadSchema = z.object({
  query: z.string(),
  results: z.array(AssetSearchRowSchema)
})
export type AssetSearchResultsPayload = z.infer<typeof AssetSearchResultsPayloadSchema>

export const AssetSearchResultsSchema = CapabilityEnvelopeSchema.extend(
  AssetSearchResultsPayloadSchema.shape
)
export type AssetSearchResults = z.infer<typeof AssetSearchResultsSchema>

// --- holders --------------------------------------------------------------

const AssetHolderRowSchema = z.object({
  address: z.string().nullish(),
  label: z.string().nullish(),
  amount: z.number().nullish(),
  pct_supply: z.number().nullish(),
  value_usd: z.number().nullish()
})

export const AssetHoldersListPayloadSchema = z.object({
  address: z.string(),
  chain: z.string(),
  holders: z.array(AssetHolderRowSchema)
})
export type AssetHoldersListPayload = z.infer<typeof AssetHoldersListPayloadSchema>

export const AssetHoldersListSchema = CapabilityEnvelopeSchema.extend(
  AssetHoldersListPayloadSchema.shape
)
export type AssetHoldersList = z.infer<typeof AssetHoldersListSchema>

// ---------------------------------------------------------------------------
// `tribes-cli asset` command options. Identifier flags accept exactly one
// form: --address (+--chain) | --id | --ticker | --perp | --pool (+--chain),
// per subcommand.
// ---------------------------------------------------------------------------

const IdentifierOptionSchema = z.string().min(1).nullish()
const OutOptionSchema = z.string().nullish()

type IdentifierOptions = {
  readonly address?: string | null | undefined
  readonly chain?: string | null | undefined
  readonly id?: string | null | undefined
  readonly ticker?: string | null | undefined
  readonly perp?: string | null | undefined
  readonly pool?: string | null | undefined
}

function refineIdentifierForms(
  options: IdentifierOptions,
  ctx: z.RefinementCtx,
  forms: string[]
): void {
  const flags: Array<[string, string | null | undefined]> = [
    ['--address', options.address],
    ['--id', options.id],
    ['--ticker', options.ticker],
    ['--perp', options.perp],
    ['--pool', options.pool]
  ]
  const given = flags.filter(([, value]) => value !== null && value !== undefined)
  if (given.length !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `provide exactly one identifier: ${forms.join(' | ')}`
    })
    return
  }
  const needsChain = options.address ?? options.pool
  if (needsChain !== null && needsChain !== undefined) {
    if (options.chain === null || options.chain === undefined) {
      const flag =
        options.address === null || options.address === undefined ? '--pool' : '--address'
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${flag} requires --chain`
      })
    }
  } else if (options.chain !== null && options.chain !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: '--chain applies only to --address / --pool identifiers'
    })
  }
}

const AssetPriceCommandOptionsBaseSchema = z.object({
  address: IdentifierOptionSchema,
  chain: IdentifierOptionSchema,
  id: IdentifierOptionSchema,
  ticker: IdentifierOptionSchema,
  perp: IdentifierOptionSchema,
  out: OutOptionSchema
})

export const AssetPriceCommandOptionsSchema = AssetPriceCommandOptionsBaseSchema.superRefine(
  (options, ctx) => {
    refineIdentifierForms(options, ctx, ['--address --chain', '--id', '--ticker', '--perp'])
  }
)
export type AssetPriceCommandOptions = z.infer<typeof AssetPriceCommandOptionsSchema>

const AssetCandlesCommandOptionsBaseSchema = z.object({
  address: IdentifierOptionSchema,
  chain: IdentifierOptionSchema,
  id: IdentifierOptionSchema,
  ticker: IdentifierOptionSchema,
  pool: IdentifierOptionSchema,
  timeframe: AssetTimeframeSchema.nullish(),
  days: CoinDaysSchema.nullish(),
  out: OutOptionSchema
})

export const AssetCandlesCommandOptionsSchema = AssetCandlesCommandOptionsBaseSchema.superRefine(
  (options, ctx) => {
    refineIdentifierForms(options, ctx, ['--address --chain', '--id', '--ticker', '--pool --chain'])
    if (
      options.days !== null &&
      options.days !== undefined &&
      (options.id === null || options.id === undefined)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '--days applies only to --id (CoinGecko coin OHLC); use --timeframe otherwise'
      })
    }
    if (
      options.timeframe !== null &&
      options.timeframe !== undefined &&
      options.id !== null &&
      options.id !== undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '--timeframe does not apply to --id; use --days'
      })
    }
    if (
      options.ticker !== null &&
      options.ticker !== undefined &&
      options.timeframe !== null &&
      options.timeframe !== undefined &&
      options.timeframe !== '1d'
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'stock candles are EOD only — --ticker supports only --timeframe 1d'
      })
    }
  }
)
export type AssetCandlesCommandOptions = z.infer<typeof AssetCandlesCommandOptionsSchema>

const AssetProfileCommandOptionsBaseSchema = z.object({
  address: IdentifierOptionSchema,
  chain: IdentifierOptionSchema,
  id: IdentifierOptionSchema,
  ticker: IdentifierOptionSchema,
  out: OutOptionSchema
})

export const AssetProfileCommandOptionsSchema = AssetProfileCommandOptionsBaseSchema.superRefine(
  (options, ctx) => {
    refineIdentifierForms(options, ctx, ['--address --chain', '--id', '--ticker'])
  }
)
export type AssetProfileCommandOptions = z.infer<typeof AssetProfileCommandOptionsSchema>

const AssetTrendingCommandOptionsBaseSchema = z.object({
  space: AssetSpaceSchema.nullish(),
  chain: IdentifierOptionSchema,
  limit: z.number().int().min(1).max(50).nullish(),
  out: OutOptionSchema
})

export const AssetTrendingCommandOptionsSchema = AssetTrendingCommandOptionsBaseSchema.superRefine(
  (options, ctx) => {
    if (options.space === 'coins' && options.chain !== null && options.chain !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '--chain applies only to --space onchain'
      })
    }
  }
)
export type AssetTrendingCommandOptions = z.infer<typeof AssetTrendingCommandOptionsSchema>

export const AssetNewCommandOptionsSchema = z.object({
  space: AssetSpaceSchema.nullish(),
  limit: z.number().int().min(1).max(50).nullish(),
  out: OutOptionSchema
})
export type AssetNewCommandOptions = z.infer<typeof AssetNewCommandOptionsSchema>

export const AssetSearchCommandOptionsSchema = z.object({
  query: z.string().min(1),
  chain: IdentifierOptionSchema,
  limit: z.number().int().min(1).max(50).nullish(),
  out: OutOptionSchema
})
export type AssetSearchCommandOptions = z.infer<typeof AssetSearchCommandOptionsSchema>

export const AssetHoldersCommandOptionsSchema = z.object({
  address: z.string().min(1),
  chain: z.string().min(1),
  limit: z.number().int().min(1).max(100).nullish(),
  out: OutOptionSchema
})
export type AssetHoldersCommandOptions = z.infer<typeof AssetHoldersCommandOptionsSchema>
