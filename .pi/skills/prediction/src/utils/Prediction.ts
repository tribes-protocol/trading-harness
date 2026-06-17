import { type PolymarketEvent } from '@shared/types/Polymarket'
import { selectLeadingMarket } from '@shared/utils/Prediction'

import type { PredictionEnrichedEvent } from '@/types/Prediction'
import { PredictionEnrichedEventSchema } from '@/types/Prediction'

export function enrichEvent(event: PolymarketEvent): PredictionEnrichedEvent {
  return PredictionEnrichedEventSchema.parse({
    event,
    leadingMarket: selectLeadingMarket(event)
  })
}

export function enrichEvents(events: PolymarketEvent[]): PredictionEnrichedEvent[] {
  return events.map(enrichEvent)
}
