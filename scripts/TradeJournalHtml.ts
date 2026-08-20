import type { JournalReport, JournalTrade } from '@/types/Journal'

// ---------------------------------------------------------------------------
// Trade-journal feed redesign — server-rendered card + sparkline helpers.
//
// The feed is composed server-side as static HTML (escaped everywhere) and the
// detail modal is rendered client-side from the existing /api/trades/:id JSON.
// All helpers are pure string builders so the routes stay thin and the JSON
// contract (/api/trades, /api/trades/:id) is untouched.
// ---------------------------------------------------------------------------

// Escape a value for safe inline rendering in HTML. Every piece of stored
// report text passes through this — no injection from report data.
export function esc(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v)
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function formatWhen(timestamp: number): string {
  return new Date(timestamp).toISOString().replace('T', ' ').slice(0, 16)
}

export function formatPnlUsd(pnl: number): string {
  const sign = pnl > 0 ? '+' : ''
  return `${sign}$${pnl.toFixed(2)}`
}

export function formatSize(size: number): string {
  // 4 decimals for sub-1 sizes, 2 for the rest — keeps the card number clean.
  return size >= 1 ? size.toFixed(2) : size.toFixed(4)
}

export function pnlClass(pnl: number): 'pos' | 'neg' | 'flat' {
  if (pnl > 0) return 'pos'
  if (pnl < 0) return 'neg'
  return 'flat'
}

export function statusLabel(status: string): string {
  switch (status) {
    case 'tp_hit':
      return 'TP HIT'
    case 'open':
      return 'OPEN'
    case 'filled':
      return 'FILLED'
    case 'closed':
      return 'CLOSED'
    case 'stopped':
      return 'STOPPED'
    default:
      return status.toUpperCase()
  }
}

// ---------------------------------------------------------------------------
// Sparkline
//
// Server-rendered inline SVG from report.equityCurve, downsampled to at most
// 12 points. Graceful fallback: when the curve is absent or has fewer than 2
// points, render a quiet dot marker instead of an empty box.
// ---------------------------------------------------------------------------

export const SPARK_MAX_POINTS = 12

export interface SparklinePoint {
  readonly date: string
  readonly equityUsd: number
}

/** Downsample an equity curve to at most 12 evenly spaced points (edge cases: 0/1/2 pts). */
export function downsampleEquityCurve(
  curve: readonly SparklinePoint[] | null | undefined,
  maxPoints: number = SPARK_MAX_POINTS
): readonly SparklinePoint[] {
  if (curve === null || curve === undefined) return []
  if (curve.length <= maxPoints) return curve
  const step = (curve.length - 1) / (maxPoints - 1)
  const out: SparklinePoint[] = []
  for (let i = 0; i < maxPoints; i += 1) {
    const idx = Math.round(i * step)
    const point = curve[Math.min(Math.max(idx, 0), curve.length - 1)]
    if (point !== undefined) out.push(point)
  }
  return out
}

function svgPath(points: readonly SparklinePoint[]): string {
  const values = points.map((p) => p.equityUsd)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const w = 100
  const h = 40
  const pad = 3
  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * w
    const y = pad + (1 - (p.equityUsd - min) / span) * (h - pad * 2)
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })
  return `M${coords.join(' L')}`
}

/**
 * Inline SVG sparkline (≤12 pts) for a trade card. Returns an empty string when
 * the curve has fewer than 2 points so the caller can render the dot fallback.
 */
export function sparklineSvg(curve: readonly SparklinePoint[] | null | undefined): string {
  const points = downsampleEquityCurve(curve)
  if (points.length < 2) return ''
  const values = points.map((p) => p.equityUsd)
  const first = values[0]
  const last = values[values.length - 1]
  if (first === undefined || last === undefined) return ''
  const rising = last >= first
  const stroke = rising ? '#4ade80' : '#f87171'
  const d = svgPath(points)
  return (
    `<svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">` +
    `<path d="${esc(d)}" fill="none" stroke="${stroke}" ` +
    `stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>` +
    `</svg>`
  )
}

/** Fallback marker when equityCurve is absent or ≤1 point. */
export function sparklineFallback(label = 'no curve'): string {
  return `<span class="no-curve"><span class="dot"></span>${esc(label)}</span>`
}

/** Card sparkline block: real SVG when ≥2 curve points, quiet dot otherwise. */
export function cardSparkline(report: JournalReport | null | undefined): string {
  const curve = report?.equityCurve
  const svg = sparklineSvg(curve)
  if (svg === '') return sparklineFallback()
  return svg
}

// ---------------------------------------------------------------------------
// Card + feed composition
// ---------------------------------------------------------------------------

export function tradeCard(t: JournalTrade): string {
  const pnl = t.realizedPnlUsd ?? 0
  return (
    `<article class="trade-card" data-id="${esc(t.id)}" tabindex="0" ` +
    `aria-label="${esc(t.ticker)} ${esc(t.side)} trade report">` +
    `<div class="tc-head">` +
    `<span class="tc-side">${esc(t.side)} · ${esc(t.ticker)}</span>` +
    `<span class="tc-status">${esc(statusLabel(t.status))}</span>` +
    `</div>` +
    `<div class="tc-row"><span class="tc-ticker">${esc(t.ticker)}</span>` +
    `<span class="tc-entry">@${esc(t.entryPrice)}</span></div>` +
    `<div class="tc-metrics">` +
    `<span class="tc-pnl ${pnlClass(pnl)}">${esc(formatPnlUsd(pnl))}</span>` +
    `<span class="tc-size">size ${esc(formatSize(t.sizeBase))}</span>` +
    `</div>` +
    `<div class="tc-spark">${cardSparkline(t.report)}</div>` +
    `</article>`
  )
}

export interface FeedPageInfo {
  page: number
  perPage: number
  total: number
}

function paginationBar(info: FeedPageInfo): string {
  const shownPer = info.perPage >= 1 && Number.isFinite(info.perPage) ? info.perPage : info.total
  const totalPages = Math.max(1, Math.ceil(info.total / shownPer))
  if (totalPages <= 1) return ''
  let prev = ''
  let next = ''
  if (info.page > 1) {
    prev = `<a class="tj-pg-btn" href="/?page=${info.page - 1}">&#8592; newer</a>`
  }
  if (info.page < totalPages) {
    next = `<a class="tj-pg-btn" href="/?page=${info.page + 1}">older &#8594;</a>`
  }
  const pages = []
  const win = 1
  const start = Math.max(1, info.page - win)
  const end = Math.min(totalPages, info.page + win)
  for (let i = start; i <= end; i++) {
    if (i === info.page) {
      pages.push(`<span class="tj-pg-cur">${i}</span>`)
    } else {
      pages.push(`<a class="tj-pg-num" href="/?page=${i}">${i}</a>`)
    }
  }
  return `<nav class="tj-pagi" aria-label="Feed pages"><div class="tj-pg-links">${prev}${pages.join('')}${next}</div><span class="tj-pg-count">${info.total} position${info.total === 1 ? '' : 's'} · page ${info.page}/${totalPages}</span></nav>`
}

export function feedHtml(
  trades: readonly JournalTrade[],
  count: number,
  page: FeedPageInfo = { page: 1, perPage: Number.MAX_VALUE, total: count }
): string {
  const cards = trades.map(tradeCard).join('')
  return (
    `<div class="tj-wrap">` +
    `<header class="tj-head">` +
    `<div><h1 class="tj-title">Trade Journal</h1>` +
    `<p class="tj-sub">Every position, decision and outcome on record.</p></div>` +
    `<span class="tj-count">${count} position${count === 1 ? '' : 's'}</span>` +
    `</header>` +
    `<div class="tj-feed">${cards}</div>` +
    paginationBar(page) +
    `</div>`
  )
}

// ---------------------------------------------------------------------------
// Feed page shell — full HTML document with the CSS + client script inline.
// ---------------------------------------------------------------------------

export function feedPageHtml(
  trades: readonly JournalTrade[],
  count: number,
  modals: string,
  clientScript: string,
  page: FeedPageInfo = { page: 1, perPage: Number.MAX_VALUE, total: count }
): string {
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>Trade Journal</title>` +
    `<style>${css()}</style>` +
    `</head><body>${feedHtml(trades, count, page)}${modals}` +
    `<script>${clientScript}` +
    `</scr` +
    `ipt>` +
    `</body></html>`
  )
}

// The feed CSS is kept in a separate file (scripts/trade-journal.css) and
// inlined here at build time via the server; this function reads it once.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

let _cssCache: string | null = null
export function css(): string {
  if (_cssCache === null) {
    _cssCache = readFileSync(resolve(import.meta.dir, 'trade-journal.css'), 'utf8')
  }
  return _cssCache
}
