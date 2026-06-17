import { PolymarketEventSchema } from '@shared/types/Polymarket'
import { describe, expect, test } from 'vitest'

import { enrichEvent } from '@/utils/Prediction'

describe('prediction enrichment', () => {
  test('enrichEvent adds the same leading market selection', () => {
    const event = PolymarketEventSchema.parse({
      id: 1,
      ticker: 'FED-2026',
      title: 'Will Fed cut rates in 2026?',
      slug: 'will-fed-cut-rates-in-2026',
      closed: false,
      description: null,
      startDate: null,
      createdAt: null,
      endDate: null,
      image: null,
      icon: null,
      liquidity: null,
      volume: null,
      volume24hr: null,
      commentCount: null,
      category: null,
      markets: [
        {
          id: 11,
          question: 'Will the Fed cut rates by 25 bps?',
          description: null,
          slug: 'fed-cut-25bps',
          image: null,
          icon: null,
          twitterCardImage: null,
          active: true,
          closed: false,
          volume: null,
          volumeNum: null,
          volume24hr: null,
          liquidity: null,
          liquidityNum: null,
          groupItemTitle: null,
          createdAt: null,
          outcomes: '["Yes","No"]',
          outcomePrices: '["0.68","0.32"]',
          endDate: null
        }
      ]
    })

    const enrichedEvent = enrichEvent(event)

    expect(enrichedEvent.leadingMarket?.market.id).toBe(11)
    expect(enrichedEvent.leadingMarket?.leadingOutcome).toBe('Yes')
    expect(enrichedEvent.leadingMarket?.leadingProbability?.toFixed(2)).toBe('0.68')
  })
})
