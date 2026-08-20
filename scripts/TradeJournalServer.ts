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
 *
 * Feed redesign (m3.1): '/' renders a modern card feed (server-rendered,
 * escaped, inline SVG sparkline from report.equityCurve with a dot fallback)
 * plus server-rendered report modals opened by a small inline client script.
 * The /api/trades JSON contract is untouched.
 */
import { resolve } from 'node:path'

import { JournalService } from '@/services/JournalService'
import { ensureJsonTreeString } from '@/utils/Lang'

import { feedPageHtml } from './TradeJournalHtml'
import { FEED_CLIENT_SCRIPT, renderReportBody, tradeModalHtml } from './TradeJournalModal'

const PORT = Number(process.argv[2] ?? '3100')
const DB_PATH = process.argv[3] ?? resolve('/root/workspace/data/trade-journal.sqlite')

const journal = new JournalService({ dbPath: DB_PATH })

const json = (value: unknown, status = 200): Response =>
  new Response(ensureJsonTreeString(value), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })

const PAGE_SIZE = 8

const server = Bun.serve({
  port: PORT,
  routes: {
    '/': (req) => {
      const url = new URL(req.url)
      const rawStatus = url.searchParams.get('status')
      const status =
        rawStatus !== null && ['open', 'filled', 'closed', 'stopped', 'tp_hit'].includes(rawStatus)
          ? rawStatus
          : null
      const rawAll = url.searchParams.get('all')
      const all = rawAll === '1' || rawAll === 'true'
      const rawPage = Number(url.searchParams.get('page') ?? '1')
      const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1
      const perPage = all ? 500 : PAGE_SIZE
      const offset = (page - 1) * perPage
      const trades =
        status === null
          ? journal.list(perPage, offset)
          : journal.listByStatus(status, perPage, offset)
      const modals = trades.map((t) => tradeModalHtml(t)).join('')
      const byStatus = journal.countByStatus()
      const statusCounts = {
        open: byStatus['open'] ?? 0,
        filled: byStatus['filled'] ?? 0,
        stopped: byStatus['stopped'] ?? 0,
        tp_hit: byStatus['tp_hit'] ?? 0,
        closed: byStatus['closed'] ?? 0
      }
      const allTotal = journal.count()
      const shownTotal = status === null ? allTotal : (byStatus[status] ?? 0)
      const pageInfo = {
        page,
        perPage,
        total: allTotal,
        status: status ?? undefined,
        statusCounts
      }
      const html = feedPageHtml(trades, shownTotal, modals, FEED_CLIENT_SCRIPT, pageInfo)
      return new Response(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      })
    },

    '/trades/:id': (req) => {
      const id = req.params['id']
      const trade = id === undefined ? null : journal.get(id)
      if (trade === null) {
        return new Response('<h1>Not found</h1><p><a href="/">&#8592; back to feed</a></p>', {
          status: 404,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        })
      }
      const body = renderReportBody(trade)
      const page = feedPageHtml([trade], 1, tradeModalHtml(trade), FEED_CLIENT_SCRIPT)
      // Detail page shows the report body + a back link; reuse the feed shell.
      const withBody = page.replace('<div class="tj-wrap">', `<div class="tj-wrap">` + body)
      return new Response(withBody, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      })
    },

    '/health': () => json({ ok: true, trades: journal.count() }),

    '/api/trades': (req) => {
      const url = new URL(req.url)
      const limit = Math.min(Number(url.searchParams.get('limit') ?? '20'), 100)
      const offset = Math.max(Number(url.searchParams.get('offset') ?? '0'), 0)
      const rawStatus = url.searchParams.get('status')
      const status =
        rawStatus && ['open', 'filled', 'closed', 'stopped', 'tp_hit'].includes(rawStatus)
          ? rawStatus
          : undefined
      const trades =
        status === undefined
          ? journal.list(limit, offset)
          : journal.listByStatus(status, limit, offset)
      return json({
        trades,
        count: trades.length,
        offset,
        limit,
        status: status ?? undefined,
        totals: { ...journal.countByStatus(), all: journal.count() }
      })
    },

    '/api/trades/:id': (req) => {
      const id = req.params['id']
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
