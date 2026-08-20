import { Database } from 'bun:sqlite'

import { type JournalInsertInput, type JournalTrade, JournalTradeSchema } from '@/types/Journal'
import { ensureJsonTreeString } from '@/utils/Lang'

type JournalRow = Record<string, unknown> | null | undefined

/** Narrow one sqlite row value to a plain object record (no casts). */
function readRow(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined || typeof value !== 'object') return null
  if (Array.isArray(value)) return null
  const out: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(value)) out[key] = val
  return out
}

/** Narrow a sqlite result array to plain object records (no casts). */
function readRows(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return []
  const out: Array<Record<string, unknown>> = []
  for (const item of value) {
    const row = readRow(item)
    if (row !== null) out.push(row)
  }
  return out
}

function rowToTrade(row: JournalRow): JournalTrade {
  if (row === null || row === undefined) {
    throw new Error('no trade row')
  }
  const reportJson = row['report_json']
  const report =
    typeof reportJson === 'string' && reportJson.length > 0
      ? JournalTradeSchema.shape.report.parse(JSON.parse(reportJson))
      : null
  const status = row['status']
  const side = row['side']
  return JournalTradeSchema.parse({
    id: String(row['id']),
    timestamp: Number(row['timestamp']),
    ticker: String(row['ticker']),
    dex: String(row['dex'] ?? ''),
    side: side === 'long' || side === 'short' ? side : 'long',
    entryPrice: Number(row['entry_price']),
    sizeBase: Number(row['size_base']),
    notionalUsd: Number(row['notional_usd']),
    marginUsd: Number(row['margin_usd']),
    leverage: Number(row['leverage']),
    stopPx: row['stop_px'] === null ? undefined : Number(row['stop_px']),
    targetPx: row['target_px'] === null ? undefined : Number(row['target_px']),
    riskUsd: row['risk_usd'] === null ? undefined : Number(row['risk_usd']),
    riskPctAccount: row['risk_pct_account'] === null ? undefined : Number(row['risk_pct_account']),
    rr: row['rr'] === null ? undefined : Number(row['rr']),
    status:
      status === 'open' ||
      status === 'filled' ||
      status === 'closed' ||
      status === 'stopped' ||
      status === 'tp_hit'
        ? status
        : 'open',
    realizedPnlUsd: Number(row['realized_pnl_usd']),
    report
  })
}

export interface JournalServiceParams {
  readonly dbPath: string
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS trades (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  ticker TEXT NOT NULL,
  dex TEXT NOT NULL DEFAULT '',
  side TEXT NOT NULL CHECK (side IN ('long','short')),
  entry_price REAL NOT NULL,
  size_base REAL NOT NULL,
  notional_usd REAL NOT NULL,
  margin_usd REAL NOT NULL,
  leverage INTEGER NOT NULL,
  stop_px REAL,
  target_px REAL,
  risk_usd REAL,
  risk_pct_account REAL,
  rr REAL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','filled','closed','stopped','tp_hit')),
  realized_pnl_usd REAL NOT NULL DEFAULT 0,
  report_json TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
)
`

export class JournalService {
  private readonly db: Database

  constructor(params: JournalServiceParams) {
    this.db = new Database(params.dbPath)
    this.db.run(SCHEMA)
  }

  upsert(trade: JournalInsertInput): void {
    this.db
      .query(
        `INSERT INTO trades (
          id, timestamp, ticker, dex, side, entry_price, size_base, notional_usd,
          margin_usd, leverage, stop_px, target_px, risk_usd, risk_pct_account, rr,
          status, realized_pnl_usd, report_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          timestamp = excluded.timestamp, ticker = excluded.ticker, dex = excluded.dex,
          side = excluded.side, entry_price = excluded.entry_price, size_base = excluded.size_base,
          notional_usd = excluded.notional_usd, margin_usd = excluded.margin_usd,
          leverage = excluded.leverage, stop_px = excluded.stop_px, target_px = excluded.target_px,
          risk_usd = excluded.risk_usd, risk_pct_account = excluded.risk_pct_account,
          rr = excluded.rr, realized_pnl_usd = excluded.realized_pnl_usd, report_json = excluded.report_json`
      )
      .run(
        trade.id,
        trade.timestamp,
        trade.ticker,
        trade.dex,
        trade.side,
        trade.entryPrice,
        trade.sizeBase,
        trade.notionalUsd,
        trade.marginUsd,
        trade.leverage,
        trade.stopPx ?? null,
        trade.targetPx ?? null,
        trade.riskUsd ?? null,
        trade.riskPctAccount ?? null,
        trade.rr ?? null,
        trade.status,
        trade.realizedPnlUsd,
        trade.report === null || trade.report === undefined
          ? null
          : ensureJsonTreeString(trade.report)
      )
  }

  list(limit: number, offset: number): JournalTrade[] {
    const rows = readRows(
      this.db
        .query(`SELECT * FROM trades ORDER BY timestamp DESC LIMIT ? OFFSET ?`)
        .all(limit, offset)
    )
    return rows.map(rowToTrade)
  }

  listByStatus(status: string, limit: number, offset: number): JournalTrade[] {
    const rows = readRows(
      this.db
        .query(`SELECT * FROM trades WHERE status = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?`)
        .all(status, limit, offset)
    )
    return rows.map(rowToTrade)
  }

  countByStatus(): Record<string, number> {
    const rows = readRows(
      this.db.query(`SELECT status, COUNT(*) AS n FROM trades GROUP BY status`).all()
    )
    const out: Record<string, number> = {}
    for (const row of rows) {
      const status = String(row['status'] ?? '')
      const n = Number(row['n'] ?? 0)
      if (status.length > 0 && Number.isFinite(n)) out[status] = n
    }
    return out
  }

  get(id: string): JournalTrade | null {
    const row = readRow(this.db.query(`SELECT * FROM trades WHERE id = ?`).get(id))
    if (row === null) return null
    return rowToTrade(row)
  }

  count(): number {
    const row = readRow(this.db.query(`SELECT COUNT(*) AS n FROM trades`).get())
    const n = row === null ? 0 : Number(row['n'])
    return Number.isFinite(n) ? n : 0
  }
}
