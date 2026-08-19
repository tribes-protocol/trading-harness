import { describe, expect, it } from 'vitest'

import type { TaCandle } from '@/types/Ta'
import { aggregateCandlesToDuration, aggregateCandlesToIsoWeeks } from '@/utils/Candles'

const MS_PER_HOUR = 3_600_000
const FOUR_HOURS = 4 * MS_PER_HOUR

// 2026-07-20 is a Monday; 2026-07-27 is the following Monday.
const MON_JUL_20 = Date.parse('2026-07-20T00:00:00Z')
const TUE_JUL_21 = Date.parse('2026-07-21T00:00:00Z')
const WED_JUL_22 = Date.parse('2026-07-22T00:00:00Z')
const FRI_JUL_24 = Date.parse('2026-07-24T00:00:00Z')
const SUN_JUL_26 = Date.parse('2026-07-26T00:00:00Z')
const MON_JUL_27 = Date.parse('2026-07-27T00:00:00Z')

function candle(t: number, o: number, h: number, l: number, c: number, v: number | null): TaCandle {
  return { t, o, h, l, c, v }
}

describe('aggregateCandlesToIsoWeeks', () => {
  it('rolls a trading week into one bar: first open, max high, min low, last close, summed volume', () => {
    const result = aggregateCandlesToIsoWeeks([
      candle(MON_JUL_20, 100, 105, 99, 104, 1000),
      candle(TUE_JUL_21, 104, 110, 103, 108, 2000),
      candle(FRI_JUL_24, 108, 109, 95, 97, 3000)
    ])

    expect(result).toEqual([candle(MON_JUL_20, 100, 110, 95, 97, 6000)])
  })

  it('stamps the Monday boundary even when the week opens mid-week', () => {
    // A Monday market holiday: the first bar of the week is Wednesday, but the
    // bar must still land on the Monday grid point.
    const result = aggregateCandlesToIsoWeeks([
      candle(WED_JUL_22, 100, 101, 99, 100, 10),
      candle(FRI_JUL_24, 100, 102, 98, 101, 20)
    ])

    expect(result).toHaveLength(1)
    expect(result[0]?.t).toBe(MON_JUL_20)
    expect(result[0]?.o).toBe(100)
    expect(result[0]?.c).toBe(101)
  })

  it('treats Sunday as the end of the ISO week, not the start of the next', () => {
    const result = aggregateCandlesToIsoWeeks([
      candle(SUN_JUL_26, 100, 101, 99, 100, 10),
      candle(MON_JUL_27, 200, 201, 199, 200, 20)
    ])

    expect(result.map((bar) => bar.t)).toEqual([MON_JUL_20, MON_JUL_27])
  })

  it('splits across week boundaries and returns buckets ascending', () => {
    const result = aggregateCandlesToIsoWeeks([
      candle(MON_JUL_27, 200, 210, 190, 205, 50),
      candle(MON_JUL_20, 100, 110, 90, 105, 40)
    ])

    expect(result.map((bar) => bar.t)).toEqual([MON_JUL_20, MON_JUL_27])
    expect(result.map((bar) => bar.c)).toEqual([105, 205])
  })

  it('sorts unordered input before rolling up so open and close are chronological', () => {
    const result = aggregateCandlesToIsoWeeks([
      candle(FRI_JUL_24, 108, 109, 95, 97, 3000),
      candle(MON_JUL_20, 100, 105, 99, 104, 1000),
      candle(TUE_JUL_21, 104, 110, 103, 108, 2000)
    ])

    expect(result[0]?.o).toBe(100)
    expect(result[0]?.c).toBe(97)
  })

  it('reports null volume when any bar in the week is missing volume', () => {
    const result = aggregateCandlesToIsoWeeks([
      candle(MON_JUL_20, 100, 105, 99, 104, 1000),
      candle(TUE_JUL_21, 104, 110, 103, 108, null)
    ])

    expect(result[0]?.v).toBeNull()
  })

  it('returns an empty series for empty input', () => {
    expect(aggregateCandlesToIsoWeeks([])).toEqual([])
  })

  it('passes a single bar through on its Monday boundary', () => {
    const result = aggregateCandlesToIsoWeeks([candle(FRI_JUL_24, 100, 105, 99, 104, 1000)])

    expect(result).toEqual([candle(MON_JUL_20, 100, 105, 99, 104, 1000)])
  })
})

describe('aggregateCandlesToDuration', () => {
  const H = (hour: number): number =>
    Date.parse(`2026-07-30T${String(hour).padStart(2, '0')}:00:00Z`)

  it('rolls four hourly bars into one 4h bar on the epoch-aligned boundary', () => {
    const result = aggregateCandlesToDuration(
      [
        candle(H(16), 100, 105, 99, 104, 10),
        candle(H(17), 104, 112, 103, 108, 20),
        candle(H(18), 108, 109, 95, 97, 30),
        candle(H(19), 97, 101, 96, 100, 40)
      ],
      FOUR_HOURS
    )

    expect(result).toEqual([candle(H(16), 100, 112, 95, 100, 100)])
  })

  it('splits on the 4h grid rather than every four rows', () => {
    // 15:00 belongs to the 12:00 bucket; the rest to the 16:00 bucket. Grouping
    // four consecutive rows instead would merge across the boundary.
    const result = aggregateCandlesToDuration(
      [
        candle(H(15), 90, 91, 89, 90, 5),
        candle(H(16), 100, 105, 99, 104, 10),
        candle(H(17), 104, 112, 103, 108, 20),
        candle(H(18), 108, 109, 95, 97, 30)
      ],
      FOUR_HOURS
    )

    expect(result.map((bar) => bar.t)).toEqual([H(12), H(16)])
    expect(result[0]).toEqual(candle(H(12), 90, 91, 89, 90, 5))
    expect(result[1]).toEqual(candle(H(16), 100, 112, 95, 97, 60))
  })

  it('keeps buckets on the grid when a session bar is missing', () => {
    // 17:00 absent — the 16:00 bucket still starts at 16:00 and the next bar
    // still lands in it, instead of drifting a slot forward.
    const result = aggregateCandlesToDuration(
      [candle(H(16), 100, 105, 99, 104, 10), candle(H(18), 108, 109, 95, 97, 30)],
      FOUR_HOURS
    )

    expect(result).toEqual([candle(H(16), 100, 109, 95, 97, 40)])
  })

  it('does not merge across an overnight gap', () => {
    const nextDay = Date.parse('2026-07-31T16:00:00Z')
    const result = aggregateCandlesToDuration(
      [candle(H(18), 108, 109, 95, 97, 30), candle(nextDay, 200, 210, 190, 205, 50)],
      FOUR_HOURS
    )

    expect(result.map((bar) => bar.t)).toEqual([H(16), nextDay])
  })

  it('returns an empty series for empty input', () => {
    expect(aggregateCandlesToDuration([], FOUR_HOURS)).toEqual([])
  })
})
