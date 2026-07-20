import { DynamicBorder, type Theme } from '@earendil-works/pi-coding-agent'
import { Container, hyperlink, Text, truncateToWidth, visibleWidth } from '@earendil-works/pi-tui'

import type { StatusPanel } from './PanelState.ts'
import type { WalletAsset, WalletStatus } from './StatusTypes.ts'
import { renderStatusViewRail } from './ViewRail.ts'

export const MAX_WALLET_ROWS = 12

type ColumnKey = 'asset' | 'network' | 'balance' | 'price' | 'change' | 'value' | 'pnl' | 'wallet'

interface Column {
  readonly key: ColumnKey
  readonly label: string
  readonly width: number
  readonly align: 'left' | 'right'
}

const COLUMN_GAP = ' '

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

function pnlLabel(value: number | null, theme: Theme): string {
  if (value === null) return theme.fg('dim', '—')
  const isPositive = value >= 0
  const label = `${isPositive ? '▲' : '▼'} ${isPositive ? '+' : ''}${fmtUsd(value)}`
  return isPositive ? theme.fg('success', label) : theme.fg('error', label)
}

function cell(value: string, width: number, align: 'left' | 'right'): string {
  const clipped = truncateToWidth(value, width, '…')
  const padding = Math.max(0, width - visibleWidth(clipped))
  return align === 'right' ? ' '.repeat(padding) + clipped : clipped + ' '.repeat(padding)
}

function gapAfter(column: Column): string {
  return column.key === 'value' ? '   ' : COLUMN_GAP
}

function joinColumns(columns: readonly Column[], cells: readonly string[]): string {
  let row = cells[0] ?? ''
  for (let index = 1; index < cells.length; index++) {
    const previous = columns[index - 1]
    row += (previous ? gapAfter(previous) : COLUMN_GAP) + (cells[index] ?? '')
  }
  return row
}

function columnsForWidth(contentWidth: number): readonly Column[] {
  const baseColumns: readonly Column[] = [
    { key: 'asset', label: 'Asset', width: 10, align: 'left' },
    { key: 'network', label: 'Network', width: 8, align: 'left' },
    { key: 'pnl', label: 'PnL', width: 8, align: 'right' },
    { key: 'balance', label: 'Balance', width: 14, align: 'right' },
    { key: 'value', label: 'Value', width: 8, align: 'right' },
    { key: 'price', label: 'Price', width: 8, align: 'right' },
    { key: 'change', label: '24h', width: 8, align: 'right' },
    { key: 'wallet', label: 'Wallet', width: 10, align: 'left' }
  ]
  const totalWidth = (columns: readonly Column[]): number =>
    columns.reduce((sum, column) => sum + column.width, 0) +
    columns.slice(0, -1).reduce((sum, column) => sum + gapAfter(column).length, 0)
  const dropOrder: readonly ColumnKey[] = ['wallet', 'price', 'change', 'network']
  let columns = [...baseColumns]
  for (const key of dropOrder) {
    if (totalWidth(columns) <= contentWidth) break
    columns = columns.filter((column) => column.key !== key)
  }
  if (totalWidth(columns) <= contentWidth) return columns
  return [
    { key: 'asset', label: 'Asset', width: Math.max(8, contentWidth - 11), align: 'left' },
    { key: 'value', label: 'Value', width: 10, align: 'right' }
  ]
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
    case 'pnl':
      return pnlLabel(asset.pnl?.totalUsd ?? null, theme)
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
      joinColumns(
        columns,
        columns.map((column) => cell(column.label, column.width, column.align))
      )
    )
  ]
  for (const asset of page) {
    lines.push(
      joinColumns(
        columns,
        columns.map((column) =>
          cell(valueForColumn(asset, column, theme), column.width, column.align)
        )
      )
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
    (status.totalPnlUsd === null
      ? ''
      : theme.fg('dim', '   all-time ') + pnlLabel(status.totalPnlUsd, theme)) +
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
