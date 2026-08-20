import { describe, expect, test } from 'vitest'

import {
  cardSparkline,
  downsampleEquityCurve,
  formatPnlUsd,
  formatSize,
  formatWhen,
  pnlClass,
  sparklineSvg,
  statusLabel
} from '../../scripts/TradeJournalHtml'

// ---------------------------------------------------------------------------
// Trade-journal feed redesign — sparkline + formatting convention tests.
//
// Covers the two renderer guarantees the plan asks for: the sparkline
// downsample/fallback behavior (7 of 9 reports have a curve, 2 are sparse) and
// the feed's formatting conventions (date, status pill, size, PnL).
// ---------------------------------------------------------------------------

const CURVE = [
  { date: '2026-08-20T10:00:00Z', equityUsd: 700 },
  { date: '2026-08-20T10:05:00Z', equityUsd: 715 },
  { date: '2026-08-20T10:10:00Z', equityUsd: 709 },
  { date: '2026-08-20T10:15:00Z', equityUsd: 730 },
  { date: '2026-08-20T10:20:00Z', equityUsd: 742 }
]

describe('sparkline downsample', () => {
  test('empty/null curves yield empty downsampled output', () => {
    expect(downsampleEquityCurve(null)).toEqual([])
    expect(downsampleEquityCurve(undefined)).toEqual([])
    expect(downsampleEquityCurve([])).toEqual([])
  })

  test('a single-point curve stays single-point', () => {
    const one = downsampleEquityCurve([{ date: 'a', equityUsd: 700 }])
    expect(one).toHaveLength(1)
  })

  test('a curve shorter than max stays as-is', () => {
    expect(downsampleEquityCurve(CURVE)).toHaveLength(CURVE.length)
  })

  test('a long curve downsamples to at most 12 points and keeps endpoints', () => {
    const long = Array.from({ length: 200 }, (_, i) => ({
      date: String(i),
      equityUsd: 700 + (i % 50)
    }))
    const out = downsampleEquityCurve(long)
    expect(out.length).toBeLessThanOrEqual(12)
    expect(out[0]?.equityUsd).toBe(700)
    expect(out[out.length - 1]?.equityUsd).toBe(700 + (199 % 50))
  })
})

describe('sparkline SVG', () => {
  test('renders a path element for a ≥2-point curve', () => {
    const svg = sparklineSvg(CURVE)
    expect(svg).toContain('<svg')
    expect(svg).toContain('<path')
    expect(svg).toContain('fill="none"')
  })

  test('returns empty string when curve absent or ≤1 point (caller renders fallback)', () => {
    expect(sparklineSvg(null)).toBe('')
    expect(sparklineSvg([])).toBe('')
    expect(sparklineSvg([{ date: 'a', equityUsd: 700 }])).toBe('')
  })

  test('card sparkline falls back to the quiet marker for sparse reports', () => {
    const card = cardSparkline({ equityCurve: [] })
    expect(card).toContain('no-curve')
    expect(card).toContain('dot')
    const noReport = cardSparkline(null)
    expect(noReport).toContain('no-curve')
  })
})

describe('feed formatting conventions', () => {
  test('opened timestamp renders as YYYY-MM-DD HH:MM (UTC)', () => {
    const iso = '2026-08-20T13:45:02.000Z'
    const ts = Date.parse(iso)
    expect(formatWhen(ts)).toBe('2026-08-20 13:45')
  })

  test('PnL is signed and dollar-prefixed', () => {
    expect(formatPnlUsd(44.46)).toBe('+$44.46')
    expect(formatPnlUsd(-20.17)).toBe('$-20.17')
    expect(formatPnlUsd(0)).toBe('$0.00')
  })

  test('positive/negative/flat PnL map to the right pill classes', () => {
    expect(pnlClass(1)).toBe('pos')
    expect(pnlClass(-1)).toBe('neg')
    expect(pnlClass(0)).toBe('flat')
  })

  test('size keeps 2 decimals for ≥1 and 4 for sub-1', () => {
    expect(formatSize(5)).toBe('5.00')
    expect(formatSize(0.06)).toBe('0.0600')
    expect(formatSize(0.0299)).toBe('0.0299')
  })

  test('status labels are the pill text', () => {
    expect(statusLabel('tp_hit')).toBe('TP HIT')
    expect(statusLabel('open')).toBe('OPEN')
    expect(statusLabel('filled')).toBe('FILLED')
    expect(statusLabel('closed')).toBe('CLOSED')
    expect(statusLabel('stopped')).toBe('STOPPED')
  })
})