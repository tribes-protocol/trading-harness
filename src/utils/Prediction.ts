import BigNumber from 'bignumber.js'

import type { PolymarketEvent, PolymarketMarket, SelectedLeadingMarket } from '@/types/Polymarket'
import { type PredictionEnrichedEvent, PredictionEnrichedEventSchema } from '@/types/Prediction'
import { isNullish } from '@/utils/Lang'

/**
 * Primary outcome for cross-market comparison: Polymarket uses index 0 as the affirmative outcome
 * on binary sub-markets (e.g. "Yes" for neg-risk "which option wins" events). Using the max of all
 * outcome prices would pick "No" on long shots (~1) and incorrectly beat the real favorite.
 *
 * For closed markets, we instead pick the highest-priced outcome to reflect the winning side.
 */
function getPrimaryOutcomeForRanking(market: PolymarketMarket): {
  outcome: string
  probability: BigNumber
} | null {
  if (market.closed === true) {
    const outcomes = market.outcomes
    const outcomePrices = market.outcomePrices

    if (isNullish(outcomes) || isNullish(outcomePrices)) {
      return null
    }

    let selectedOutcome: string | null = null
    let selectedProbability: BigNumber | null = null

    for (const [index, outcomePrice] of outcomePrices.entries()) {
      const outcome = outcomes[index]
      if (isNullish(outcome)) {
        continue
      }

      if (isNullish(selectedProbability) || outcomePrice.gt(selectedProbability)) {
        selectedOutcome = outcome
        selectedProbability = outcomePrice
      }
    }

    if (isNullish(selectedOutcome) || isNullish(selectedProbability)) {
      return null
    }

    return {
      outcome: selectedOutcome,
      probability: selectedProbability
    }
  }

  const firstOutcome = market.outcomes?.[0]
  const firstPrice = market.outcomePrices?.[0]
  if (isNullish(firstOutcome) || isNullish(firstPrice)) {
    return null
  }

  return {
    outcome: firstOutcome,
    probability: firstPrice
  }
}

function isBetterSelectedLeadingMarket(
  candidate: SelectedLeadingMarket,
  current: SelectedLeadingMarket
): boolean {
  const cProb = candidate.leadingProbability
  const curProb = current.leadingProbability

  if (!isNullish(cProb) && isNullish(curProb)) {
    return true
  }

  if (isNullish(cProb) && !isNullish(curProb)) {
    return false
  }

  if (!isNullish(cProb) && !isNullish(curProb) && !cProb.eq(curProb)) {
    return cProb.gt(curProb)
  }

  const cL = candidate.market.liquidity ?? new BigNumber(0)
  const curL = current.market.liquidity ?? new BigNumber(0)

  if (!cL.eq(curL)) {
    return cL.gt(curL)
  }

  return candidate.market.id < current.market.id
}

/**
 * Picks the single best market for an event.
 * If there is exactly one market, it is returned directly.
 * Otherwise, ranking runs across open sub-markets only by **first outcome** price
 * (`outcomes[0]` / `outcomePrices[0]`), then liquidity, then market id.
 */
export function selectLeadingMarket(event: PolymarketEvent): SelectedLeadingMarket | null {
  if (event.markets.length === 1) {
    const market = event.markets[0]
    if (isNullish(market)) {
      return null
    }
    const lead = getPrimaryOutcomeForRanking(market)
    return {
      market,
      leadingOutcome: lead?.outcome,
      leadingProbability: lead?.probability
    }
  }

  const markets = event.markets.filter((market) => market.closed !== true)
  let selected: SelectedLeadingMarket | null = null

  for (const market of markets) {
    const lead = getPrimaryOutcomeForRanking(market)
    const candidate: SelectedLeadingMarket = {
      market,
      leadingOutcome: lead?.outcome,
      leadingProbability: lead?.probability
    }

    if (isNullish(selected) || isBetterSelectedLeadingMarket(candidate, selected)) {
      selected = candidate
    }
  }

  if (isNullish(selected)) {
    return null
  }

  return selected
}

export function enrichEvent(event: PolymarketEvent): PredictionEnrichedEvent {
  return PredictionEnrichedEventSchema.parse({
    event,
    leadingMarket: selectLeadingMarket(event)
  })
}

export function enrichEvents(events: PolymarketEvent[]): PredictionEnrichedEvent[] {
  return events.map(enrichEvent)
}
