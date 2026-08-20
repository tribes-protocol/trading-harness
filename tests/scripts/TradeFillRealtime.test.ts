import { describe, expect, test } from 'vitest'

import { fillJournalId, reconcileFillGaps, translateFill } from '../../scripts/TradeFillRealtime'
import type { HyperliquidUserFillWire } from '@/types/Hyperliquid'

function makeFill(
  over: Partial<HyperliquidUserFillWire> & { tid: number }
): HyperliquidUserFillWire {
  return {
    coin: 'SOL',
    px: '86.861',
    sz: '4.86',
    side: 'B',
    time: 1787170464000,
    startPosition: '0',
    dir: 'buy',
    closedPnl: '0',
    hash: `0x${'0'.repeat(62)}ab`,
    oid: 1,
    crossed: false,
    fee: '0',
    tid: over.tid,
    feeToken: 'USDC',
    twapId: null,
    ...over
  }
}

/** Minimal journal stub: upsert records ids; list returns them. No Bun DB needed. */
function journalStub(): {
  upsert: (row: { id: string }) => void
  list: (_: number, __: number) => Array<{ id: string }>
  rows: Array<{ id: string }>
} {
  const rows: Array<{ id: string }> = []
  return {
    rows,
    upsert: (row: { id: string }): void => {
      if (!rows.some((r) => r.id === row.id)) rows.push({ id: row.id })
    },
    list: (_limit: number, _offset: number): Array<{ id: string }> => [...rows]
  }
}

describe('realtime fill → journal (on-fill handler)', () => {
  test('translateFill maps a venue fill to a schema-compliant journal insert row', () => {
    const fill = makeFill({ tid: 99, coin: 'BTC', px: '71913', sz: '0.0259', side: 'B' })
    const row = translateFill(fill)
    expect(row.id).toBe('fill-99-BTC-B')
    expect(row.ticker).toBe('BTC')
    expect(row.dex).toBe('main')
    expect(row.side).toBe('long')
    expect(row.entryPrice).toBe(71913)
    expect(row.sizeBase).toBe(0.0259)
    expect(row.status).toBe('filled')
    expect(row.realizedPnlUsd).toBe(0)
    expect(row.notionalUsd).toBeCloseTo(71913 * 0.0259, 2)
  })

  test('a sell fill maps to short (side A)', () => {
    const row = translateFill(makeFill({ tid: 4, side: 'A', px: '86.5', sz: '3.1' }))
    expect(row.id).toBe('fill-4-SOL-A')
    expect(row.side).toBe('short')
    expect(row.entryPrice).toBe(86.5)
  })

  test('the same fill re-delivered never double-writes (deterministic id → idempotent upsert)', () => {
    const journal = journalStub()
    const fill = makeFill({ tid: 7 })
    const row1 = translateFill(fill)
    const row2 = translateFill(fill)
    expect(row1.id).toBe(row2.id) // determinism is the idempotency anchor
    journal.upsert(row1)
    journal.upsert(row2)
    expect(journal.list(100, 0)).toHaveLength(1)
  })
})

describe('reconcile gap-backfill (no-miss)', () => {
  test('backfills venue fills not present and skips ones already journaled', () => {
    const journal = journalStub()
    const fills = [makeFill({ tid: 1 }), makeFill({ tid: 2, coin: 'SOL' })]
    // First pass: both missing → both written.
    const existing: Set<string> = new Set()
    expect(reconcileFillGaps(journal, fills, existing)).toBe(2)
    // Second pass with the SAME fills and the now-populated set → nothing new.
    expect(reconcileFillGaps(journal, fills, existing)).toBe(0)
    expect(journal.rows).toHaveLength(2)
  })

  test('fill ids anchor on (tid, coin, side) so the same tid on different coins stays separate', () => {
    const sol = fillJournalId(makeFill({ tid: 9, coin: 'SOL' }))
    const btc = fillJournalId(makeFill({ tid: 9, coin: 'BTC' }))
    expect(sol).not.toBe(btc)
  })
})
