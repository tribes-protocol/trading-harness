import { z } from 'zod'

import {
  PolymarketEventSchema,
  PolymarketGetEventInputSchema,
  PolymarketGetMarketInputSchema,
  PolymarketListEventsInputSchema,
  PolymarketListMarketsInputSchema,
  PolymarketSearchInputSchema,
  SelectedLeadingMarketSchema
} from '@/types/Polymarket'
import { isNullish } from '@/utils/lang'

const CliBooleanSchema = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((value) => (typeof value === 'boolean' ? value : value === 'true'))
  .nullish()

export const PredictionEnrichedEventSchema = z.object({
  event: PolymarketEventSchema,
  leadingMarket: SelectedLeadingMarketSchema.nullish()
})
export type PredictionEnrichedEvent = z.infer<typeof PredictionEnrichedEventSchema>

export const PredictionSearchCommandOptionsSchema = PolymarketSearchInputSchema.omit({
  format: true
}).extend({
  eventsTag: z.array(z.string().min(1)).nullish()
})

export const PredictionListEventsCommandOptionsSchema = PolymarketListEventsInputSchema.omit({
  format: true
}).extend({
  active: CliBooleanSchema,
  archived: CliBooleanSchema,
  closed: CliBooleanSchema,
  ascending: CliBooleanSchema
})
export type PredictionListEventsCommandOptions = z.infer<
  typeof PredictionListEventsCommandOptionsSchema
>

export const PredictionGetEventCommandOptionsSchema = PolymarketGetEventInputSchema.superRefine(
  (value, ctx) => {
    const hasEventId = !isNullish(value.eventId)
    const hasEventSlug = !isNullish(value.eventSlug)
    if (hasEventId === hasEventSlug) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide exactly one of --event-id or --event-slug'
      })
    }
  }
)
export type PredictionGetEventCommandOptions = z.infer<
  typeof PredictionGetEventCommandOptionsSchema
>

export const PredictionListMarketsCommandOptionsSchema = PolymarketListMarketsInputSchema.extend({
  closed: CliBooleanSchema,
  ascending: CliBooleanSchema
})

export const PredictionGetMarketCommandOptionsSchema = PolymarketGetMarketInputSchema.superRefine(
  (value, ctx) => {
    const hasMarketId = !isNullish(value.marketId)
    const hasMarketSlug = !isNullish(value.marketSlug)
    if (hasMarketId === hasMarketSlug) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide exactly one of --market-id or --market-slug'
      })
    }
  }
)
export type PredictionGetMarketCommandOptions = z.infer<
  typeof PredictionGetMarketCommandOptionsSchema
>
