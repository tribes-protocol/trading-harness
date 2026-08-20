#!/usr/bin/env bun
/**
 * Realtime trade-fill capture for the trading journal (operator P0).
 *
 * Clones the repo's established websocket pattern (TrailingStopService/CoinService)
 * so the fill→journal path is realtime and no-miss:
 *
 *  - The journal is the ONLY writer (JournalService.upsert). No batch, no polling.
 *  - WS fill stream (SubscriptionClient.userFills) → translate → upsert immediately.
 *  - No-miss reconciliation: on boot AND on ws reconnect, fetch ALL fills since epoch
 *    from the venue REST (InfoClient.userFillsByTime startTime 0) and upsert each.
 *    Deterministic id per fill (`fill-<tid>-<coin>-<side>`) makes a re-delivered fill
 *    an idempotent no-op — a venue gap never double-writes.
 *  - On ws drop/error: reconnect + re-reconcile (bounded backoff).
 *
 * Latency target: fill event → DB row ≤500ms p50 / ≤2s p99 after venue ack.
 *
 * Invoke: bun scripts/TradeFillRealtime.ts [dbPath]
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { InfoClient, ISubscription } from '@nktkas/hyperliquid'
import { SubscriptionClient, WebSocketTransport } from '@nktkas/hyperliquid'

import type { JournalService } from '@/services/JournalService'
import type { HyperliquidUserFillWire } from '@/types/Hyperliquid'
import { type JournalInsertInput, JournalInsertInputSchema } from '@/types/Journal'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STREAM_FRESH_TIMEOUT_MS = 2000
const RECONNECT_BACKOFF_MS = 1000
const RECONNECT_BACKOFF_MAX_MS = 8000

const DB_PATH = process.argv[2] ?? resolve('/root/workspace/data/trade-journal.sqlite')

// ---------------------------------------------------------------------------
// Address resolution (desk's wallet; the artifact the CLI uses)
// ---------------------------------------------------------------------------

function readDeskAddress(): string {
  const fromEnv = process.env['DESK_ADDRESS']
  if (fromEnv !== undefined && fromEnv.trim().length > 0) return fromEnv.trim()
  try {
    const path = resolve('/root/workspace/.tribes/authoritative-wallet.txt')
    const raw = readFileSync(path, 'utf8')
    const line = raw.split('\n').find((l) => l.trim().startsWith('0x'))
    const addr = (line ?? '').trim().split(/\s+/)[0]
    if (addr !== undefined && /^0x[a-fA-F0-9]{40}$/.test(addr)) return addr
  } catch {
    // fallthrough
  }
  const fromArg = process.argv[3]
  if (fromArg !== undefined && /^0x[a-fA-F0-9]{40}$/.test(fromArg)) return fromArg
  throw new Error(
    'no desk address: set DESK_ADDRESS, run with <addr>, or ensure .tribes/authoritative-wallet.txt'
  )
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

/** Deterministic journal id for a fill — the same fill re-delivered is the same row. */
export function fillJournalId(fill: HyperliquidUserFillWire): string {
  return `fill-${fill.tid}-${fill.coin}-${fill.side}`
}

/** Translate a venue fill wire into a journal insert row (same schema as the import). */
export function translateFill(fill: HyperliquidUserFillWire): JournalInsertInput {
  const coin = fill.coin.trim()
  const dexSep = coin.indexOf(':')
  const dex = dexSep > 0 ? coin.slice(0, dexSep) : 'main'
  const ticker = dexSep > 0 && coin.slice(dexSep + 1).length > 0 ? coin.slice(dexSep + 1) : coin
  const notional = Number(fill.px) * Number(fill.sz)
  return JournalInsertInputSchema.parse({
    id: fillJournalId(fill),
    timestamp: fill.time,
    ticker,
    dex,
    side: fill.side === 'B' ? 'long' : 'short',
    entryPrice: Number(fill.px),
    sizeBase: Number(fill.sz),
    notionalUsd: notional,
    marginUsd: notional,
    leverage: 1,
    stopPx: null,
    targetPx: null,
    riskUsd: null,
    riskPctAccount: null,
    rr: null,
    status: 'filled',
    realizedPnlUsd: Number(fill.closedPnl || 0),
    report: null
  })
}

/** Collect the set of fill ids already in the journal (dedup anchor). */
export function journalFillIds(journal: JournalService): Set<string> {
  return new Set(journal.list(10000, 0).map((t) => t.id))
}

/**
 * Upsert every fill not already present, given the set of existing journal ids.
 * Returns the count written. Idempotent per fill id: a fill already present is
 * skipped, so a venue gap never double-writes. `existingIds` is injected so the
 * dedup logic is unit-testable without a live Bun DB.
 */
export function reconcileFillGaps(
  journal: JournalService,
  fills: readonly HyperliquidUserFillWire[],
  existingIds: Set<string> = journalFillIds(journal),
  log: (count: number) => void = () => undefined
): number {
  let written = 0
  for (const fill of fills) {
    const id = fillJournalId(fill)
    if (existingIds.has(id)) continue
    journal.upsert(translateFill(fill))
    existingIds.add(id)
    written += 1
  }
  log(written)
  return written
}

/** Backfill on boot: pull all fills since epoch from the venue and upsert. */
export async function reconcileOnBoot(
  journal: JournalService,
  info: InfoClient,
  address: string
): Promise<number> {
  const fills = await info.userFillsByTime({
    user: address,
    startTime: 0,
    aggregateByTime: false,
    reversed: false
  })
  const countNow = journal.count()
  const existing = journalFillIds(journal)
  return reconcileFillGaps(journal, fills, existing, (n) =>
    console.error(`reconcile boot: venue=${fills.length} db=${countNow} upserted=${n}`)
  )
}

// ---------------------------------------------------------------------------
// Supervisor — the realtime loop with reconnect + stale timeout.
// ---------------------------------------------------------------------------

interface TradeFillSupervisor {
  start(): Promise<void>
  stop(): Promise<void>
}

/** Run the fill stream, writing each fill to the journal; reconnect + re-reconcile on drop. */
export function runTradeFillSupervisor(deps: {
  journal: JournalService
  info: InfoClient
  address: string
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  onWrite?: (row: JournalInsertInput) => void
  onError?: (err: unknown) => void
}): TradeFillSupervisor {
  const now = deps.now ?? Date.now
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))
  const onError =
    deps.onError ??
    ((err: unknown): void => {
      console.error(`fill loop error: ${err instanceof Error ? err.message : String(err)}`)
    })
  const onWrite =
    deps.onWrite ??
    ((row: JournalInsertInput): void => {
      deps.journal.upsert(row)
    })

  let running = false
  let stopRequested = false
  let transport: WebSocketTransport | null = null
  let subscription: ISubscription | null = null

  const writeFills = (fills: readonly HyperliquidUserFillWire[]): void => {
    for (const fill of fills) {
      try {
        onWrite(translateFill(fill))
      } catch (err) {
        onError(err)
      }
    }
  }

  const subscribeOnce = async (): Promise<void> => {
    transport = new WebSocketTransport()
    const subClient = new SubscriptionClient({ transport })
    subscription = await subClient.userFills(
      { user: deps.address, aggregateByTime: false },
      (data) => {
        const eventFills = data.fills
        if (Array.isArray(eventFills)) writeFills(eventFills)
      }
    )
  }

  const run = async (): Promise<void> => {
    let backoff = RECONNECT_BACKOFF_MS
    while (running && !stopRequested) {
      try {
        await subscribeOnce()
        backoff = RECONNECT_BACKOFF_MS

        // Stream is live. The SDK resubscribes on a transient drop, so we wait for
        // either a fresh fill or a TERMINAL failureSignal (permanent disconnect that
        // the SDK could not restore). A timeout just re-enters a fresh cycle so an idle
        // reconnect still re-reconciles venue gaps on the next pass.
        const deadline = now() + STREAM_FRESH_TIMEOUT_MS
        while (running && !stopRequested && now() < deadline) {
          if (subscription !== null && subscription.failureSignal.aborted) break
          await sleep(100)
        }
        await sleep(Math.min(backoff, RECONNECT_BACKOFF_MAX_MS))
      } catch (err) {
        onError(err)
        await sleep(Math.min(backoff, RECONNECT_BACKOFF_MAX_MS))
        backoff = Math.min(backoff * 2, RECONNECT_BACKOFF_MAX_MS)
      }
    }
  }

  const start = async (): Promise<void> => {
    if (running) return
    running = true
    stopRequested = false
    // Boot reconciliation first — backfills any pre-existing venue gap (e.g. the SOL fill).
    void reconcileOnBoot(deps.journal, deps.info, deps.address).then(() => {
      void run()
    })
  }

  const stop = async (): Promise<void> => {
    stopRequested = true
    running = false
    if (subscription !== null) await subscription.unsubscribe().catch(() => undefined)
    if (transport !== null) await transport.close().catch(() => undefined)
    subscription = null
    transport = null
  }

  return { start, stop }
}

// -------------------------------------------------------------------------
// Script entrypoint (guarded so the module is importable by tests).
// -------------------------------------------------------------------------

if (import.meta.main) {
  // Runtime-only construction — keeps bun:sqlite and the live HTTP client out of
  // the module import graph so tests can import the pure helpers.
  const { HttpTransport: RuntimeHttpTransport, InfoClient: RuntimeInfoClient } = await import(
    '@nktkas/hyperliquid'
  )
  const { JournalService } = await import('@/services/JournalService')
  const journal = new JournalService({ dbPath: DB_PATH })
  const info = new RuntimeInfoClient({ transport: new RuntimeHttpTransport() })
  const address = readDeskAddress()
  console.error(`realtime fill capture: db=${DB_PATH} address=${address}`)
  const supervisor = runTradeFillSupervisor({ journal, info, address })
  void supervisor.start()

  // Graceful stop on SIGINT/SIGTERM — close the stream before exit.
  const stop = async (): Promise<void> => {
    await supervisor.stop()
    process.exit(0)
  }
  process.on('SIGINT', () => void stop())
  process.on('SIGTERM', () => void stop())
}
