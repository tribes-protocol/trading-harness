/**
 * Rendering helpers for the hyperliquid-status widget.
 *
 * Extracted from `index.ts` so the entry point stays focused on data
 * fetching + state management. Every export is pure: takes a status snapshot
 * (or piece of one) and returns formatted strings / TUI components.
 */

import type { Theme } from '@earendil-works/pi-coding-agent'
import { DynamicBorder } from '@earendil-works/pi-coding-agent'
import { Container, Text, truncateToWidth, visibleWidth } from '@earendil-works/pi-tui'

import type { HyperliquidStatus, RecentTrade, StatusOrder, StatusPosition } from './StatusTypes.ts'

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

function cell(text: unknown, width: number, style?: (value: string) => string): string {
  const raw = text === null || text === undefined ? '-' : String(text)
  const clipped = truncateToWidth(raw, width, '…')
  const padded = padRight(clipped, width)
  return style ? style(padded) : padded
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

function renderSectionHeader(title: string, suffix: string, theme: Theme): string {
  return theme.fg('accent', theme.bold(title)) + theme.fg('dim', suffix)
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
    { key: 'symbol', label: 'Symbol', width: 14 },
    { key: 'side', label: 'Side', width: 5 },
    { key: 'size', label: 'Size', width: 10 },
    { key: 'notional', label: 'Notional', width: 10 },
    { key: 'lev', label: 'Lev', width: 6 },
    { key: 'entry', label: 'Entry', width: 10 },
    { key: 'mark', label: 'Mark', width: 10 },
    { key: 'liq', label: 'Liq', width: 12 },
    { key: 'upnl', label: 'uPnL', width: 10 },
    { key: 'fundingDay', label: 'Fund/day', width: 10 },
    { key: 'cost7d', label: 'Cost7d', width: 9 }
  ]

  const minMarginWidth = 16
  let columns = [...baseColumns]
  const totalWidth = (cols: typeof columns, marginWidth: number): number =>
    cols.reduce((sum, col) => sum + col.width, 0) + marginWidth + cols.length

  while (columns.length > 5 && totalWidth(columns, minMarginWidth) > contentWidth) {
    columns = columns.slice(0, -1)
  }

  const usedWithoutMargin = columns.reduce((sum, col) => sum + col.width, 0) + columns.length
  const marginColWidth = Math.max(minMarginWidth, contentWidth - usedWithoutMargin)
  const finalColumns = [...columns, { key: 'margin', label: 'Margin', width: marginColWidth }]
  const lines = [theme.fg('dim', finalColumns.map((col) => cell(col.label, col.width)).join(' '))]

  for (const position of positions) {
    const pnl = coerceNumber(position.unrealizedPnlUsd)
    const side = position.side.toUpperCase()
    const marginUsd = coerceNumber(position.marginUsedUsd)
    const leverageLabel = position.leverageType ? ` (${position.leverageType})` : ''
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
      finalColumns
        .map((col) => {
          if (col.key === 'side') {
            return cell(values[col.key], col.width, (value) =>
              theme.fg(side === 'SHORT' ? 'error' : 'success', value)
            )
          }
          if (col.key === 'upnl') {
            return cell(values[col.key], col.width, (value) =>
              pnl !== null && pnl < 0 ? theme.fg('error', value) : fgPositive(value)
            )
          }
          if (col.key === 'fundingDay') {
            const cost = coerceNumber(position.fundingCostUsdPerDay)
            return cell(values[col.key], col.width, (value) =>
              cost !== null && cost > 0 ? theme.fg('error', value) : fgPositive(value)
            )
          }
          if (col.key === 'cost7d') {
            const cost = coerceNumber(position.recentCostUsd)
            return cell(values[col.key], col.width, (value) =>
              cost !== null && cost > 0 ? theme.fg('error', value) : fgPositive(value)
            )
          }
          if (col.key === 'liq') {
            // Soft styling for synthetic/estimated/safe states so the
            // operator can tell them apart at a glance from HL-authoritative
            // numbers (which use the default cell color).
            const raw = values[col.key] ?? ''
            if (raw === 'safe') {
              return cell(raw, col.width, (v) => theme.fg('success', v))
            }
            if (raw === '—') {
              return cell(raw, col.width, (v) => theme.fg('muted', v))
            }
            if (raw.startsWith('~')) {
              return cell(raw, col.width, (v) => theme.fg('dim', v))
            }
            return cell(raw, col.width)
          }
          return cell(values[col.key], col.width)
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

  const lines = [
    renderSectionHeader('Hyperliquid / Recent trades', ` (${trades.length})`, theme),
    theme.fg('dim', columns.map((col) => cell(col.label, col.width)).join(' '))
  ]

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
          if (col.key === 'dir') {
            // Close trades: color by P&L outcome (did the trade make money?).
            // Open trades: color by side (short=red, long=green) to match the positions table.
            let dirTone: 'error' | 'success' | 'dim'
            if (isClose) {
              dirTone = Math.abs(pnl) < 0.005 ? 'dim' : pnl > 0 ? 'success' : 'error'
            } else {
              dirTone = isShort ? 'error' : 'success'
            }
            return cell(values[col.key], col.width, (value) => theme.fg(dirTone, value))
          }
          if (col.key === 'pnl') {
            if (Math.abs(pnl) < 0.005) {
              return cell(values[col.key], col.width, (value) => theme.fg('muted', value))
            }
            return cell(values[col.key], col.width, (value) =>
              pnl < 0 ? theme.fg('error', value) : fgPositive(value)
            )
          }
          if (col.key === 'time') {
            return cell(values[col.key], col.width, (value) => theme.fg('dim', value))
          }
          return cell(values[col.key], col.width)
        })
        .join(' ')
    )
  }

  return lines.join('\n')
}

function renderOpenOrders(orders: readonly StatusOrder[], theme: Theme): string {
  // Column order mirrors renderRecentTrades: Time, Side/Dir, Symbol, Size
  // first, then the columns specific to this table.
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
    renderSectionHeader('Hyperliquid / Orders', ` (${orders.length})`, theme),
    theme.fg('dim', columns.map((col) => cell(col.label, col.width)).join(' '))
  ]

  if (orders.length === 0) {
    lines.push(theme.fg('muted', 'No open orders'))
    return lines.join('\n')
  }

  for (const order of orders) {
    const side = order.side.toUpperCase()
    const flags = [
      order.reduceOnly ? 'RO' : null,
      order.tif !== null && order.tif.length > 0 ? order.tif : null
    ]
      .filter((value): value is string => value !== null)
      .join(',')

    const values: Record<string, string> = {
      time: formatTradeTimestamp(new Date(order.timestamp).toISOString()),
      side,
      symbol: order.coin,
      size: fmtSize(order.size),
      price: fmtPrice(order.limitPx),
      trigger: order.isTrigger ? fmtPrice(order.triggerPx) : '—',
      type: order.orderType,
      flags: flags.length > 0 ? flags : '—'
    }

    lines.push(
      columns
        .map((col) => {
          if (col.key === 'side') {
            return cell(values[col.key], col.width, (value) =>
              theme.fg(order.side === 'sell' ? 'error' : 'success', value)
            )
          }
          if (col.key === 'time') {
            return cell(values[col.key], col.width, (value) => theme.fg('dim', value))
          }
          if (col.key === 'trigger' && !order.isTrigger) {
            return cell(values[col.key], col.width, (value) => theme.fg('muted', value))
          }
          return cell(values[col.key], col.width)
        })
        .join(' ')
    )
  }

  return lines.join('\n')
}

export function renderHyperliquidPositionsWidget(
  status: HyperliquidStatus,
  theme: Theme,
  width: number,
  refreshing = false,
  showRecentTrades = false,
  showOrders = false
): string[] {
  // Loading uses a calm dim border; a real failure (missing account / error) is
  // a warning; a healthy account is the accent.
  const borderTone = status.ok ? 'accent' : status.initializing ? 'dim' : 'warning'
  const borderColor = (value: string): string => theme.fg(borderTone, value)
  const container = new Container()
  const contentWidth = Math.max(20, width - 2)

  container.addChild(new DynamicBorder(borderColor))
  const openSuffix = ` (${status.openPositions} open)`
  const refreshingSuffix = ' (refreshing...)'
  const titleSuffix = refreshing
    ? padRight(refreshingSuffix, Math.max(visibleWidth(openSuffix), visibleWidth(refreshingSuffix)))
    : padRight(openSuffix, Math.max(visibleWidth(openSuffix), visibleWidth(refreshingSuffix)))
  container.addChild(
    new Text(renderSectionHeader('Hyperliquid / Positions', titleSuffix, theme), 1, 0)
  )

  if (!status.ok) {
    const notice = status.initializing
      ? theme.fg('dim', 'Loading account…')
      : theme.fg(
          'warning',
          status.accountError ?? status.error ?? 'Unable to load Hyperliquid status'
        )
    container.addChild(new Text(notice, 1, 0))
    container.addChild(new DynamicBorder(borderColor))
    return container.render(width)
  }

  const pnl =
    status.dailyPnlUsd >= 0
      ? fgPositive(`day +${fmtUsd(status.dailyPnlUsd)}`)
      : theme.fg('error', `day ${fmtUsd(status.dailyPnlUsd)}`)
  const _allTimePnlDisplay =
    status.allTimePnlUsd >= 0
      ? fgPositive(`PnL +${fmtUsd(status.allTimePnlUsd)}`)
      : theme.fg('error', `PnL ${fmtUsd(status.allTimePnlUsd)}`)
  const inferredDeposit = (status.equityUsd ?? 0) - status.allTimePnlUsd
  const allTimeReturnPct = inferredDeposit > 0 ? (status.allTimePnlUsd / inferredDeposit) * 100 : 0
  const returnDisplay =
    status.allTimePnlUsd >= 0
      ? fgPositive(`uPnL +${fmtUsd(status.allTimePnlUsd)} (+${allTimeReturnPct.toFixed(1)}%)`)
      : theme.fg('error', `uPnL ${fmtUsd(status.allTimePnlUsd)} (${allTimeReturnPct.toFixed(1)}%)`)
  const costSummary = status.costSummary
  const cost = costSummary
    ? theme.fg(
        costSummary.netCostUsd > 0 ? 'error' : 'success',
        `cost${costSummary.lookbackDays}d ${fmtCostUsd(costSummary.netCostUsd)}`
      )
    : theme.fg('dim', 'cost -')
  const statusLine = [
    `Updated ${formatLocalTimestamp(status.updatedAt)}`,
    `eq ${fmtUsd(status.equityUsd)}`,
    pnl,
    returnDisplay,
    cost,
    `gross ${fmtUsd(status.grossExposureUsd)}`,
    `net ${fmtUsd(status.netExposureUsd)}`
  ].join('  ·  ')

  container.addChild(new Text(theme.fg('dim', statusLine), 1, 0))
  container.addChild(new Text(renderPositionsTable(status.positions, contentWidth, theme), 1, 0))

  const accountSections: string[] = []
  if (
    typeof status.spotBalanceUsd === 'number' &&
    Number.isFinite(status.spotBalanceUsd) &&
    status.spotBalanceUsd > 0
  ) {
    accountSections.push(`spot ${fmtUsd(status.spotBalanceUsd)}`)
  }

  const accounts = status.hyperliquidAccounts.map(
    (account) =>
      `${account.dex || 'main'}: eq ${fmtUsd(account.equityUsd)}, margin ${fmtUsd(account.marginUsedUsd)}`
  )
  accountSections.push(...accounts)
  const accountLine = accountSections.join('  ·  ')
  if (accountLine.length > 0) {
    container.addChild(new Text(theme.fg('dim', accountLine), 1, 0))
  }

  const recentTrades = status.recentTrades ?? []
  if (showRecentTrades && recentTrades.length > 0) {
    // Dotted rule sets the recent-trades section apart from the main widget.
    container.addChild(new Text(theme.fg('dim', '┈'.repeat(contentWidth)), 1, 0))
    container.addChild(new Text(renderRecentTrades(recentTrades, theme), 1, 0))
  }

  const openOrders = status.openOrders ?? []
  if (showOrders) {
    container.addChild(new Text(theme.fg('dim', '┈'.repeat(contentWidth)), 1, 0))
    container.addChild(new Text(renderOpenOrders(openOrders, theme), 1, 0))
  }
  container.addChild(new DynamicBorder(borderColor))

  return container.render(width)
}
