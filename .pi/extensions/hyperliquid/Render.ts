/**
 * Rendering helpers for the hyperliquid-status widget.
 *
 * Extracted from `index.ts` so the entry point stays focused on data
 * fetching + state management. Every export is pure: takes a status snapshot
 * (or piece of one) and returns formatted strings / TUI components.
 */

import type { Theme } from '@earendil-works/pi-coding-agent'
import { DynamicBorder } from '@earendil-works/pi-coding-agent'
import { Container, hyperlink, Text, truncateToWidth, visibleWidth } from '@earendil-works/pi-tui'

import type { StatusPanel } from '../tribes/wallet/PanelState.ts'
import { renderStatusViewRail } from '../tribes/wallet/ViewRail.ts'
import type {
  AccountSummary,
  HlTab,
  HyperliquidStatus,
  LedgerUpdate,
  OpenOrder,
  RecentTrade,
  SpotHolding,
  StatusPosition
} from './StatusTypes.ts'

// Bottom-section tabs, ordered to put account balances beside open positions.
const TAB_SEQUENCE: readonly HlTab[] = [
  'positions',
  'balances',
  'transactions',
  'orders',
  'deposits',
  'spot'
]
const TAB_LABELS: Readonly<Record<HlTab, string>> = {
  positions: 'Positions',
  balances: 'Balances',
  transactions: 'Transactions',
  orders: 'Open Orders',
  deposits: 'Deposits',
  spot: 'Spot'
}
// Rows shown per page so the below-editor widget never grows unbounded; extra
// items are reachable by paging (ctrl+shift+↑/↓).
export const MAX_TAB_ROWS = 12
const TRIBES_PERP_URL = 'https://tribes.xyz/perps'

/** Wrap a perp symbol in an OSC 8 hyperlink to its tribes.xyz page (clickable in supporting terminals). */
function perpLink(symbol: string, text: string): string {
  const bare = symbol.includes(':') ? symbol.slice(symbol.indexOf(':') + 1) : symbol
  return hyperlink(text, `${TRIBES_PERP_URL}/${encodeURIComponent(bare)}`)
}

export function fmtUsd(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '$0'
  const sign = n < 0 ? '-' : ''
  const v = Math.abs(n)
  if (v >= 1000) return `${sign}$${(v / 1000).toFixed(2)}k`
  return `${sign}$${v.toFixed(2)}`
}

export function coerceNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

export function fmtSize(value: unknown): string {
  const n = coerceNumber(value)
  if (n === null) return typeof value === 'string' && value.trim().length > 0 ? value.trim() : '-'
  const abs = Math.abs(n)
  if (abs >= 100) return n.toFixed(1)
  if (abs >= 1) return n.toFixed(3)
  if (abs >= 0.01) return n.toFixed(4)
  return n.toPrecision(3)
}

export function fmtPrice(value: unknown): string {
  const n = coerceNumber(value)
  if (n === null) return typeof value === 'string' && value.trim().length > 0 ? value.trim() : '—'
  const abs = Math.abs(n)
  if (abs === 0) return '0'
  if (abs >= 1000) return n.toFixed(1)
  if (abs >= 100) return n.toFixed(2)
  if (abs >= 1) return n.toFixed(3)
  if (abs >= 0.01) return n.toFixed(4)
  return n.toExponential(2)
}

export function fmtLeverage(value: unknown): string {
  const n = coerceNumber(value)
  if (n === null) return '-'
  const abs = Math.abs(n)
  if (abs >= 10) return `${n.toFixed(1)}x`
  if (abs >= 1) return `${n.toFixed(2)}x`
  return `${n.toPrecision(2)}x`
}

export function fmtSignedUsd(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '$0.00'
  if (Math.abs(n) < 0.005) return '$0.00'
  return n > 0 ? `+${fmtUsd(n)}` : fmtUsd(n)
}

export function fmtCostUsd(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '-'
  if (Math.abs(n) < 0.005) return '$0.00'
  return n > 0 ? `-${fmtUsd(n)}` : `+${fmtUsd(Math.abs(n))}`
}

export function fmtBps(value: unknown): string {
  const n = coerceNumber(value)
  if (n === null) return '-'
  return `${n.toFixed(2)}bps`
}

const LIGHT_GREEN = '\x1b[38;2;144;238;144m' // #90ee90
const ANSI_RESET = '\x1b[39m'

export function fgPositive(text: string): string {
  return `${LIGHT_GREEN}${text}${ANSI_RESET}`
}

function padRight(text: string, width: number): string {
  const currentWidth = visibleWidth(text)
  return currentWidth >= width ? text : text + ' '.repeat(width - currentWidth)
}

function padLeft(text: string, width: number): string {
  const currentWidth = visibleWidth(text)
  return currentWidth >= width ? text : ' '.repeat(width - currentWidth) + text
}

type CellAlign = 'left' | 'right'

// Numeric columns read as columns of magnitudes only when their decimals line
// up, so every quantitative field is right-aligned; labels/identifiers stay left.
const RIGHT_ALIGNED_KEYS = new Set<string>([
  'size',
  'notional',
  'lev',
  'entry',
  'mark',
  'liq',
  'upnl',
  'fundingDay',
  'cost7d',
  'margin',
  'equity',
  'gross',
  'value',
  'exit',
  'pnl',
  'hold',
  'price',
  'trigger',
  'amount',
  'total',
  'available'
])

function alignFor(key: string): CellAlign {
  return RIGHT_ALIGNED_KEYS.has(key) ? 'right' : 'left'
}

function cell(
  text: unknown,
  width: number,
  style?: (value: string) => string,
  align: CellAlign = 'left'
): string {
  const raw = text === null || text === undefined ? '-' : String(text)
  const clipped = truncateToWidth(raw, width, '…')
  const padded = align === 'right' ? padLeft(clipped, width) : padRight(clipped, width)
  return style ? style(padded) : padded
}

/** Header row: label per column, aligned to match the data beneath it. */
function headerRow(
  columns: readonly { readonly key: string; readonly label: string; readonly width: number }[],
  theme: Theme
): string {
  return theme.fg(
    'dim',
    columns.map((col) => cell(col.label, col.width, undefined, alignFor(col.key))).join(' ')
  )
}

function formatLocalTimestamp(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) return 'unknown'
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return value
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }).format(new Date(parsed))
}

function formatTradeTimestamp(isoString: string): string {
  const parsed = Date.parse(isoString)
  if (!Number.isFinite(parsed)) return isoString
  const d = new Date(parsed)
  const now = new Date()
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (isToday) {
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(d)
  }
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(d)
}

function renderPositionsTable(
  positions: readonly StatusPosition[],
  contentWidth: number,
  theme: Theme
): string {
  if (positions.length === 0) return theme.fg('muted', 'No open positions')

  const baseColumns = [
    { key: 'symbol', label: 'Symbol', width: 8 },
    { key: 'side', label: 'Side', width: 5 },
    { key: 'size', label: 'Size', width: 8 },
    { key: 'margin', label: 'Margin', width: 9 },
    { key: 'notional', label: 'Notional', width: 9 },
    { key: 'lev', label: 'Lev', width: 5 },
    { key: 'entry', label: 'Entry', width: 8 },
    { key: 'mark', label: 'Mark', width: 8 },
    { key: 'liq', label: 'Liq', width: 8 },
    { key: 'upnl', label: 'uPnL', width: 9 },
    { key: 'fundingDay', label: 'Fund/day', width: 9 },
    { key: 'cost7d', label: 'Cost7d', width: 8 }
  ]

  let columns = [...baseColumns]
  const totalWidth = (cols: typeof columns): number =>
    cols.reduce((sum, col) => sum + col.width, 0) + Math.max(0, cols.length - 1)

  while (columns.length > 5 && totalWidth(columns) > contentWidth) {
    columns = columns.slice(0, -1)
  }

  const lines = [headerRow(columns, theme)]

  for (const position of positions) {
    const pnl = coerceNumber(position.unrealizedPnlUsd)
    const side = position.side.toUpperCase()
    const marginUsd = coerceNumber(position.marginUsedUsd)
    const leverageLabel =
      position.leverageType === 'cross' ? ' C' : position.leverageType === 'isolated' ? ' I' : ''
    const margin = marginUsd !== null ? `${fmtUsd(marginUsd)}${leverageLabel}` : '—'

    // Liq display contract:
    //   - HL returned a value  →  the actual liquidation price (matches what
    //     hyperliquid.xyz and the position detail table show).
    //   - HL returned null but we synthesized a cross-margin estimate
    //     →  the estimated price, prefixed with `~` so the operator sees it's
    //     an estimate.
    //   - HL returned null AND no estimate was possible (cross position so
    //     well-collateralized HL declines to compute one) → `safe` (dim).
    //   - Truly missing data (no mark, no estimate, isolated and HL null)
    //     →  `—` (dim) like before.
    const liqRaw = coerceNumber(position.liquidationPrice)
    const liqEstimate = coerceNumber(position.estimatedLiquidationPrice)
    const renderLiq = (px: number, isEstimate: boolean): string => {
      const tag = isEstimate ? '~' : ''
      return `${tag}${fmtPrice(px)}`
    }
    const liqDisplay =
      liqRaw !== null
        ? renderLiq(liqRaw, false)
        : liqEstimate !== null
          ? renderLiq(liqEstimate, true)
          : position.leverageType === 'cross'
            ? 'safe'
            : '—'

    const values: Record<string, string> = {
      symbol: position.symbol,
      side,
      size: fmtSize(position.size),
      notional: fmtUsd(coerceNumber(position.notionalUsd)),
      lev: fmtLeverage(position.leverage),
      entry: fmtPrice(position.entryPrice),
      mark: fmtPrice(position.markPrice),
      upnl: fmtSignedUsd(pnl),
      fundingDay: fmtCostUsd(coerceNumber(position.fundingCostUsdPerDay)),
      cost7d: fmtCostUsd(coerceNumber(position.recentCostUsd)),
      liq: liqDisplay,
      margin
    }

    lines.push(
      columns
        .map((col) => {
          const align = alignFor(col.key)
          if (col.key === 'symbol') {
            return cell(
              values[col.key],
              col.width,
              (value) => perpLink(position.symbol, value),
              align
            )
          }
          if (col.key === 'side') {
            return cell(
              values[col.key],
              col.width,
              (value) => theme.fg(side === 'SHORT' ? 'error' : 'success', value),
              align
            )
          }
          if (col.key === 'upnl') {
            return cell(
              values[col.key],
              col.width,
              (value) => (pnl !== null && pnl < 0 ? theme.fg('error', value) : fgPositive(value)),
              align
            )
          }
          if (col.key === 'fundingDay') {
            const cost = coerceNumber(position.fundingCostUsdPerDay)
            return cell(
              values[col.key],
              col.width,
              (value) => (cost !== null && cost > 0 ? theme.fg('error', value) : fgPositive(value)),
              align
            )
          }
          if (col.key === 'cost7d') {
            const cost = coerceNumber(position.recentCostUsd)
            return cell(
              values[col.key],
              col.width,
              (value) => (cost !== null && cost > 0 ? theme.fg('error', value) : fgPositive(value)),
              align
            )
          }
          if (col.key === 'liq') {
            // Soft styling for synthetic/estimated/safe states so the
            // operator can tell them apart at a glance from HL-authoritative
            // numbers (which use the default cell color).
            const raw = values[col.key] ?? ''
            if (raw === 'safe') {
              return cell(raw, col.width, (v) => theme.fg('success', v), align)
            }
            if (raw === '—') {
              return cell(raw, col.width, (v) => theme.fg('muted', v), align)
            }
            if (raw.startsWith('~')) {
              return cell(raw, col.width, (v) => theme.fg('dim', v), align)
            }
            return cell(raw, col.width, undefined, align)
          }
          return cell(values[col.key], col.width, undefined, align)
        })
        .join(' ')
    )
  }

  return lines.join('\n')
}

function fmtDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return '—'
  const totalSeconds = Math.floor(ms / 1000)
  if (totalSeconds < 60) return `${totalSeconds}s`
  const totalMinutes = Math.floor(totalSeconds / 60)
  if (totalMinutes < 60) return `${totalMinutes}m`
  const totalHours = Math.floor(totalMinutes / 60)
  if (totalHours < 24) return `${totalHours}h ${totalMinutes % 60}m`
  const days = Math.floor(totalHours / 24)
  return `${days}d ${totalHours % 24}h`
}

function renderRecentTrades(trades: readonly RecentTrade[], theme: Theme): string {
  const columns = [
    { key: 'time', label: 'Time', width: 13 },
    { key: 'dir', label: 'Dir', width: 12 },
    { key: 'symbol', label: 'Symbol', width: 10 },
    { key: 'size', label: 'Size', width: 10 },
    { key: 'value', label: 'Value', width: 10 },
    { key: 'entry', label: 'Entry', width: 10 },
    { key: 'exit', label: 'Exit', width: 10 },
    { key: 'pnl', label: 'PnL', width: 10 },
    { key: 'hold', label: 'Hold', width: 8 }
  ]

  const lines = [headerRow(columns, theme)]

  for (const trade of trades) {
    const isClose = /close/iu.test(trade.dir)
    const isShort = /short/iu.test(trade.dir)
    const pnl = trade.closedPnlUsd
    const values: Record<string, string> = {
      time: formatTradeTimestamp(new Date(trade.time).toISOString()),
      dir: trade.dir,
      symbol: trade.coin,
      size: fmtSize(trade.size),
      value: fmtUsd(trade.price * trade.size),
      entry: trade.avgEntryPrice !== null ? fmtPrice(trade.avgEntryPrice) : '—',
      exit: trade.avgExitPrice !== null ? fmtPrice(trade.avgExitPrice) : '—',
      hold: fmtDuration(trade.holdMs),
      pnl: Math.abs(pnl) < 0.005 ? '—' : fmtSignedUsd(pnl)
    }

    lines.push(
      columns
        .map((col) => {
          const align = alignFor(col.key)
          if (col.key === 'dir') {
            // Close trades: color by P&L outcome (did the trade make money?).
            // Open trades: color by side (short=red, long=green) to match the positions table.
            let dirTone: 'error' | 'success' | 'dim'
            if (isClose) {
              dirTone = Math.abs(pnl) < 0.005 ? 'dim' : pnl > 0 ? 'success' : 'error'
            } else {
              dirTone = isShort ? 'error' : 'success'
            }
            return cell(values[col.key], col.width, (value) => theme.fg(dirTone, value), align)
          }
          if (col.key === 'pnl') {
            if (Math.abs(pnl) < 0.005) {
              return cell(values[col.key], col.width, (value) => theme.fg('muted', value), align)
            }
            return cell(
              values[col.key],
              col.width,
              (value) => (pnl < 0 ? theme.fg('error', value) : fgPositive(value)),
              align
            )
          }
          if (col.key === 'time') {
            return cell(values[col.key], col.width, (value) => theme.fg('dim', value), align)
          }
          return cell(values[col.key], col.width, undefined, align)
        })
        .join(' ')
    )
  }

  return lines.join('\n')
}

function truncateHash(hash: string | null): string {
  if (hash === null || hash.length === 0) return '—'
  return hash.length <= 12 ? hash : `${hash.slice(0, 6)}…${hash.slice(-4)}`
}

/** Open-orders table uses right-aligned trigger cells, so add extra gap before Flags. */
function joinOpenOrderColumns(
  columns: readonly { readonly key: string }[],
  cells: readonly string[]
): string {
  let row = cells[0] ?? ''
  for (let index = 1; index < cells.length; index++) {
    const gap = columns[index - 1]?.key === 'trigger' ? '   ' : ' '
    row += gap + (cells[index] ?? '')
  }
  return row
}

function renderOpenOrders(orders: readonly OpenOrder[], theme: Theme): string {
  if (orders.length === 0) return theme.fg('muted', 'No open orders')
  // Column set + ordering mirror the leo/open-orders branch:
  // Time · Side · Symbol · Size · Price · Trigger · Flags · Type.
  const columns = [
    { key: 'time', label: 'Time', width: 13 },
    { key: 'side', label: 'Side', width: 12 },
    { key: 'symbol', label: 'Symbol', width: 10 },
    { key: 'size', label: 'Size', width: 10 },
    { key: 'price', label: 'Price', width: 10 },
    { key: 'trigger', label: 'Trigger', width: 10 },
    { key: 'flags', label: 'Flags', width: 8 },
    { key: 'type', label: 'Type', width: 12 }
  ]
  const lines = [
    theme.fg(
      'dim',
      joinOpenOrderColumns(
        columns,
        columns.map((col) => cell(col.label, col.width, undefined, alignFor(col.key)))
      )
    )
  ]
  for (const order of orders) {
    const flags = [
      order.reduceOnly ? 'RO' : null,
      order.tif && order.tif.length > 0 ? order.tif : null
    ]
      .filter((value): value is string => value !== null)
      .join(',')
    const values: Record<string, string> = {
      time: formatTradeTimestamp(new Date(order.timestamp).toISOString()),
      side: order.side.toUpperCase(),
      symbol: order.symbol,
      size: fmtSize(order.size),
      price: order.limitPrice !== null ? fmtPrice(order.limitPrice) : '—',
      trigger: order.isTrigger && order.triggerPrice !== null ? fmtPrice(order.triggerPrice) : '—',
      flags: flags.length > 0 ? flags : '—',
      type: order.orderType
    }
    const rowCells = columns.map((col) => {
      const align = alignFor(col.key)
      if (col.key === 'symbol') {
        return cell(values[col.key], col.width, (value) => perpLink(order.symbol, value), align)
      }
      if (col.key === 'side') {
        return cell(
          values[col.key],
          col.width,
          (value) => theme.fg(order.side === 'sell' ? 'error' : 'success', value),
          align
        )
      }
      if (col.key === 'time') {
        return cell(values[col.key], col.width, (value) => theme.fg('dim', value), align)
      }
      if (col.key === 'trigger' && !order.isTrigger) {
        return cell(values[col.key], col.width, (value) => theme.fg('muted', value), align)
      }
      return cell(values[col.key], col.width, undefined, align)
    })
    lines.push(joinOpenOrderColumns(columns, rowCells))
  }
  return lines.join('\n')
}

function renderLedgerUpdates(updates: readonly LedgerUpdate[], theme: Theme): string {
  if (updates.length === 0) return theme.fg('muted', 'No deposits or withdrawals')
  const columns = [
    { key: 'time', label: 'Time', width: 13 },
    { key: 'type', label: 'Type', width: 10 },
    { key: 'amount', label: 'Amount', width: 12 },
    { key: 'hash', label: 'Tx', width: 14 }
  ]
  const lines = [headerRow(columns, theme)]
  for (const update of updates) {
    const values: Record<string, string> = {
      time: formatTradeTimestamp(new Date(update.time).toISOString()),
      type: update.type === 'deposit' ? 'Deposit' : 'Withdraw',
      amount: fmtUsd(update.amountUsd),
      hash: truncateHash(update.hash)
    }
    lines.push(
      columns
        .map((col) => {
          const align = alignFor(col.key)
          if (col.key === 'type') {
            return cell(
              values[col.key],
              col.width,
              (value) => theme.fg(update.type === 'deposit' ? 'success' : 'error', value),
              align
            )
          }
          if (col.key === 'time' || col.key === 'hash') {
            return cell(values[col.key], col.width, (value) => theme.fg('dim', value), align)
          }
          return cell(values[col.key], col.width, undefined, align)
        })
        .join(' ')
    )
  }
  return lines.join('\n')
}

function renderSpotHoldings(holdings: readonly SpotHolding[], theme: Theme): string {
  if (holdings.length === 0) return theme.fg('muted', 'No spot holdings')
  const columns = [
    { key: 'coin', label: 'Coin', width: 14 },
    { key: 'total', label: 'Total', width: 16 },
    { key: 'available', label: 'Available', width: 16 },
    { key: 'entry', label: 'Entry Value', width: 12 }
  ]
  const lines = [headerRow(columns, theme)]
  for (const holding of holdings) {
    const values: Record<string, string> = {
      coin: holding.coin,
      total: fmtSize(holding.total),
      available: fmtSize(holding.available),
      entry: holding.entryNotionalUsd !== null ? fmtUsd(holding.entryNotionalUsd) : '—'
    }
    lines.push(
      columns.map((col) => cell(values[col.key], col.width, undefined, alignFor(col.key))).join(' ')
    )
  }
  return lines.join('\n')
}

function renderBalances(accounts: readonly AccountSummary[], theme: Theme): string {
  if (accounts.length === 0) return theme.fg('muted', 'No perp balances')
  const columns = [
    { key: 'account', label: 'Account', width: 14 },
    { key: 'equity', label: 'Equity', width: 12 },
    { key: 'available', label: 'Available', width: 12 },
    { key: 'margin', label: 'Margin', width: 12 },
    { key: 'gross', label: 'Gross', width: 12 }
  ]
  const lines = [headerRow(columns, theme)]
  for (const account of accounts) {
    const values: Record<string, string> = {
      account: account.dex || 'main',
      equity: fmtUsd(account.equityUsd),
      available: fmtUsd(account.withdrawableUsd),
      margin: fmtUsd(account.marginUsedUsd),
      gross: fmtUsd(account.grossExposureUsd)
    }
    lines.push(
      columns.map((col) => cell(values[col.key], col.width, undefined, alignFor(col.key))).join(' ')
    )
  }
  return lines.join('\n')
}

function tabCount(status: HyperliquidStatus, tab: HlTab): number {
  // Coalesce every field: a snapshot cached by an older extension build (loaded
  // from disk on startup, rendered before the first refresh) can lack the newer
  // tab arrays, so reading `.length` directly would throw.
  switch (tab) {
    case 'positions':
      return (status.positions ?? []).length
    case 'balances':
      return (status.hyperliquidAccounts ?? []).length
    case 'transactions':
      return (status.recentTrades ?? []).length
    case 'orders':
      return (status.openOrders ?? []).length
    case 'deposits':
      return (status.ledgerUpdates ?? []).length
    case 'spot':
      return (status.spotHoldings ?? []).length
  }
}

function renderTabBar(status: HyperliquidStatus, activeTab: HlTab, theme: Theme): string {
  // A leading ▎ marker (not just bold+color) gives the active tab an
  // unmistakable "selected" cue that survives low-contrast terminals.
  return TAB_SEQUENCE.map((tab) => {
    const label = `${TAB_LABELS[tab]}(${tabCount(status, tab)})`
    return tab === activeTab ? theme.fg('accent', theme.bold(`▎${label}`)) : theme.fg('dim', label)
  }).join(theme.fg('dim', '  ·  '))
}

/** Clamp a scroll offset to a valid page start for `total` rows. */
export function clampScrollStart(offset: number, total: number): number {
  if (total <= MAX_TAB_ROWS) return 0
  const maxStart = Math.floor((total - 1) / MAX_TAB_ROWS) * MAX_TAB_ROWS
  return Math.min(Math.max(0, offset), maxStart)
}

// Footer shown only when a tab has more than one page, so the operator knows
// where they are in the list and that ctrl+shift+↑/↓ pages through it.
function scrollFooter(total: number, start: number, shown: number, theme: Theme): string | null {
  if (total <= MAX_TAB_ROWS) return null
  return theme.fg('dim', `↕ ${start + 1}–${start + shown} of ${total}  ·  ctrl+shift+↑/↓`)
}

function withFooter(body: string, footer: string | null): string {
  return footer === null ? body : `${body}\n${footer}`
}

// Slice one page out of a tab's list and render it with a paging footer. Passing
// the renderer keeps each table responsible only for the rows it's handed.
function renderPage<T>(
  items: readonly T[],
  scrollOffset: number,
  theme: Theme,
  renderRows: (page: readonly T[]) => string
): string {
  const start = clampScrollStart(scrollOffset, items.length)
  const page = items.slice(start, start + MAX_TAB_ROWS)
  return withFooter(renderRows(page), scrollFooter(items.length, start, page.length, theme))
}

function renderTabBody(
  status: HyperliquidStatus,
  activeTab: HlTab,
  contentWidth: number,
  theme: Theme,
  scrollOffset: number
): string {
  // `?? []` guards against a stale cached snapshot missing the newer arrays.
  switch (activeTab) {
    case 'positions':
      return renderPage(status.positions ?? [], scrollOffset, theme, (page) =>
        renderPositionsTable(page, contentWidth, theme)
      )
    case 'balances':
      return renderPage(status.hyperliquidAccounts ?? [], scrollOffset, theme, (page) =>
        renderBalances(page, theme)
      )
    case 'transactions':
      return (status.recentTrades ?? []).length > 0
        ? renderPage(status.recentTrades ?? [], scrollOffset, theme, (page) =>
            renderRecentTrades(page, theme)
          )
        : theme.fg('muted', 'No transactions')
    case 'orders':
      return renderPage(status.openOrders ?? [], scrollOffset, theme, (page) =>
        renderOpenOrders(page, theme)
      )
    case 'deposits':
      return renderPage(status.ledgerUpdates ?? [], scrollOffset, theme, (page) =>
        renderLedgerUpdates(page, theme)
      )
    case 'spot':
      return renderPage(status.spotHoldings ?? [], scrollOffset, theme, (page) =>
        renderSpotHoldings(page, theme)
      )
  }
}

export function renderHyperliquidPositionsWidget(
  status: HyperliquidStatus,
  theme: Theme,
  width: number,
  refreshing = false,
  activeTab: HlTab = 'positions',
  scrollOffset = 0,
  activePanel: StatusPanel = 'hyperliquid'
): string[] {
  // Loading uses a calm dim border; a real failure (missing account / error) is
  // a warning; a healthy account is the accent.
  // Unauthenticated (not logged in) shows a muted accent to draw attention
  // without alarming.
  const borderTone = status.ok
    ? 'accent'
    : status.initializing
      ? 'dim'
      : status.unauthenticated
        ? 'accent'
        : 'warning'
  const borderColor = (value: string): string => theme.fg(borderTone, value)
  const container = new Container()
  const contentWidth = Math.max(20, width - 2)

  container.addChild(new DynamicBorder(borderColor))
  container.addChild(new Text(renderStatusViewRail(activePanel, theme, contentWidth), 1, 0))

  if (!status.ok) {
    const brandState = status.initializing
      ? 'loading…'
      : status.unauthenticated
        ? 'login'
        : 'unavailable'
    container.addChild(
      new Text(
        theme.fg('accent', theme.bold('Hyperliquid')) + theme.fg('dim', `  ${brandState}`),
        1,
        0
      )
    )
    const notice = status.initializing
      ? theme.fg('dim', 'Loading account…')
      : status.unauthenticated
        ? theme.fg(
            'accent',
            'Log in with  ' + theme.bold('/tribes:login') + '  to enable Hyperliquid trading'
          )
        : theme.fg(
            'warning',
            status.accountError ?? status.error ?? 'Unable to load Hyperliquid status'
          )
    container.addChild(new Text(notice, 1, 0))
    container.addChild(new DynamicBorder(borderColor))
    return container.render(width)
  }

  // Hero line: equity is the anchor number, today's P&L the movement beside it —
  // a trader's account tape. Direction is carried by a ▲/▼ glyph, not color alone.
  const dayUp = status.dailyPnlUsd >= 0
  const dayText = `${dayUp ? '▲' : '▼'} ${fmtUsd(Math.abs(status.dailyPnlUsd))}  ${dayUp ? '+' : '-'}${Math.abs(status.dailyPnlPct).toFixed(1)}% today`
  const dayDisplay = dayUp ? fgPositive(dayText) : theme.fg('error', dayText)
  const hero =
    theme.fg('accent', '● Hyperliquid') +
    '   ' +
    theme.bold(theme.fg('text', `total ${fmtUsd(status.equityUsd)}`)) +
    '   ' +
    dayDisplay +
    (refreshing ? '   ' + theme.fg('dim', 'syncing…') : '')
  container.addChild(new Text(hero, 1, 0))

  // Context line (all secondary account state, dim): all-time P&L, funding/fee
  // cost, and gross/net exposure — present but visually subordinate to the hero.
  const inferredDeposit = (status.equityUsd ?? 0) - status.allTimePnlUsd
  const allTimeReturnPct = inferredDeposit > 0 ? (status.allTimePnlUsd / inferredDeposit) * 100 : 0
  const allTimeUp = status.allTimePnlUsd >= 0
  const allTime = allTimeUp
    ? fgPositive(`all-time +${fmtUsd(status.allTimePnlUsd)} (+${allTimeReturnPct.toFixed(1)}%)`)
    : theme.fg(
        'error',
        `all-time ${fmtUsd(status.allTimePnlUsd)} (${allTimeReturnPct.toFixed(1)}%)`
      )
  const costSummary = status.costSummary
  const cost = costSummary
    ? theme.fg(
        costSummary.netCostUsd > 0 ? 'error' : 'success',
        `cost${costSummary.lookbackDays}d ${fmtCostUsd(costSummary.netCostUsd)}`
      )
    : theme.fg('dim', 'cost —')
  const context = theme.fg(
    'dim',
    [
      `updated ${formatLocalTimestamp(status.updatedAt)}`,
      allTime,
      cost,
      `gross ${fmtUsd(status.grossExposureUsd)}`,
      `net ${fmtUsd(status.netExposureUsd)}`
    ].join('  ·  ')
  )
  container.addChild(new Text(context, 1, 0))

  // Bottom section: tab bar (with the nav hint tucked right when it fits) + table.
  const tabs = renderTabBar(status, activeTab, theme)
  const hint = theme.fg('dim', 'ctrl+shift+←/→ · /hyperliquid:tab')
  const tabsWidth = visibleWidth(tabs)
  const hintWidth = visibleWidth(hint)
  const tabLine =
    tabsWidth + hintWidth + 2 <= contentWidth
      ? tabs + ' '.repeat(contentWidth - tabsWidth - hintWidth) + hint
      : truncateToWidth(tabs, contentWidth, '…')
  container.addChild(new Text(tabLine, 1, 0))
  container.addChild(new Text(theme.fg('dim', '┈'.repeat(contentWidth)), 1, 0))
  container.addChild(
    new Text(renderTabBody(status, activeTab, contentWidth, theme, scrollOffset), 1, 0)
  )
  container.addChild(new DynamicBorder(borderColor))

  return container.render(width)
}
