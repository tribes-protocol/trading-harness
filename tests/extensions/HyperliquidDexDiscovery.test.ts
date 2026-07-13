import { describe, expect, test } from 'vitest'

import {
  FALLBACK_PERP_DEXES,
  resolvePerpDexes
} from '../../.pi/extensions/hyperliquid/DexDiscovery.ts'

describe('Hyperliquid perp dex discovery', () => {
  test('includes main and every discovered named dex exactly once', () => {
    expect(
      resolvePerpDexes([
        null,
        { name: 'xyz' },
        { name: 'vntl' },
        { name: 'xyz' },
        { name: '  hyna  ' }
      ])
    ).toEqual(['', 'xyz', 'vntl', 'hyna'])
  })

  test('retains the established main/xyz fallback for malformed discovery data', () => {
    expect(resolvePerpDexes([])).toEqual(FALLBACK_PERP_DEXES)
    expect(resolvePerpDexes([{ fullName: 'missing-name' }])).toEqual(FALLBACK_PERP_DEXES)
  })
})
