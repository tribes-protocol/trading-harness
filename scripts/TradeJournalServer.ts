#!/usr/bin/env bun
/**
 * Trade journal HTTP server — serves the trade feed + detail views.
 *
 * Bun/SQLite lightweight server per the trade-journal website spec (M2).
 * Routes:
 *   GET /api/trades?limit=20&offset=0   -> paginated trade feed
 *   GET /api/trades/<id>                -> one trade + full report
 *   GET /health                          -> liveness
 * Served behind tribes-caddy at trades.sparkling-mantis.zbox.sh.
 *
 * Invoke: bun scripts/TradeJournalServer.ts [port] [dbPath]
 */
import { JournalService } from '@/services/JournalService'
import { resolve } from 'node:path'

const PORT = Number(process.argv[2] ?? '3100')
const DB_PATH = process.argv[3] ?? resolve('/root/workspace/data/trade-journal.sqlite')

const journal = new JournalService({ dbPath: DB_PATH })

const json = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })

const html = (body: string, status = 200): Response =>
  new Response(`<!doctype html><html><head><meta charset="utf-8">`
    + `<title>Trade Journal</title>`
    + `<style>body{font-family:system-ui,sans-serif;margin:2rem;max-width:72rem}h1{font-size:1.4rem}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ddd;padding:6px 8px;font-size:.85rem}tr:nth-child(2n){background:#fafafa}a{color:#1a5fb4}.muted{color:#777}.mono{font-family:ui-monospace;font-size:.85rem}</style>`
    + `</head><body>${body}</body></html>`, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  })

// Escape a value for safe inline rendering in HTML.
const esc = (v: unknown): string => {
  const s = v === null || v === undefined ? '' : String(v)
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// Render one trade row for the paginated feed table.
function tradeRow(t: { id: string; timestamp: number; ticker: string; side: string; entryPrice: number; sizeBase: number; status: string; realizedPnlUsd: number }): string {
  const when = new Date(t.timestamp).toISOString().replace('T', ' ').slice(0, 16)
  return `<tr><td><a href="/trades/${esc(t.id)}">${esc(t.ticker)}</a></td>`
    + `<td>${esc(t.side)}</td>`
    + `<td>${esc(when)}</td>`
    + `<td>${esc(t.entryPrice)}</td>`
    + `<td>${esc(t.sizeBase)}</td>`
    + `<td>${esc(t.status)}</td>`
    + `<td class=mono>${esc(t.realizedPnlUsd)}</td></tr>`
}

const server = Bun.serve({
  port: PORT,
  routes: {
    '/': (req) => {
      const url = new URL(req.url)
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? '20'), 1), 100)
      const offset = Math.max(Number(url.searchParams.get('offset') ?? '0'), 0)
      const trades = journal.list(limit, offset)
      const rows = trades.map(tradeRow).join('')
      const prev = offset > 0
        ? `<a href="/?limit=${limit}&offset=${Math.max(offset - limit, 0)}">&#8592; prev</a>` : ''
      const next = trades.length === limit
        ? `<a href="/?limit=${limit}&offset=${offset + limit}">next &#8594;</a>` : ''
      return html(`<h1>Trade Journal</h1>`
        + `<p class=muted>${journal.count()} positions on record</p>`
        + `<table><thead><tr><th>ticker</th><th>side</th><th>opened</th><th>entry</th><th>size</th><th>status</th><th>pnl</th></tr></thead>`
        + `<tbody>${rows}</tbody></table>`
        + `<p>${prev} ${next}</p>`
        + `<p class=muted>Skip to the API: <a href=/api/trades>json</a></p>`)
    },

    '/trades/:id': (req) => {
      const id = (req.params as { id?: string })['id']
      const trade = id === undefined ? null : journal.get(id)
      if (trade === null) return html('<h1>Not found</h1><p><a href="/">&#8592; back to feed</a></p>', 404)
      const when = new Date(trade.timestamp).toISOString().replace('T', ' ').slice(0, 16)
      const report = trade.report
      const thesis = report?.thesis ?? '—'
      const bias = report?.bias ?? '—'
      const rr = report?.rr ?? null
      const eq = report?.accountSnapshot
      const eqLine = eq ? `${eq.date} equity $${eq.equityUsd}${eq.withdrawableUsd != null ? ` / withdraw $${eq.withdrawableUsd}` : ''}` : '—'
      return html(`<p><a href="/">&#8592; back to feed</a></p>`
        + `<h1>${esc(trade.ticker)} · ${esc(trade.side)}</h1>`
        + `<p class=muted>${esc(when)} · ${esc(trade.status)} · pnl <span class=mono>${esc(trade.realizedPnlUsd)}</span></p>`
        + `<p><b>entry</b> ${esc(trade.entryPrice)} · <b>size</b> ${esc(trade.sizeBase)} · <b>notional</b> ${esc(trade.notionalUsd)} · <b>margin</b> ${esc(trade.marginUsd)} · <b>lev</b> ${esc(trade.leverage)}</p>`
        + `<p><b>entry price</b> ${esc(trade.entryPrice)} · <b>stop</b> ${esc(trade.stopPx ?? '—')} · <b>target</b> ${esc(trade.targetPx ?? '—')}</p>`
        + `<h3>Thesis</h3><p>${esc(thesis)}</p>`
        + `<h3>bias</h3><p>${esc(bias)}${rr != null ? ` · R:R ${esc(rr)}` : ''}</p>`
        + `<h3>account snapshot</h3><p>${esc(eqLine)}</p>`
        + `<h3>sources</h3>`
        + `<ul>${(report?.sources ?? []).map(s => `<li>${esc(s.reason)}${s.url ? ` (<a href="${esc(s.url)}">src</a>)` : ''}</li>`).join('')}</ul>`)
    },

    '/health': () => json({ ok: true, trades: journal.count() }),

    '/api/trades': (req) => {
      const url = new URL(req.url)
      const limit = Math.min(Number(url.searchParams.get('limit') ?? '20'), 100)
      const offset = Math.max(Number(url.searchParams.get('offset') ?? '0'), 0)
      const trades = journal.list(limit, offset)
      return json({ trades, count: trades.length, offset, limit })
    },

    '/api/trades/:id': (req) => {
      const id = (req.params as { id?: string })['id']
      if (id === undefined) return json({ error: 'missing id' }, 400)
      const trade = journal.get(id)
      if (trade === null) return json({ error: 'not found' }, 404)
      return json({ trade })
    }
  }
})

console.error(`trade-journal server listening on :${PORT} db=${DB_PATH}`)
// keep the process alive
if (typeof Bun !== 'undefined') {
  const _keepAlive = server
}
