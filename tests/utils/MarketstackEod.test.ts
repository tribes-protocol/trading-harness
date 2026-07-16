import { describe, expect, it } from 'vitest'

import type { MarketstackEodBar } from '@/types/Marketstack'
import { dominantCurrencyBars } from '@/utils/MarketstackEod'

function bar(date: string, close: number, currency: string | null): MarketstackEodBar {
  return {
    symbol: 'INTC',
    date,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1000,
    adj_close: close,
    split_factor: 1,
    dividend: 0,
    exchange_code: currency === 'USD' ? 'NASDAQ' : null,
    price_currency: currency
  }
}

describe('dominantCurrencyBars', () => {
  it('keeps the majority currency and reports the dropped count', () => {
    const bars = [
      bar('2026-07-15T00:00:00+0000', 103, 'USD'),
      bar('2026-07-14T00:00:00+0000', 108, 'USD'),
      bar('2026-07-13T00:00:00+0000', 103, 'USD'),
      bar('2026-06-16T00:00:00+0000', 117, 'CLP'),
      bar('2026-06-12T00:00:00+0000', 125, 'CLP')
    ]
    const result = dominantCurrencyBars(bars)
    expect(result.bars.map((b) => b.price_currency)).toEqual(['USD', 'USD', 'USD'])
    expect(result.droppedOtherCurrencies).toBe(2)
  })

  it('prefers USD on a tie', () => {
    const bars = [
      bar('2026-07-15T00:00:00+0000', 1, 'CLP'),
      bar('2026-07-14T00:00:00+0000', 2, 'USD')
    ]
    const result = dominantCurrencyBars(bars)
    expect(result.bars[0]?.price_currency).toBe('USD')
  })

  it('de-duplicates same-day bars within the dominant group', () => {
    const bars = [
      bar('2026-07-15T00:00:00+0000', 103, 'USD'),
      bar('2026-07-15T00:00:00+0000', 104, 'USD'),
      bar('2026-07-14T00:00:00+0000', 108, 'USD')
    ]
    const result = dominantCurrencyBars(bars)
    expect(result.bars).toHaveLength(2)
  })

  it('passes single-currency series through untouched', () => {
    const bars = [bar('2026-07-15T00:00:00+0000', 103, 'USD')]
    expect(dominantCurrencyBars(bars)).toEqual({ bars, droppedOtherCurrencies: 0 })
  })
})
