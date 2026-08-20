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

const server = Bun.serve({
  port: PORT,
  routes: {
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
