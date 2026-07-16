import { describe, expect, it } from 'vitest'

import type { HyperliquidPerpAsset } from '@/types/Hyperliquid'
import { computePerpMovers } from '@/utils/HyperliquidMovers'

const BASE: HyperliquidPerpAsset = {
  name: 'BASE',
  szDecimals: 2,
  maxLeverage: 10,
  isDelisted: false,
  onlyIsolated: false,
  marginMode: null,
  requiresIsolatedMargin: false,
  markPx: '100',
  referencePx: '100',
  midPx: '100',
  oraclePx: '100',
  prevDayPx: '100',
  dayNtlVlm: '5000000',
  dayBaseVlm: '50000',
  funding: '0.0000125',
  openInterest: '1000',
  premium: '0',
  impactPxs: ['99.9', '100.1']
}

function asset(overrides: Partial<HyperliquidPerpAsset>): HyperliquidPerpAsset {
  return { ...BASE, ...overrides }
}

const AS_OF = '2026-07-16T10:00:00.000Z'

describe('computePerpMovers', () => {
  it('filters delisted, frozen-price, and below-volume assets before ranking', () => {
    const result = computePerpMovers({
      dex: 'xyz',
      assets: [
        asset({ name: 'LIVE_UP', markPx: '110', prevDayPx: '100' }),
        asset({ name: 'DEAD', isDelisted: true, markPx: '90', prevDayPx: '100' }),
        asset({ name: 'NO_PRICE', markPx: null, prevDayPx: null }),
        asset({ name: 'THIN', dayNtlVlm: '500', markPx: '150', prevDayPx: '100' })
      ],
      minVolumeUsd: 1_000_000,
      limit: 10,
      asOf: AS_OF
    })

    expect(result.movers.map((m) => m.name)).toEqual(['LIVE_UP'])
    expect(result.live_asset_count).toBe(1)
    expect(result.skipped_not_live).toBe(3)
    expect(result.as_of).toBe(AS_OF)
  })

  it('ranks movers by absolute 24h change and computes both funding views', () => {
    const result = computePerpMovers({
      dex: 'main',
      assets: [
        asset({ name: 'SMALL_MOVE', markPx: '101', prevDayPx: '100' }),
        asset({ name: 'BIG_DOWN', markPx: '80', prevDayPx: '100', funding: '-0.0005' }),
        asset({ name: 'MID_UP', markPx: '112', prevDayPx: '100' })
      ],
      minVolumeUsd: 0,
      limit: 2,
      asOf: AS_OF
    })

    expect(result.movers.map((m) => m.name)).toEqual(['BIG_DOWN', 'MID_UP'])
    const bigDown = result.movers[0]
    expect(bigDown?.change_24h_pct).toBe(-20)
    // Raw decimal fraction preserved AND converted: -0.0005 raw = -0.05%/hr.
    expect(bigDown?.funding_hourly_raw).toBe(-0.0005)
    expect(bigDown?.funding_hourly_pct).toBe(-0.05)
  })

  it('flags funding extremes only at or beyond the 0.00005 raw threshold', () => {
    const result = computePerpMovers({
      dex: 'main',
      assets: [
        asset({ name: 'BASELINE', funding: '0.0000125' }),
        asset({ name: 'STRETCHED_NEG', funding: '-0.00006' }),
        asset({ name: 'STRETCHED_POS', funding: '0.0005' }),
        asset({ name: 'NO_FUNDING', funding: null })
      ],
      minVolumeUsd: 0,
      limit: 10,
      asOf: AS_OF
    })

    expect(result.funding_extremes.map((m) => m.name)).toEqual([
      'STRETCHED_POS',
      'STRETCHED_NEG'
    ])
  })
})
