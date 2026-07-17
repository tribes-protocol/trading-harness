import { DynamicBorder, type Theme } from '@earendil-works/pi-coding-agent'
import { Container, hyperlink, Text, truncateToWidth, visibleWidth } from '@earendil-works/pi-tui'

import type { StatusPanel } from './PanelState.ts'
import type { WalletAsset, WalletStatus } from './StatusTypes.ts'
import { renderStatusViewRail } from './ViewRail.ts'

export const MAX_WALLET_ROWS = 12

interface Column {
  readonly key: 'asset' | 'network' | 'balance' | 'price' | 'change' | 'value' | 'wallet'
  readonly label: string
  readonly width: number
  readonly align: 'left' | 'right'
}

type ColumnDefinition = Omit<Column, 'width'>

const COLUMN_GAP = '  '

const CHAIN_LABELS: Readonly<Record<number, string>> = {
  1: 'Ethereum',
  10: 'Optimism',
  56: 'BNB Chain',
  137: 'Polygon',
  8453: 'Base',
  42161: 'Arbitrum'
}

function fmtUsd(value: number): string {
  if (!Number.isFinite(value)) return '$0.00'
  const sign = value < 0 ? '-' : ''
  const absolute = Math.abs(value)
  if (absolute >= 1_000_000) return `${sign}$${(absolute / 1_000_000).toFixed(2)}m`
  if (absolute >= 1_000) return `${sign}$${(absolute / 1_000).toFixed(2)}k`
  if (absolute >= 1) return `${sign}$${absolute.toFixed(2)}`
  if (absolute === 0) return '$0.00'
  return `${sign}$${absolute.toPrecision(3)}`
}

function fmtTokenAmount(value: number): string {
  const absolute = Math.abs(value)
  if (!Number.isFinite(value)) return '—'
  if (absolute >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}m`
  if (absolute >= 1_000) return `${(value / 1_000).toFixed(2)}k`
  if (absolute >= 100) return value.toFixed(1)
  if (absolute >= 1) return value.toFixed(3)
  if (absolute === 0) return '0'
  return value.toPrecision(4)
}

function formatTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'unknown'
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function networkLabel(asset: WalletAsset): string {
  return asset.chainId === 'solana'
    ? 'Solana'
    : (CHAIN_LABELS[asset.chainId] ?? `Chain ${asset.chainId}`)
}

function shortWallet(value: string | null): string {
  if (value === null) return '—'
  return value.length > 11 ? `${value.slice(0, 5)}…${value.slice(-4)}` : value
}

function tokenUrl(asset: WalletAsset): string | null {
  if (asset.chainId === 'solana') {
    return `https://tribes.xyz/solana/token/${encodeURIComponent(asset.address)}`
  }
  if (asset.address === 'network') return null
  return `https://tribes.xyz/${asset.chainId}/token/${encodeURIComponent(asset.address)}`
}

function assetLabel(asset: WalletAsset, width: number): string {
  const label = truncateToWidth(asset.symbol, width, '…')
  const url = tokenUrl(asset)
  return url === null ? label : hyperlink(label, url)
}

function changeLabel(asset: WalletAsset, theme: Theme): string {
  const change = asset.usdPrice24hrPercentChange
  if (change === null) return theme.fg('dim', '—')
  const label = `${change >= 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(1)}%`
  return change >= 0 ? theme.fg('success', label) : theme.fg('error', label)
}

function cell(value: string, width: number, align: 'left' | 'right'): string {
  const clipped = truncateToWidth(value, width, '…')
  const padding = Math.max(0, width - visibleWidth(clipped))
  return align === 'right' ? ' '.repeat(padding) + clipped : clipped + ' '.repeat(padding)
}

function columnsForWidth(contentWidth: number): readonly Column[] {
  let definitions: readonly ColumnDefinition[]
  if (contentWidth >= 112) {
    definitions = [
      { key: 'asset', label: 'Asset', align: 'left' },
      { key: 'network', label: 'Network', align: 'left' },
      { key: 'balance', label: 'Balance', align: 'right' },
      { key: 'price', label: 'Price', align: 'right' },
      { key: 'change', label: '24h', align: 'right' },
      { key: 'value', label: 'Value', align: 'right' },
      { key: 'wallet', label: 'Wallet', align: 'left' }
    ]
  } else if (contentWidth >= 82) {
    definitions = [
      { key: 'asset', label: 'Asset', align: 'left' },
      { key: 'network', label: 'Network', align: 'left' },
      { key: 'balance', label: 'Balance', align: 'right' },
      { key: 'change', label: '24h', align: 'right' },
      { key: 'value', label: 'Value', align: 'right' }
    ]
  } else if (contentWidth >= 54) {
    definitions = [
      { key: 'asset', label: 'Asset', align: 'left' },
      { key: 'balance', label: 'Balance', align: 'right' },
      { key: 'value', label: 'Value', align: 'right' }
    ]
  } else {
    definitions = [
      { key: 'asset', label: 'Asset', align: 'left' },
      { key: 'value', label: 'Value', align: 'right' }
    ]
  }
  const gapsWidth = COLUMN_GAP.length * (definitions.length - 1)
  const columnWidth = Math.max(1, Math.floor((contentWidth - gapsWidth) / definitions.length))
  return definitions.map((definition) => ({ ...definition, width: columnWidth }))
}

function valueForColumn(asset: WalletAsset, column: Column, theme: Theme): string {
  switch (column.key) {
    case 'asset':
      return assetLabel(asset, column.width)
    case 'network':
      return networkLabel(asset)
    case 'balance':
      return `${fmtTokenAmount(asset.balance)} ${asset.symbol}`
    case 'price':
      return fmtUsd(asset.usdPrice)
    case 'change':
      return changeLabel(asset, theme)
    case 'value':
      return fmtUsd(asset.balanceUsd)
    case 'wallet':
      return shortWallet(asset.wallet)
  }
}

function renderBalances(
  status: WalletStatus,
  contentWidth: number,
  theme: Theme,
  scrollOffset: number
): string {
  if (status.assets.length === 0) return theme.fg('muted', 'No wallet balances found')
  const assets = [...status.assets].sort((left, right) => right.balanceUsd - left.balanceUsd)
  const maxStart = Math.max(0, Math.floor((assets.length - 1) / MAX_WALLET_ROWS) * MAX_WALLET_ROWS)
  const start = Math.min(maxStart, Math.max(0, scrollOffset))
  const page = assets.slice(start, start + MAX_WALLET_ROWS)
  const columns = columnsForWidth(contentWidth)
  const lines = [
    theme.fg(
      'dim',
      columns.map((column) => cell(column.label, column.width, column.align)).join(COLUMN_GAP)
    )
  ]
  for (const asset of page) {
    lines.push(
      columns
        .map((column) => cell(valueForColumn(asset, column, theme), column.width, column.align))
        .join(COLUMN_GAP)
    )
  }
  if (assets.length > MAX_WALLET_ROWS) {
    lines.push(
      theme.fg(
        'dim',
        `↕ ${start + 1}–${start + page.length} of ${assets.length}  ·  ctrl+shift+↑/↓`
      )
    )
  }
  return lines.join('\n')
}

export function renderWalletStatusWidget(
  status: WalletStatus,
  theme: Theme,
  width: number,
  refreshing = false,
  scrollOffset = 0,
  activePanel: StatusPanel = 'wallet'
): string[] {
  const borderTone = status.ok
    ? status.stale
      ? 'warning'
      : 'accent'
    : status.initializing
      ? 'dim'
      : 'warning'
  const borderColor = (value: string): string => theme.fg(borderTone, value)
  const container = new Container()
  const contentWidth = Math.max(20, width - 2)
  container.addChild(new DynamicBorder(borderColor))
  container.addChild(new Text(renderStatusViewRail(activePanel, theme, contentWidth), 1, 0))

  if (!status.ok) {
    const state = status.initializing
      ? 'loading…'
      : status.unauthenticated
        ? 'login'
        : 'unavailable'
    container.addChild(
      new Text(theme.fg('accent', theme.bold('Wallet')) + theme.fg('dim', `  ${state}`), 1, 0)
    )
    const notice = status.initializing
      ? theme.fg('dim', 'Loading wallet accounts…')
      : status.unauthenticated
        ? theme.fg('accent', 'Log in with  ' + theme.bold('/tribes:login') + '  to load balances')
        : theme.fg('warning', status.error ?? 'Unable to load wallet balances')
    container.addChild(new Text(notice, 1, 0))
    container.addChild(new DynamicBorder(borderColor))
    return container.render(width)
  }

  const hero =
    theme.fg('accent', '● Wallet') +
    '   ' +
    theme.bold(theme.fg('text', `total ${fmtUsd(status.totalUsd)}`)) +
    '   ' +
    theme.fg('dim', `${status.assets.length} asset${status.assets.length === 1 ? '' : 's'}`) +
    (refreshing ? '   ' + theme.fg('dim', 'syncing…') : '') +
    (status.stale ? '   ' + theme.fg('warning', 'cached') : '')
  container.addChild(new Text(hero, 1, 0))

  const networks = new Set(status.assets.map((asset) => networkLabel(asset))).size
  const context = [
    `updated ${formatTimestamp(status.updatedAt)}`,
    `${status.wallets.length} account${status.wallets.length === 1 ? '' : 's'}`,
    `${networks} network${networks === 1 ? '' : 's'}`
  ].join('  ·  ')
  container.addChild(new Text(theme.fg('dim', context), 1, 0))
  if (status.error !== null) {
    container.addChild(new Text(theme.fg('warning', status.error), 1, 0))
  }
  container.addChild(new Text(theme.fg('dim', '┈'.repeat(contentWidth)), 1, 0))
  container.addChild(new Text(renderBalances(status, contentWidth, theme, scrollOffset), 1, 0))
  container.addChild(new DynamicBorder(borderColor))
  return container.render(width)
}
