import { describe, expect, it } from 'vitest'

import { AssetCandlesCommandOptionsSchema, type CandleWindow } from '@/types/Capability'
import type { TaCandle } from '@/types/Ta'
import {
  applyCandleWindow,
  resolveCandleWindow,
  toEpochSeconds,
  toIsoDate
} from '@/utils/CandleWindow'

const JUL_20 = Date.parse('2026-07-20T00:00:00Z')
const JUL_21 = Date.parse('2026-07-21T00:00:00Z')
const JUL_22 = Date.parse('2026-07-22T00:00:00Z')

function bar(t: number): TaCandle {
  return { t, o: 1, h: 2, l: 0.5, c: 1.5, v: 10 }
}

function window(from: number | null, to: number | null, limit: number): CandleWindow {
  return { from, to, limit }
}

describe('resolveCandleWindow', () => {
  it('normalises a calendar date to epoch ms and defaults the limit to 200', () => {
    const options = AssetCandlesCommandOptionsSchema.parse({ ticker: 'AAPL', from: '2026-07-20' })

    expect(resolveCandleWindow(options)).toEqual({ from: JUL_20, to: null, limit: 200 })
  })

  it('accepts a full ISO 8601 instant', () => {
    const options = AssetCandlesCommandOptionsSchema.parse({
      ticker: 'AAPL',
      to: '2026-07-22T00:00:00Z',
      limit: 500
    })

    expect(resolveCandleWindow(options)).toEqual({ from: null, to: JUL_22, limit: 500 })
  })

  it('leaves both bounds open when neither flag is given', () => {
    const options = AssetCandlesCommandOptionsSchema.parse({ ticker: 'AAPL' })

    expect(resolveCandleWindow(options)).toEqual({ from: null, to: null, limit: 200 })
  })
})

describe('AssetCandlesCommandOptionsSchema window validation', () => {
  function issues(input: Record<string, unknown>): string[] {
    const result = AssetCandlesCommandOptionsSchema.safeParse(input)
    return result.success ? [] : result.error.issues.map((issue) => issue.message)
  }

  it('rejects an unparseable date', () => {
    expect(issues({ ticker: 'AAPL', from: 'last tuesday' }).join(' ')).toContain('ISO 8601')
  })

  it('rejects --to earlier than --from', () => {
    expect(issues({ ticker: 'AAPL', from: '2026-07-22', to: '2026-07-20' })).toContain(
      '--to must not be earlier than --from'
    )
  })

  it('rejects a limit above the provider page cap', () => {
    expect(issues({ ticker: 'AAPL', limit: 1001 }).length).toBeGreaterThan(0)
  })

  it('rejects window flags on --id, which only has --days', () => {
    expect(issues({ id: 'bitcoin', from: '2026-07-20' })).toContain(
      '--from does not apply to --id; use --days'
    )
    expect(issues({ id: 'bitcoin', limit: 50 })).toContain(
      '--limit does not apply to --id; use --days'
    )
  })

  it('still accepts --days on --id', () => {
    expect(issues({ id: 'bitcoin', days: '30' })).toEqual([])
  })
})

describe('applyCandleWindow', () => {
  it('clips bars outside the range', () => {
    const result = applyCandleWindow(
      [bar(JUL_20), bar(JUL_21), bar(JUL_22)],
      window(JUL_21, JUL_22, 200)
    )

    expect(result.map((candle) => candle.t)).toEqual([JUL_21, JUL_22])
  })

  it('keeps the most recent bars when the provider returns more than the limit', () => {
    const result = applyCandleWindow([bar(JUL_20), bar(JUL_21), bar(JUL_22)], window(null, null, 2))

    expect(result.map((candle) => candle.t)).toEqual([JUL_21, JUL_22])
  })

  it('passes everything through when the window is open and under the limit', () => {
    const bars = [bar(JUL_20), bar(JUL_21)]

    expect(applyCandleWindow(bars, window(null, null, 200))).toEqual(bars)
  })
})

describe('unit conversion', () => {
  it('converts epoch ms to the seconds BirdEye and GeckoTerminal expect', () => {
    expect(toEpochSeconds(JUL_20)).toBe(JUL_20 / 1000)
    expect(toEpochSeconds(null)).toBeNull()
  })

  it('converts epoch ms to the calendar date Marketstack expects', () => {
    expect(toIsoDate(JUL_20)).toBe('2026-07-20')
    expect(toIsoDate(null)).toBeNull()
  })
})
