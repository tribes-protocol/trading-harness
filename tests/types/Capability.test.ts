import { describe, expect, it } from 'vitest'

import { AssetCandlesCommandOptionsSchema, AssetTimeframeSchema } from '@/types/Capability'

function tickerIssues(timeframe: string | null): string[] {
  const result = AssetCandlesCommandOptionsSchema.safeParse({ ticker: 'AAPL', timeframe })
  return result.success ? [] : result.error.issues.map((issue) => issue.message)
}

describe('AssetCandlesCommandOptionsSchema stock timeframes', () => {
  it('accepts every asset timeframe for --ticker', () => {
    for (const timeframe of AssetTimeframeSchema.options) {
      expect(tickerIssues(timeframe)).toEqual([])
    }
  })

  it('accepts --ticker with no timeframe', () => {
    expect(tickerIssues(null)).toEqual([])
  })

  it('still rejects a timeframe that is not an asset timeframe', () => {
    expect(tickerIssues('7h').length).toBeGreaterThan(0)
  })

  it('still rejects --timeframe combined with --id', () => {
    const result = AssetCandlesCommandOptionsSchema.safeParse({ id: 'bitcoin', timeframe: '1h' })
    expect(result.success).toBe(false)
  })
})
