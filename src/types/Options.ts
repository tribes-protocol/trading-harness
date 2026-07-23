import { z } from 'zod'

// ---------------------------------------------------------------------------
// Raw control-plane options proxy payloads (GET /stocks/options/:ticker and
// /stocks/options/:ticker/contract/:contract on the Tribes API,
// Massive-backed). The API serializes BigNumber fields through toJsonTree,
// so numeric fields arrive as decimal strings.
// ---------------------------------------------------------------------------

const OptionsProxyNumberSchema = z.union([z.number(), z.string()]).nullish()

export const OptionsProxyContractSchema = z.object({
  break_even_price: OptionsProxyNumberSchema,
  day: z
    .object({
      o: OptionsProxyNumberSchema,
      h: OptionsProxyNumberSchema,
      l: OptionsProxyNumberSchema,
      c: OptionsProxyNumberSchema,
      v: OptionsProxyNumberSchema,
      change_percent: OptionsProxyNumberSchema,
      previous_close: OptionsProxyNumberSchema
    })
    .nullish(),
  details: z.object({
    ticker: z.string(),
    contract_type: z.string().nullish(),
    expiration_date: z.string().nullish(),
    strike_price: OptionsProxyNumberSchema,
    exercise_style: z.string().nullish(),
    shares_per_contract: z.number().nullish()
  }),
  greeks: z
    .object({
      delta: OptionsProxyNumberSchema,
      gamma: OptionsProxyNumberSchema,
      theta: OptionsProxyNumberSchema,
      vega: OptionsProxyNumberSchema
    })
    .nullish(),
  implied_volatility: OptionsProxyNumberSchema,
  last_quote: z
    .object({
      bid: OptionsProxyNumberSchema,
      ask: OptionsProxyNumberSchema,
      midpoint: OptionsProxyNumberSchema,
      bid_size: z.number().nullish(),
      ask_size: z.number().nullish()
    })
    .nullish(),
  open_interest: z.number().nullish(),
  underlying_asset: z
    .object({
      ticker: z.string().nullish(),
      price: OptionsProxyNumberSchema
    })
    .nullish()
})
export type OptionsProxyContract = z.infer<typeof OptionsProxyContractSchema>

export const OptionsProxyChainResponseSchema = z.array(OptionsProxyContractSchema)
export type OptionsProxyChainResponse = z.infer<typeof OptionsProxyChainResponseSchema>

// ---------------------------------------------------------------------------
// Raw direct Massive payloads (api.massive.com), options surface. Only the
// fields the harness surfaces are modeled.
// ---------------------------------------------------------------------------

export const MassiveOptionContractRefSchema = z.object({
  ticker: z.string(),
  underlying_ticker: z.string().nullish(),
  contract_type: z.string().nullish(),
  strike_price: z.number().nullish(),
  expiration_date: z.string().nullish(),
  exercise_style: z.string().nullish(),
  shares_per_contract: z.number().nullish()
})
export type MassiveOptionContractRef = z.infer<typeof MassiveOptionContractRefSchema>

export const MassiveOptionContractsResponseSchema = z.object({
  results: z.array(MassiveOptionContractRefSchema).nullish()
})
export type MassiveOptionContractsResponse = z.infer<typeof MassiveOptionContractsResponseSchema>

export const MassiveOptionTradeRowSchema = z.object({
  price: z.number(),
  size: z.number(),
  sip_timestamp: z.number(),
  exchange: z.number().nullish()
})
export type MassiveOptionTradeRow = z.infer<typeof MassiveOptionTradeRowSchema>

export const MassiveOptionTradesResponseSchema = z.object({
  results: z.array(MassiveOptionTradeRowSchema).nullish()
})
export type MassiveOptionTradesResponse = z.infer<typeof MassiveOptionTradesResponseSchema>

export const MassiveOptionQuoteRowSchema = z.object({
  bid_price: z.number().nullish(),
  ask_price: z.number().nullish(),
  bid_size: z.number().nullish(),
  ask_size: z.number().nullish(),
  sip_timestamp: z.number().nullish()
})
export type MassiveOptionQuoteRow = z.infer<typeof MassiveOptionQuoteRowSchema>

export const MassiveOptionQuotesResponseSchema = z.object({
  results: z.array(MassiveOptionQuoteRowSchema).nullish()
})
export type MassiveOptionQuotesResponse = z.infer<typeof MassiveOptionQuotesResponseSchema>

export const MassiveOptionLastTradeResponseSchema = z.object({
  results: z.object({
    p: z.number(),
    s: z.number().nullish(),
    t: z.number().nullish(),
    x: z.number().nullish()
  })
})
export type MassiveOptionLastTradeResponse = z.infer<typeof MassiveOptionLastTradeResponseSchema>

export const MassiveOptionAggBarSchema = z.object({
  t: z.number(),
  o: z.number(),
  h: z.number(),
  l: z.number(),
  c: z.number(),
  v: z.number().nullish()
})
export type MassiveOptionAggBar = z.infer<typeof MassiveOptionAggBarSchema>

export const MassiveOptionAggsResponseSchema = z.object({
  results: z.array(MassiveOptionAggBarSchema).nullish()
})
export type MassiveOptionAggsResponse = z.infer<typeof MassiveOptionAggsResponseSchema>

// ---------------------------------------------------------------------------
// Agent-facing output shapes printed by `tribes-cli options`.
// ---------------------------------------------------------------------------

export const OptionsContractTypeSchema = z.enum(['call', 'put'])
export type OptionsContractType = z.infer<typeof OptionsContractTypeSchema>

const OptionsChainRowSchema = z.object({
  contract: z.string(),
  type: z.string().nullish(),
  strike: z.number().nullish(),
  expiry: z.string().nullish(),
  bid: z.number().nullish(),
  ask: z.number().nullish(),
  mid: z.number().nullish(),
  iv: z.number().nullish(),
  delta: z.number().nullish(),
  gamma: z.number().nullish(),
  theta: z.number().nullish(),
  vega: z.number().nullish(),
  open_interest: z.number().nullish(),
  day_volume: z.number().nullish(),
  break_even: z.number().nullish()
})

export const OptionsChainSchema = z.object({
  source: z.literal('massive'),
  symbol: z.string(),
  underlying_price: z.number().nullish(),
  contracts: z.array(OptionsChainRowSchema)
})
export type OptionsChain = z.infer<typeof OptionsChainSchema>

export const OptionsContractDetailSchema = z.object({
  source: z.literal('massive'),
  contract: z.string(),
  underlying: z.string().nullish(),
  underlying_price: z.number().nullish(),
  type: z.string().nullish(),
  strike: z.number().nullish(),
  expiry: z.string().nullish(),
  exercise_style: z.string().nullish(),
  shares_per_contract: z.number().nullish(),
  bid: z.number().nullish(),
  ask: z.number().nullish(),
  mid: z.number().nullish(),
  iv: z.number().nullish(),
  delta: z.number().nullish(),
  gamma: z.number().nullish(),
  theta: z.number().nullish(),
  vega: z.number().nullish(),
  open_interest: z.number().nullish(),
  day_open: z.number().nullish(),
  day_high: z.number().nullish(),
  day_low: z.number().nullish(),
  day_close: z.number().nullish(),
  day_volume: z.number().nullish(),
  day_change_pct: z.number().nullish(),
  prev_close: z.number().nullish(),
  break_even: z.number().nullish()
})
export type OptionsContractDetail = z.infer<typeof OptionsContractDetailSchema>

const OptionsContractRefRowSchema = z.object({
  contract: z.string(),
  type: z.string().nullish(),
  strike: z.number().nullish(),
  expiry: z.string().nullish(),
  exercise_style: z.string().nullish(),
  shares_per_contract: z.number().nullish()
})

export const OptionsContractsSchema = z.object({
  source: z.literal('massive'),
  symbol: z.string(),
  contracts: z.array(OptionsContractRefRowSchema)
})
export type OptionsContracts = z.infer<typeof OptionsContractsSchema>

const OptionsTradeRowSchema = z.object({
  t: z.number(),
  price: z.number(),
  size: z.number(),
  exchange: z.number().nullish()
})

export const OptionsTradesSchema = z.object({
  source: z.literal('massive'),
  contract: z.string(),
  trades: z.array(OptionsTradeRowSchema)
})
export type OptionsTrades = z.infer<typeof OptionsTradesSchema>

const OptionsQuoteRowSchema = z.object({
  t: z.number().nullish(),
  bid: z.number().nullish(),
  bid_size: z.number().nullish(),
  ask: z.number().nullish(),
  ask_size: z.number().nullish()
})

export const OptionsQuotesSchema = z.object({
  source: z.literal('massive'),
  contract: z.string(),
  quotes: z.array(OptionsQuoteRowSchema)
})
export type OptionsQuotes = z.infer<typeof OptionsQuotesSchema>

export const OptionsLastTradeSchema = z.object({
  source: z.literal('massive'),
  contract: z.string(),
  price: z.number(),
  size: z.number().nullish(),
  t: z.number().nullish(),
  exchange: z.number().nullish()
})
export type OptionsLastTrade = z.infer<typeof OptionsLastTradeSchema>

const OptionsCandleSchema = z.object({
  t: z.number(),
  o: z.number(),
  h: z.number(),
  l: z.number(),
  c: z.number(),
  v: z.number().nullish()
})

// Matches the shared candle contract ({source, candles}) consumed by
// `tribes-cli ta --candles-file`.
export const OptionsCandlesSchema = z.object({
  source: z.literal('massive'),
  contract: z.string(),
  candles: z.array(OptionsCandleSchema)
})
export type OptionsCandles = z.infer<typeof OptionsCandlesSchema>

export const OptionsPrevDaySchema = z.object({
  source: z.literal('massive'),
  contract: z.string(),
  t: z.number().nullish(),
  o: z.number().nullish(),
  h: z.number().nullish(),
  l: z.number().nullish(),
  c: z.number().nullish(),
  v: z.number().nullish()
})
export type OptionsPrevDay = z.infer<typeof OptionsPrevDaySchema>

// ---------------------------------------------------------------------------
// `tribes-cli options` command options.
// ---------------------------------------------------------------------------

export const OptionsChainCommandOptionsSchema = z.object({
  symbol: z.string().min(1),
  expiry: z.string().min(1).nullish(),
  strikeRange: z
    .string()
    .regex(/^\d+(\.\d+)?-\d+(\.\d+)?$/, 'Expected MIN-MAX, e.g. 180-220')
    .nullish(),
  limit: z.number().int().min(1).max(250).nullish(),
  out: z.string().nullish()
})
export type OptionsChainCommandOptions = z.infer<typeof OptionsChainCommandOptionsSchema>

export const OptionsContractCommandOptionsSchema = z.object({
  contract: z.string().min(1),
  out: z.string().nullish()
})
export type OptionsContractCommandOptions = z.infer<typeof OptionsContractCommandOptionsSchema>

export const OptionsContractsCommandOptionsSchema = z.object({
  symbol: z.string().min(1),
  expiry: z.string().min(1).nullish(),
  type: OptionsContractTypeSchema.nullish(),
  limit: z.number().int().min(1).max(1000).nullish(),
  out: z.string().nullish()
})
export type OptionsContractsCommandOptions = z.infer<typeof OptionsContractsCommandOptionsSchema>

export const OptionsTicksCommandOptionsSchema = z.object({
  contract: z.string().min(1),
  limit: z.number().int().min(1).max(1000).nullish(),
  out: z.string().nullish()
})
export type OptionsTicksCommandOptions = z.infer<typeof OptionsTicksCommandOptionsSchema>

export const OptionsCandlesCommandOptionsSchema = z.object({
  contract: z.string().min(1),
  from: z.string().min(1).nullish(),
  to: z.string().min(1).nullish(),
  limit: z.number().int().min(1).max(1000).nullish(),
  out: z.string().nullish()
})
export type OptionsCandlesCommandOptions = z.infer<typeof OptionsCandlesCommandOptionsSchema>
