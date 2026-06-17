import z from 'zod'

import { ChainIdSchema } from '@/types/ChainId'
import { TokenIdSchema } from '@/types/crosschain'
import { BigNumberSchema } from '@/types/lang'
import { isNullish } from '@/utils/lang'

export const PredictionSortOrderSchema = z.enum(['asc', 'desc']).nullish()
export const PredictionDisplayFormatSchema = z.enum(['overview', 'table']).default('overview')
export type PredictionDisplayFormat = z.infer<typeof PredictionDisplayFormatSchema>

export const PredictionSchema = z.object({
  id: BigNumberSchema,
  title: z.string(),
  description: z.string(),
  image: z.string().nullish(),
  icon: z.string().nullish(),
  volume: BigNumberSchema.nullish(),
  liquidity: BigNumberSchema.nullish(),
  createdAt: z.number()
})
export type Prediction = z.infer<typeof PredictionSchema>

export const PolymarketListMarketsQuerySchema = z.object({
  id: z.array(z.number()).nullish(),
  slug: z.string().nullish(),
  tagId: z.number().nullish(),
  closed: z.boolean().nullish(),
  limit: z.number().nullish(),
  offset: z.number().nullish(),
  order: z.string().nullish(),
  ascending: z.boolean().nullish()
})
export type PolymarketListMarketsQuery = z.infer<typeof PolymarketListMarketsQuerySchema>

export const PolymarketListEventsQuerySchema = z.object({
  id: z.array(z.number()).nullish(),
  tagId: z.number().nullish(),
  slug: z.string().nullish(),
  tagSlug: z.string().nullish(),
  active: z.boolean().nullish(),
  archived: z.boolean().nullish(),
  closed: z.boolean().nullish(),
  limit: z.number().nullish(),
  offset: z.number().nullish(),
  order: z.string().nullish(),
  ascending: z.boolean().nullish()
})
export type PolymarketListEventsQuery = z.infer<typeof PolymarketListEventsQuerySchema>

export const PolymarketSearchQuerySchema = z.object({
  q: z.string().min(1),
  limitPerType: z.coerce.number().int().min(1).max(25).nullish(),
  eventsTag: z.array(z.string().min(1)).min(1).nullish()
})
export type PolymarketSearchQuery = z.infer<typeof PolymarketSearchQuerySchema>

export const PolymarketTokenSearchInputSchema = z.object({
  chainId: ChainIdSchema,
  tokenAddress: TokenIdSchema
})
export type PolymarketTokenSearchInput = z.infer<typeof PolymarketTokenSearchInputSchema>

export const OutcomesSchema = z.preprocess((val) => {
  if (isNullish(val)) return undefined
  if (typeof val !== 'string') return val
  try {
    return JSON.parse(val)
  } catch {
    return undefined
  }
}, z.array(z.string()).nullish())

export const OutcomePricesSchema = z.preprocess((val) => {
  if (isNullish(val)) return undefined
  if (typeof val !== 'string') return val
  try {
    return JSON.parse(val)
  } catch {
    return undefined
  }
}, z.array(BigNumberSchema).nullish())

export const PolymarketMarketSchema = z.object({
  id: z.coerce.number(),
  question: z.string().nullish(),
  description: z.string().nullish(),
  slug: z.string().nullish(),
  image: z.string().nullish(),
  icon: z.string().nullish(),
  twitterCardImage: z.string().nullish(),
  active: z.boolean().nullish(),
  closed: z.boolean().nullish(),
  volume: BigNumberSchema.nullish(),
  volumeNum: BigNumberSchema.nullish(),
  volume24hr: BigNumberSchema.nullish(),
  liquidity: BigNumberSchema.nullish(),
  liquidityNum: BigNumberSchema.nullish(),
  groupItemTitle: z.string().nullish(),
  createdAt: z.string().nullish(),
  outcomes: OutcomesSchema,
  outcomePrices: OutcomePricesSchema,
  endDate: z.string().nullish()
})
export type PolymarketMarket = z.infer<typeof PolymarketMarketSchema>

export const PolymarketEventSchema = z.object({
  id: z.coerce.number(),
  ticker: z.string(),
  title: z.string(),
  slug: z.string(),
  closed: z.boolean(),
  description: z.string().nullish(),
  startDate: z.string().nullish(),
  createdAt: z.string().nullish(),
  endDate: z.string().nullish(),
  image: z.string().nullish(),
  icon: z.string().nullish(),
  liquidity: BigNumberSchema.nullish(),
  volume: BigNumberSchema.nullish(),
  volume24hr: BigNumberSchema.nullish(),
  commentCount: z.number().nullish(),
  category: z.string().nullish(),
  markets: z.array(PolymarketMarketSchema)
})
export type PolymarketEvent = z.infer<typeof PolymarketEventSchema>

export const SelectedLeadingMarketSchema = z.object({
  market: PolymarketMarketSchema,
  leadingOutcome: z.string().nullish(),
  leadingProbability: BigNumberSchema.nullish()
})
export type SelectedLeadingMarket = z.infer<typeof SelectedLeadingMarketSchema>

export const PolymarketSearchResponseSchema = z.object({
  events: z.array(PolymarketEventSchema).nullish()
})
export type PolymarketSearchResponse = z.infer<typeof PolymarketSearchResponseSchema>

export const PredictionStateResponseSchema = z.discriminatedUnion('state', [
  z.object({
    state: z.literal('resolving')
  }),
  z.object({
    state: z.literal('resolved'),
    events: z.array(PolymarketEventSchema)
  })
])
export type PredictionStateResponse = z.infer<typeof PredictionStateResponseSchema>

export const PolymarketListMarketsInputSchema = z.object({
  id: z.array(z.coerce.number().int()).nullish(),
  slug: z.string().min(1).nullish(),
  tagId: z.coerce.number().int().nonnegative().nullish(),
  closed: z.boolean().nullish(),
  limit: z.coerce.number().int().min(1).max(100).nullish(),
  offset: z.coerce.number().int().nonnegative().nullish(),
  order: z.string().min(1).nullish(),
  ascending: z.boolean().nullish()
})
export type PolymarketListMarketsInput = z.infer<typeof PolymarketListMarketsInputSchema>

export const PolymarketListEventsInputSchema = z.object({
  id: z.array(z.coerce.number().int()).nullish(),
  tagId: z.coerce.number().int().nonnegative().nullish(),
  slug: z.string().min(1).nullish(),
  tagSlug: z.string().min(1).nullish(),
  active: z.boolean().nullish(),
  archived: z.boolean().nullish(),
  closed: z.boolean().nullish(),
  format: PredictionDisplayFormatSchema.nullish(),
  limit: z.coerce.number().int().min(1).max(100).nullish(),
  offset: z.coerce.number().int().nonnegative().nullish(),
  order: z.string().min(1).nullish(),
  ascending: z.boolean().nullish()
})
export type PolymarketListEventsInput = z.infer<typeof PolymarketListEventsInputSchema>

export const PolymarketSearchInputSchema = z.object({
  query: z.string().min(1),
  format: PredictionDisplayFormatSchema.nullish(),
  limitPerType: z.coerce.number().int().min(1).max(25).nullish(),
  eventsTag: z.array(z.string().min(1)).min(1).nullish()
})
export type PolymarketSearchInput = z.infer<typeof PolymarketSearchInputSchema>

export const PolymarketGetMarketInputSchema = z.object({
  marketId: z.string().min(1).nullish(),
  marketSlug: z.string().min(1).nullish()
})
export type PolymarketGetMarketInput = z.infer<typeof PolymarketGetMarketInputSchema>

export const PolymarketGetEventInputSchema = z.object({
  eventId: z.string().min(1).nullish(),
  eventSlug: z.string().min(1).nullish()
})
export type PolymarketGetEventInput = z.infer<typeof PolymarketGetEventInputSchema>

export const PolymarketMissingIdentifierErrorParamsSchema = z.object({
  identifiers: z.array(z.string().min(1)).min(1)
})
export type PolymarketMissingIdentifierErrorParams = z.infer<
  typeof PolymarketMissingIdentifierErrorParamsSchema
>
