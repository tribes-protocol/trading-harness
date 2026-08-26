import { describe, expect, test } from 'vitest'

import type { HyperliquidFill } from '@/types/Hyperliquid'
import { findRoundTripPairs } from '@/utils/RoundTripPairs'

function fill(partial: Partial<HyperliquidFill> & { side: 'buy' | 'sell' }): HyperliquidFill {
  return {
    dex: 'main',
    coin: 'ETH',
    market: 'perp',
    price: '2400',
    size: '0.2199',
    startPosition: '0',
    direction: '',
    closedPnl: '0',
    fee: '0',
    feeToken: 'USDC',
    hash: '0x0000000000000000000000000000000000000000000000000000000000000000',
    orderId: 1,
    tradeId: 1,
    timestamp: 1_000_000,
    crossed: true,
    ...partial
  }
}

describe('findRoundTripPairs (ghost-fill pair detector)', () => {
  test('equal-size buy+sell within the window is a round-trip pair', () => {
    const fills = [
      fill({ orderId: 924, side: 'buy', timestamp: 1_000_000, price: '2400', size: '0.2199' }),
      fill({ orderId: 926, side: 'sell', timestamp: 1_000_100, price: '2399.9', size: '0.2199' })
    ]
    const pairs = findRoundTripPairs(fills, 1000)
    expect(pairs).toHaveLength(1)
    expect(pairs[0]?.buyOrderId).toBe(924)
    expect(pairs[0]?.sellOrderId).toBe(926)
    expect(pairs[0]?.size).toBe('0.2199')
    expect(pairs[0]?.gapMs).toBe(100)
  })

  test('a single-leg fill (no opposite leg) produces no pair', () => {
    const fills = [fill({ orderId: 924, side: 'buy', timestamp: 1_000_000 })]
    expect(findRoundTripPairs(fills, 1000)).toHaveLength(0)
  })

  test('different sizes are NOT a pair (partial close, not a round-trip)', () => {
    const fills = [
      fill({ orderId: 924, side: 'buy', timestamp: 1_000_000, size: '0.2199' }),
      fill({ orderId: 926, side: 'sell', timestamp: 1_000_100, size: '0.1000' })
    ]
    expect(findRoundTripPairs(fills, 1000)).toHaveLength(0)
  })

  test('legs outside the window are not paired (timestamps too far apart)', () => {
    const fills = [
      fill({ orderId: 924, side: 'buy', timestamp: 1_000_000, size: '0.2199' }),
      fill({ orderId: 926, side: 'sell', timestamp: 1_000_000 + 5000, size: '0.2199' })
    ]
    expect(findRoundTripPairs(fills, 1000)).toHaveLength(0)
  })

  test('two sequential round-trips both detected, legs used once each', () => {
    const fills = [
      fill({ orderId: 924, side: 'buy', timestamp: 1_000_000, size: '0.2199' }),
      fill({ orderId: 926, side: 'sell', timestamp: 1_000_100, size: '0.2199' }),
      fill({ orderId: 434, side: 'buy', timestamp: 2_000_000, size: '0.2199' }),
      fill({ orderId: 436, side: 'sell', timestamp: 2_000_100, size: '0.2199' })
    ]
    const pairs = findRoundTripPairs(fills, 1000)
    expect(pairs).toHaveLength(2)
    expect(pairs.every((p) => p.size === '0.2199')).toBe(true)
  })

  test('the same leg is never used twice (no double counting)', () => {
    const fills = [
      fill({ orderId: 924, side: 'buy', timestamp: 1_000_000, size: '0.2199' }),
      fill({ orderId: 926, side: 'sell', timestamp: 1_000_100, size: '0.2199' }),
      fill({ orderId: 928, side: 'sell', timestamp: 1_000_200, size: '0.2199' })
    ]
    const pairs = findRoundTripPairs(fills, 1000)
    // Only one buy exists — only one pair possible; second sell unpaired.
    expect(pairs).toHaveLength(1)
  })

  test('coins are segmented — same size across different coins is not a pair', () => {
    const fills = [
      fill({ dex: 'main', coin: 'ETH', orderId: 924, side: 'buy', timestamp: 1_000_000 }),
      fill({ dex: 'main', coin: 'BTC', orderId: 926, side: 'sell', timestamp: 1_000_100 })
    ]
    expect(findRoundTripPairs(fills, 1000)).toHaveLength(0)
  })
})
