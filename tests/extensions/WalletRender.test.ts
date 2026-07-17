import type { Theme } from '@earendil-works/pi-coding-agent'
import { describe, expect, test } from 'vitest'

import { renderWalletStatusWidget } from '../../.pi/extensions/tribes/wallet/Render.ts'
import type { WalletAsset, WalletStatus } from '../../.pi/extensions/tribes/wallet/StatusTypes.ts'

const theme = {
  fg: (_color: string, value: string) => value,
  bold: (value: string) => value
} as unknown as Theme

function asset(overrides: Partial<WalletAsset> = {}): WalletAsset {
  return {
    kind: 'erc20',
    address: 'network',
    name: 'Ether',
    symbol: 'ETH',
    chainId: 1,
    wallet: '0x1111111111111111111111111111111111111111',
    balance: 1.25,
    balanceUsd: 2500,
    usdPrice: 2000,
    usdPrice24hrPercentChange: 2.4,
    verified: 'verified',
    ...overrides
  }
}

function status(overrides: Partial<WalletStatus> = {}): WalletStatus {
  const assets = [
    asset({
      address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      name: 'USD Coin',
      symbol: 'USDC',
      chainId: 8453,
      balance: 500,
      balanceUsd: 500,
      usdPrice: 1,
      usdPrice24hrPercentChange: null
    }),
    asset()
  ]
  return {
    ok: true,
    schema: 'wallet-status.v1',
    updatedAt: '2026-07-17T08:30:00.000Z',
    accountSource: 'wallet-assets',
    wallets: [
      '0x1111111111111111111111111111111111111111',
      '7YWHMfk9JZe0LM0g1SZ5W9qzW9rTiFAKEsolana'
    ],
    assets,
    totalUsd: 3000,
    initializing: false,
    unauthenticated: false,
    stale: false,
    error: null,
    ...overrides
  }
}

function render(value: WalletStatus, width = 140, scrollOffset = 0, refreshing = false): string {
  return renderWalletStatusWidget(value, theme, width, refreshing, scrollOffset, 'wallet').join(
    '\n'
  )
}

describe('Wallet status widget', () => {
  test('renders a sorted wide balance ledger and shared panel rail', () => {
    const output = render(status())

    expect(output).toContain('▎Wallet')
    expect(output).toContain('Hyperliquid')
    expect(output.indexOf('Hyperliquid')).toBeLessThan(output.indexOf('▎Wallet'))
    expect(output).toContain('ctrl+alt+w')
    expect(output).not.toContain('ctrl+shift+tab')
    expect(output).toContain('total $3.00k')
    expect(output).toContain('Network')
    expect(output).toContain('Price')
    expect(output).toContain('24h')
    expect(output).toContain('Value / Share')
    expect(output).toContain('Wallet')
    expect(output.indexOf('ETH')).toBeLessThan(output.indexOf('USDC'))
    expect(output).toContain('▲ 2.4%')
    expect(output).toContain('█')
    expect(output).toContain('—')
  })

  test('keeps the essential balance columns on narrower terminals', () => {
    const output = render(status(), 70)

    expect(output).toContain('Asset')
    expect(output).toContain('Balance')
    expect(output).toContain('Value')
    expect(output).not.toContain('Network')
    expect(output).not.toContain('Price')
    expect(output).not.toContain('Value / Share')
  })

  test('renders negative price changes and refresh state', () => {
    const negative = asset({
      symbol: 'SOL',
      chainId: 'solana',
      address: 'So11111111111111111111111111111111111111111',
      usdPrice24hrPercentChange: -7.25
    })
    const output = render(
      status({ assets: [negative], totalUsd: negative.balanceUsd }),
      140,
      0,
      true
    )

    expect(output).toContain('▼ 7.3%')
    expect(output).toContain('Solana')
    expect(output).toContain('syncing…')
  })

  test('pages long balance lists twelve rows at a time', () => {
    const assets = Array.from({ length: 14 }, (_, index) =>
      asset({
        name: `Asset ${index + 1}`,
        symbol: `T${index + 1}`,
        balanceUsd: 140 - index,
        usdPrice: 1
      })
    )
    const output = render(status({ assets, totalUsd: 1869 }), 140, 12)

    expect(output).toContain('T13')
    expect(output).toContain('T14')
    expect(output).not.toContain('T12 ')
    expect(output).toContain('↕ 13–14 of 14')
  })

  test('renders loading, login, failure, empty, and cached states', () => {
    const unavailable = status({
      ok: false,
      assets: [],
      totalUsd: 0,
      wallets: [],
      error: 'Wallet addresses are unavailable'
    })
    expect(render({ ...unavailable, initializing: true })).toContain('Loading wallet accounts…')
    expect(render({ ...unavailable, unauthenticated: true })).toContain('/tribes:login')
    expect(render(unavailable)).toContain('Wallet addresses are unavailable')
    expect(render(status({ assets: [], totalUsd: 0 }))).toContain('No wallet balances found')
    expect(render(status({ stale: true, error: 'Refresh failed' }))).toContain('cached')
  })
})
