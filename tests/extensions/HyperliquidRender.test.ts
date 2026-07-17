import type { Theme } from '@earendil-works/pi-coding-agent'
import { describe, expect, test } from 'vitest'

import { renderHyperliquidPositionsWidget } from '../../.pi/extensions/hyperliquid/Render.ts'
import type { HlTab, HyperliquidStatus } from '../../.pi/extensions/hyperliquid/StatusTypes.ts'

const theme = {
  fg: (_color: string, value: string) => value,
  bold: (value: string) => value
} as unknown as Theme

const status: HyperliquidStatus = {
  ok: true,
  schema: 'hyperliquid-status.v1',
  updatedAt: '2026-07-10T22:35:55.000Z',
  mode: 'live',
  user: '0x0000000000000000000000000000000000000000',
  dexes: ['', 'xyz'],
  accountSource: 'hyperliquid-clearinghouse',
  accountError: null,
  hyperliquidAccounts: [
    {
      dex: '',
      equityUsd: 23.93,
      withdrawableUsd: 6.56,
      grossExposureUsd: 76.93,
      marginUsedUsd: 17.37
    },
    {
      dex: 'xyz',
      equityUsd: 89.45,
      withdrawableUsd: 69.72,
      grossExposureUsd: 29.83,
      marginUsedUsd: 19.73
    }
  ],
  equityUsd: 113.38,
  spotBalanceUsd: null,
  withdrawableUsd: 76.28,
  dailyPnlUsd: 0.06,
  dailyPnlPct: 0,
  allTimePnlUsd: 16.45,
  openPositions: 0,
  grossExposureUsd: 106.76,
  netExposureUsd: 106.76,
  marginUsedUsd: 37.1,
  positions: [],
  costSummary: null,
  closedPnl24h: null,
  topCandidates: [],
  totalTrades: 0,
  recentTrades: [],
  openOrders: [],
  ledgerUpdates: [],
  spotHoldings: []
}

function render(activeTab: HlTab): string {
  return renderHyperliquidPositionsWidget(status, theme, 200, false, activeTab).join('\n')
}

describe('Hyperliquid widget balances', () => {
  test('keeps the header to one total instead of a per-dex balance line', () => {
    const output = render('positions')

    expect(output).toContain('Wallet')
    expect(output).toContain('▎Hyperliquid')
    expect(output).toContain('/tribes:view')
    expect(output).toContain('total $113.38')
    expect(output).not.toContain('main eq')
    expect(output).not.toContain('xyz eq')
  })

  test('shows detailed per-dex balances in their own tab', () => {
    const output = render('balances')

    expect(output).toContain('Balances(2)')
    expect(output).toContain('Account')
    expect(output).toContain('main')
    expect(output).toContain('xyz')
    expect(output).toContain('$23.93')
    expect(output).toContain('$89.45')
  })
})
