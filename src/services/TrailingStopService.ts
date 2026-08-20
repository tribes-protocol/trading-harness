import { spawn } from 'node:child_process'
import { existsSync, openSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import type { InfoClient, MetaAndAssetCtxsParameters } from '@nktkas/hyperliquid'
import { SubscriptionClient, WebSocketTransport } from '@nktkas/hyperliquid'
import BigNumber from 'bignumber.js'

import { retryProviderAware } from '@/helpers/AsyncControl'
import { HyperliquidService } from '@/services/HyperliquidService'
import { type EthAddress } from '@/types/Eth'
import {
  type TrailingStopArmResult,
  TrailingStopArmResultSchema,
  type TrailingStopCancelResult,
  TrailingStopCancelResultSchema,
  type TrailingStopExitResult,
  type TrailingStopListResult,
  TrailingStopListResultSchema,
  type TrailingStopMonitorDeps,
  type TrailingStopMonitorResult,
  TrailingStopMonitorResultSchema,
  type TrailingStopSide,
  type TrailingStopSource,
  type TrailingStopState,
  TrailingStopStateSchema,
  type TrailingStopTrailConfig
} from '@/types/TrailingStop'
import { ensureJsonTreeString, isNullish } from '@/utils/Lang'

const DEFAULT_STATE_DIR = resolve(process.cwd(), '.tribes')
const STOPS_FILENAME = 'trailing-stops.json'
const HEARTBEAT_FRESH_MS = 45_000
const STREAM_CONNECT_TIMEOUT_MS = 6_000
const STREAM_TICK_TIMEOUT_MS = 20_000
// Poll-mode cadence: when the websocket stream is down/stalled, pace poll ticks
// at ~10s instead of busy-polling the Info API at HTTP speed.
const POLL_MS = 10_000

export interface TrailingStopServiceParams {
  readonly stateDir?: string
  readonly hyperliquid: HyperliquidService
  readonly infoClient?: InfoClient
  readonly now?: () => number
  readonly sleep?: (ms: number) => Promise<void>
  readonly spawnMonitor?: (id: string) => number | null
}

function isFileNotFoundError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

function normalizeDexName(dex: string | null | undefined): string {
  const trimmed = dex?.trim() ?? ''
  return trimmed.length === 0 || trimmed === 'main' ? 'main' : trimmed
}

/**
 * Resolve the argv payload for re-spawning the detached monitor.
 *
 * Deployment-dependent: under the compiled binary, process.argv =
 * [binary, 'trailing-stop', 'monitor', id] so argv[1] is the subcommand and the
 * child re-execs the binary directly. Under the bun-shim deployment
 * (exec bun src/cli/Tribes.ts "$@"), process.argv = [bun, <script>,
 * 'trailing-stop', 'monitor', id] — argv[1] is a real script path the child
 * MUST receive, or the interpreter tries to load a module literally named
 * 'trailing-stop' and dies with 'Script not found'.
 */
export function resolveMonitorSpawnArgs(argv: readonly string[]): readonly string[] {
  const entry = argv[1]
  if (entry !== undefined && existsSync(entry)) {
    return [entry, 'trailing-stop', 'monitor']
  }
  return ['trailing-stop', 'monitor']
}

/**
 * Pure trailing-stop math: where the stop sits given the current peak/trough.
 * long → stop = peak × (1 − pct)  (or peak − px); short → trough × (1 + pct)
 * (or trough + px). Only ever tightens as peak/trough moves in favor.
 */
export function computeTrailingStop(
  side: TrailingStopSide,
  peakOrTrough: BigNumber,
  trail: TrailingStopTrailConfig
): BigNumber {
  if (trail.kind === 'pct') {
    const factor = trail.value / 100
    return side === 'long'
      ? peakOrTrough.multipliedBy(1 - factor)
      : peakOrTrough.multipliedBy(1 + factor)
  }
  return side === 'long' ? peakOrTrough.minus(trail.value) : peakOrTrough.plus(trail.value)
}

/**
 * Trailing-stop capability: arm → monitor (stream-first, 10s poll fallback) →
 * reduce-only exit on trigger. The trailing stop sits ALONGSIDE the position's
 * hard SL/TP bracket — never a naked position, never a flip, never over-close.
 *
 * State is a durable JSON snapshot (one array) in the sandbox state dir; the
 * monitor is a detached process that writes a heartbeat so `list`/`cancel` can
 * reconcile a dead loop. Single-flight per stop: a monitor refuses to twin.
 */
export class TrailingStopService {
  private readonly stateDir: string

  private readonly stopsPath: string

  private readonly hyperliquid: HyperliquidService

  private readonly infoClient: InfoClient | null

  private readonly now: () => number

  private readonly sleep: (ms: number) => Promise<void>

  private readonly spawnMonitor: (id: string) => number | null

  constructor(params: TrailingStopServiceParams) {
    this.stateDir = params.stateDir ?? DEFAULT_STATE_DIR
    this.stopsPath = resolve(this.stateDir, STOPS_FILENAME)
    this.hyperliquid = params.hyperliquid
    this.infoClient = params.infoClient ?? null
    this.now = params.now ?? ((): number => Date.now())
    this.sleep = params.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))
    this.spawnMonitor = params.spawnMonitor ?? ((id: string) => this.defaultSpawnMonitor(id))
  }

  // ---- persistence ----

  private async loadAll(): Promise<TrailingStopState[]> {
    let text: string
    try {
      text = await readFile(this.stopsPath, 'utf8')
    } catch (error) {
      if (isFileNotFoundError(error)) return []
      throw new Error(
        `Unable to read trailing-stop state at ${this.stopsPath}: ` +
          `${error instanceof Error ? error.message : String(error)}`
      )
    }
    const parsed = TrailingStopListResultSchema.parse(JSON.parse(text))
    return parsed.stops
  }

  private async persistAll(stops: TrailingStopState[]): Promise<void> {
    await mkdir(this.stateDir, { recursive: true })
    await writeFile(this.stopsPath, ensureJsonTreeString({ stops }), {
      encoding: 'utf8',
      mode: 0o600
    })
  }

  private async loadState(id: string): Promise<TrailingStopState | null> {
    const stops = await this.loadAll()
    return stops.find((s) => s.id === id) ?? null
  }

  private async updateState(
    id: string,
    patch: Partial<TrailingStopState>
  ): Promise<TrailingStopState> {
    const stops = await this.loadAll()
    const index = stops.findIndex((s) => s.id === id)
    if (index < 0) throw new Error(`unknown trailing stop ${id}`)
    const current = stops[index]
    if (isNullish(current)) throw new Error(`unknown trailing stop ${id}`)
    const updated = TrailingStopStateSchema.parse({ ...current, ...patch, updatedAt: this.now() })
    stops[index] = updated
    await this.persistAll(stops)
    return updated
  }

  // ---- arm ----

  async arm(params: {
    coin: string
    dex: string | null | undefined
    from: EthAddress
    side: TrailingStopSide
    trail: TrailingStopTrailConfig
    walletId: string
  }): Promise<TrailingStopArmResult> {
    const dex = normalizeDexName(params.dex)
    const coin = params.coin.trim().toUpperCase()

    // The position must be live and open — arm only protects a real position.
    const positions = await this.hyperliquid.listPositions({
      address: params.from,
      dex: dex === 'main' ? null : dex,
      allDexes: false
    })
    const position = positions.positions.find(
      (p) => p.coin.toUpperCase() === coin && p.dex === dex && p.side === params.side
    )
    if (isNullish(position)) {
      throw new Error(
        `no open ${params.side} position for ${coin} on ${dex} to arm a trailing stop on`
      )
    }

    const entryPx = new BigNumber(position.entryPx)
    const sizeAtArm = position.size

    // Seed peak/trough from entry (the plan: peak = running max seeded by
    // entry). No-lose arm guard: reject if the initial stop already crosses the
    // current mark, i.e. arming a stop that would trigger immediately.
    const initialStop = computeTrailingStop(params.side, entryPx, params.trail)
    const mark = await this.fetchMark(coin, dex)
    if (mark === null) {
      throw new Error(`unable to read a live mark for ${coin} on ${dex} to arm the trailing stop`)
    }
    if (params.side === 'long' && mark.lte(initialStop)) {
      throw new Error(
        `no-lose arm guard: current mark ${mark.toFixed()} is already at/below the initial ` +
          `trailing stop ${initialStop.toFixed()} for the ${coin} long — refusing to arm`
      )
    }
    if (params.side === 'short' && mark.gte(initialStop)) {
      throw new Error(
        `no-lose arm guard: current mark ${mark.toFixed()} is already at/above the initial ` +
          `trailing stop ${initialStop.toFixed()} for the ${coin} short — refusing to arm`
      )
    }

    // Seed the running peak/trough with the better of entry and current mark so
    // arming on a position that is already in profit does not trigger instantly.
    const seeded =
      params.side === 'long' ? BigNumber.maximum(entryPx, mark) : BigNumber.minimum(entryPx, mark)
    const stop = computeTrailingStop(params.side, seeded, params.trail)

    const id = `${coin.toLowerCase()}-${params.side}-${this.now()}`
    const now = this.now()
    const state = TrailingStopStateSchema.parse({
      id,
      coin,
      dex,
      side: params.side,
      sizeAtArm,
      entryPx: entryPx.toFixed(),
      trail: params.trail,
      stopPx: stop.toFixed(),
      peakOrTrough: seeded.toFixed(),
      source: 'poll',
      status: 'armed',
      firedAt: null,
      exitFill: null,
      from: params.from,
      walletId: params.walletId,
      createdAt: now,
      updatedAt: now,
      heartbeatAt: null,
      lastMarkPx: mark.toFixed(),
      monitorAlive: null
    })

    const stops = await this.loadAll()
    stops.push(state)
    await this.persistAll(stops)

    // Spawn the detached monitor (the loop process); the supervisor surface is
    // list/cancel reading heartbeat + status.
    const monitorPid = this.spawnMonitor(id)

    return TrailingStopArmResultSchema.parse({
      armed: true,
      state,
      monitorPid
    })
  }

  // ---- list / cancel ----

  async list(): Promise<TrailingStopListResult> {
    const stops = await this.loadAll()
    const now = this.now()
    const withAlive = stops.map((s) =>
      TrailingStopStateSchema.parse({
        ...s,
        monitorAlive:
          s.status === 'armed' &&
          !isNullish(s.heartbeatAt) &&
          now - s.heartbeatAt < HEARTBEAT_FRESH_MS
      })
    )
    return TrailingStopListResultSchema.parse({ stops: withAlive })
  }

  async cancel(id: string): Promise<TrailingStopCancelResult> {
    const state = await this.loadState(id)
    if (isNullish(state)) throw new Error(`unknown trailing stop ${id}`)
    if (state.status === 'exited' || state.status === 'cancelled') {
      // Already closed/cancelled — do NOT exit again; record and stop.
      return TrailingStopCancelResultSchema.parse({
        cancelled: true,
        id,
        state
      })
    }
    const updated = await this.updateState(id, { status: 'cancelled' })
    return TrailingStopCancelResultSchema.parse({ cancelled: true, id, state: updated })
  }

  // ---- monitor ----

  /**
   * Real monitor wiring: try the websocket stream first (first tick within the
   * connect timeout), fall back to the 10s poll, and run the shared loop.
   * Single-flight: refuse to twin a stop whose monitor is still heartbeating.
   */
  async monitor(id: string): Promise<TrailingStopMonitorResult> {
    const state = await this.loadState(id)
    if (isNullish(state))
      return TrailingStopMonitorResultSchema.parse({
        ok: false,
        id,
        reason: 'unknown trailing stop'
      })
    if (state.status !== 'armed') {
      return TrailingStopMonitorResultSchema.parse({
        ok: false,
        id,
        reason: `not armed (status ${state.status})`
      })
    }
    const now = this.now()
    if (!isNullish(state.heartbeatAt) && now - state.heartbeatAt < HEARTBEAT_FRESH_MS) {
      return TrailingStopMonitorResultSchema.parse({
        ok: false,
        id,
        reason: 'a monitor is already running for this stop (single-flight)'
      })
    }

    // Stream-first: subscribe and wait for the first tick; the loop's getMark
    // switches to the poll fallback if the stream stalls.
    let streamSource: TrailingStopSource = 'poll'
    let streamReady = false
    let latestMark: BigNumber | null = null
    let markWaiters: Array<(m: BigNumber) => void> = []
    let transport: WebSocketTransport | null = null
    let subscription: { unsubscribe: () => Promise<void> } | null = null

    const pushMark = (value: BigNumber): void => {
      latestMark = value
      for (const waiter of markWaiters) waiter(value)
      markWaiters = []
    }

    const dex = state.dex === 'main' ? '' : state.dex
    const streamCoin =
      dex.length > 0 && !state.coin.includes(':') ? `${dex}:${state.coin}` : state.coin
    try {
      transport = new WebSocketTransport()
      const subClient = new SubscriptionClient({ transport })
      subscription = await subClient.activeAssetCtx({ coin: streamCoin }, (data) => {
        const px = data.ctx.markPx ?? data.ctx.midPx
        if (px === null || px === undefined) return
        const value = new BigNumber(px)
        if (value.isFinite() && value.isGreaterThan(0)) {
          streamReady = true
          pushMark(value)
        }
      })
    } catch {
      // WebSocket could not connect — poll fallback only.
      transport = null
      subscription = null
    }

    // Wait up to the connect timeout for the first streamed tick.
    if (streamReady === false) {
      const deadline = this.now() + STREAM_CONNECT_TIMEOUT_MS
      while (this.now() < deadline && latestMark === null) {
        await this.sleep(100)
      }
    }
    streamSource = streamReady ? 'stream' : 'poll'

    const deps: TrailingStopMonitorDeps = {
      getMark: async () => {
        if (streamSource === 'stream' && latestMark !== null) {
          const next = await new Promise<BigNumber | null>((resolve) => {
            const timer = setTimeout(() => resolve(null), STREAM_TICK_TIMEOUT_MS)
            markWaiters.push((m) => {
              clearTimeout(timer)
              resolve(m)
            })
          })
          if (next !== null && next.isFinite()) {
            return { mark: next.toFixed(), source: 'stream' as const }
          }
          // Stream stalled — fall back to poll for this tick onward.
          streamSource = 'poll'
        }
        const mark = await this.pollMark(state.coin, state.dex)
        if (mark === null) return null
        return { mark: mark.toFixed(), source: 'poll' as const }
      },
      isCancelled: async (cid) => {
        const current = await this.loadState(cid)
        return current !== null && current.status === 'cancelled'
      },
      exit: async (exitState) => this.exitStop(exitState),
      now: this.now
    }

    const result = await this.runMonitor(id, deps)

    if (subscription !== null) {
      await subscription.unsubscribe().catch(() => undefined)
    }
    if (transport !== null) {
      await transport.close().catch(() => undefined)
    }
    return result
  }

  /**
   * The monitor loop (testable): event-driven on streamed marks, paced by the
   * poll fallback. Stop only tightens; on trigger it exits via the reduce-only
   * close; cancel stops the loop without exiting.
   */
  async runMonitor(id: string, deps: TrailingStopMonitorDeps): Promise<TrailingStopMonitorResult> {
    const state = await this.loadState(id)
    if (isNullish(state)) {
      return TrailingStopMonitorResultSchema.parse({
        ok: false,
        id,
        reason: 'unknown trailing stop'
      })
    }
    if (state.status !== 'armed') {
      return TrailingStopMonitorResultSchema.parse({
        ok: false,
        id,
        reason: `not armed (status ${state.status})`
      })
    }

    let peakOrTrough = new BigNumber(state.peakOrTrough)
    let stop = new BigNumber(state.stopPx)

    while (true) {
      if (await deps.isCancelled(id)) {
        await this.updateState(id, { status: 'cancelled' })
        return TrailingStopMonitorResultSchema.parse({
          ok: true,
          id,
          status: 'cancelled',
          exit: null
        })
      }

      const tick = await deps.getMark()
      if (tick === null) {
        // No mark this tick — heartbeat anyway so list sees the loop alive,
        // and keep watching (paced by the poll cadence below).
        await this.updateState(id, { heartbeatAt: deps.now() })
        await this.sleep(POLL_MS)
        continue
      }
      const mark = new BigNumber(tick.mark)
      if (!mark.isFinite() || !mark.isGreaterThan(0)) {
        await this.sleep(POLL_MS)
        continue
      }

      if (state.side === 'long') {
        peakOrTrough = BigNumber.maximum(peakOrTrough, mark)
      } else {
        peakOrTrough = BigNumber.minimum(peakOrTrough, mark)
      }
      stop = computeTrailingStop(state.side, peakOrTrough, state.trail)

      await this.updateState(id, {
        peakOrTrough: peakOrTrough.toFixed(),
        stopPx: stop.toFixed(),
        lastMarkPx: mark.toFixed(),
        source: tick.source,
        heartbeatAt: deps.now()
      })

      const triggered = state.side === 'long' ? mark.lte(stop) : mark.gte(stop)
      if (triggered) {
        await this.updateState(id, {
          status: 'triggered',
          firedAt: deps.now(),
          lastMarkPx: mark.toFixed()
        })
        const exit = await deps.exit({ ...state, status: 'triggered' })
        await this.updateState(id, {
          status: exit.ok ? 'exited' : 'error',
          exitFill: { ok: exit.ok, message: exit.message, orderId: exit.orderId ?? null }
        })
        return TrailingStopMonitorResultSchema.parse({
          ok: true,
          id,
          status: exit.ok ? 'exited' : 'error',
          exit: { ok: exit.ok, message: exit.message }
        })
      }

      // Pace poll-mode ticks at ~POLL_MS; stream mode (source === 'stream') is
      // event-driven and needs no sleep. This is the cadence guard Wren flagged:
      // without it a stalled stream would busy-poll the Info API at HTTP speed.
      if (tick.source !== 'stream') {
        await this.sleep(POLL_MS)
      }
    }
  }

  // ---- exit ----

  /**
   * On trigger: RE-READ the live position and market-close every remaining base
   * unit via the reduce-only path — side opposite, amount = the live position
   * size (never more, never a flip), same --from/--wallet-id as the arm. If the
   * position is already closed, record and stop — never a second exit.
   */
  async exitStop(state: TrailingStopState): Promise<TrailingStopExitResult> {
    const positions = await this.hyperliquid.listPositions({
      address: state.from,
      dex: state.dex === 'main' ? null : state.dex,
      allDexes: false
    })
    const position = positions.positions.find(
      (p) => p.coin.toUpperCase() === state.coin.toUpperCase() && p.dex === state.dex
    )
    if (isNullish(position) || new BigNumber(position.size).isZero()) {
      return { ok: true, message: 'position already closed — no second exit' }
    }
    const exitSide = state.side === 'long' ? 'short' : 'long'
    const amount = new BigNumber(position.size)
    const response = await this.hyperliquid.tradePerp({
      request: {
        from: state.from,
        coin: state.coin,
        amount,
        side: exitSide,
        type: 'market',
        reduceOnly: true,
        marginMode: 'cross',
        tif: 'Gtc',
        dex: state.dex === 'main' ? null : state.dex,
        walletId: state.walletId
      },
      walletId: state.walletId
    })

    const status = response.response?.data?.statuses?.[0]
    let orderId: number | undefined
    if (typeof status === 'object' && status !== null && 'filled' in status) {
      const filled = status.filled
      if (typeof filled === 'object' && filled !== null) orderId = filled.oid
    }

    // Verify the position is gone (or correctly reduced).
    const after = await this.hyperliquid.listPositions({
      address: state.from,
      dex: state.dex === 'main' ? null : state.dex,
      allDexes: false
    })
    const stillOpen = after.positions.find(
      (p) => p.coin.toUpperCase() === state.coin.toUpperCase() && p.dex === state.dex
    )
    if (!isNullish(stillOpen) && new BigNumber(stillOpen.size).isGreaterThan(0)) {
      return {
        ok: false,
        message: `reduce-only close filled (oid ${orderId ?? '?'}) but position still open (${stillOpen.size})`,
        orderId
      }
    }
    return {
      ok: true,
      message: `reduce-only market close filled ${amount.toFixed()} ${state.coin} (oid ${orderId ?? '?'}) — position gone`,
      orderId
    }
  }

  // ---- internals ----

  private async pollMark(coin: string, dex: string): Promise<BigNumber | null> {
    if (this.infoClient === null) return null
    try {
      const metaParams: MetaAndAssetCtxsParameters = {}
      if (dex !== 'main') metaParams.dex = dex
      const [meta, ctxs] = await retryProviderAware({
        fn: async () => {
          if (this.infoClient === null) throw new Error('infoClient unavailable for venue read')
          return await this.infoClient.metaAndAssetCtxs(metaParams)
        }
      })
      const index = meta.universe.findIndex((asset) => {
        const name = asset.name.toLowerCase()
        return (
          name === coin.toLowerCase() ||
          name.replace(/^.*:/, '').toLowerCase() === coin.toLowerCase()
        )
      })
      if (index < 0) return null
      const ctx = ctxs[index]
      if (isNullish(ctx)) return null
      const px = ctx.midPx ?? ctx.markPx
      if (px === null || px === undefined) return null
      const value = new BigNumber(px)
      return value.isFinite() && value.isGreaterThan(0) ? value : null
    } catch {
      return null
    }
  }

  private async fetchMark(coin: string, dex: string): Promise<BigNumber | null> {
    return await this.pollMark(coin, dex)
  }

  private defaultSpawnMonitor(id: string): number | null {
    try {
      const logPath = resolve(this.stateDir, `trailing-stop-${id}.log`)
      const logFd = openSync(logPath, 'a')
      const binary = process.argv[0] ?? process.execPath
      const args = [...resolveMonitorSpawnArgs(process.argv), id]
      const child = spawn(binary, args, {
        detached: true,
        stdio: ['ignore', logFd, logFd],
        env: process.env
      })
      child.unref()
      return child.pid ?? null
    } catch {
      return null
    }
  }
}
