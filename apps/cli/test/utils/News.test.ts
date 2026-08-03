import { describe, expect, it } from 'vitest'

import { toAssetIdentity } from '@/utils/News'

describe('toAssetIdentity', () => {
  it('maps token options', () => {
    expect(
      toAssetIdentity({
        kind: 'token',
        chainId: 1,
        tokenId: '0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        coin: null,
        ticker: null,
        cursor: null,
        out: null
      })
    ).toEqual({
      kind: 'token',
      chainId: 1,
      tokenId: '0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
    })
  })

  it('normalizes perp coin', () => {
    expect(
      toAssetIdentity({
        kind: 'perp',
        chainId: null,
        tokenId: null,
        coin: 'btc',
        ticker: null,
        cursor: null,
        out: null
      })
    ).toEqual({
      kind: 'perp',
      coin: 'BTC'
    })
  })

  it('normalizes stock ticker', () => {
    expect(
      toAssetIdentity({
        kind: 'stock',
        chainId: null,
        tokenId: null,
        coin: null,
        ticker: 'nvda',
        cursor: null,
        out: null
      })
    ).toEqual({
      kind: 'stock',
      ticker: 'NVDA'
    })
  })
})
