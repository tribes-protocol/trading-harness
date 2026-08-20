import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import {
  type HyperliquidEntryGateDecision,
  HyperliquidEntryGateDecisionSchema,
  type HyperliquidEntryGateOverrideResult,
  HyperliquidEntryGateOverrideResultSchema,
  type HyperliquidEntryGateState,
  HyperliquidEntryGateStateSchema,
  type HyperliquidEntryGateStatesResult,
  HyperliquidEntryGateStatesResultSchema,
  HyperliquidEntryGateStatusSchema
} from '@/types/Hyperliquid'
import { ensureJsonTreeString, isNullish } from '@/utils/Lang'

const DEFAULT_STATE_DIR = resolve(process.cwd(), '.tribes')
const GATE_STATE_FILENAME = 'entry-gate.json'
const GATE_JOURNAL_FILENAME = 'entry-gate-journal.jsonl'
const DEFAULT_GATE_TTL_MS = 15 * 60 * 1000

// Authority for the journaled override. The desk override is scoped to
// exec-lead (Desi) or chief; anyone else is refused by default.
const DEFAULT_OVERRIDE_ACTORS = ['exec-lead', 'chief']

export interface EntryGateServiceParams {
  readonly stateDir?: string
  readonly overrideActors?: readonly string[]
}

function isFileNotFoundError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

function normalizeDexName(dex: string | null | undefined): string {
  const trimmed = dex?.trim() ?? ''
  return trimmed.length === 0 || trimmed === 'main' ? 'main' : trimmed
}

function normalizeCoinName(coin: string): string {
  return coin.trim().toUpperCase()
}

/**
 * Durable per-coin entry-trigger gate.
 *
 * The gate exists so a NO-trigger entry can never reach the venue: every
 * position-INCREASING perp order consults the state registry (via
 * HyperliquidService) and is REFUSED before sign/broadcast unless the coin's
 * gate is `trigger_fired` within its TTL. The trigger-watch (once Rhea's
 * `hyperliquid candles` lands) writes `trigger_fired` via `fireTrigger`; until
 * then the enforcement ships refusal-first (default `stand_by` = refuse).
 *
 * State is a durable JSON snapshot in the sandbox state dir so it survives the
 * watch loop and the execution path reads the same registry. The override is
 * authority-gated and journaled, TTL-limited, default-refuse.
 */
export class EntryGateService {
  private readonly stateDir: string

  private readonly statePath: string

  private readonly journalPath: string

  private readonly overrideActors: readonly string[]

  private states: Map<string, HyperliquidEntryGateState>

  constructor(params: EntryGateServiceParams = {}) {
    this.stateDir = params.stateDir ?? DEFAULT_STATE_DIR
    this.statePath = resolve(this.stateDir, GATE_STATE_FILENAME)
    this.journalPath = resolve(this.stateDir, GATE_JOURNAL_FILENAME)
    this.overrideActors = params.overrideActors ?? DEFAULT_OVERRIDE_ACTORS
    this.states = new Map()
  }

  private key(dex: string, coin: string): string {
    return `${normalizeDexName(dex)}:${normalizeCoinName(coin)}`
  }

  private blankState(dex: string, coin: string): HyperliquidEntryGateState {
    return HyperliquidEntryGateStateSchema.parse({
      dex: normalizeDexName(dex),
      coin: normalizeCoinName(coin),
      status: HyperliquidEntryGateStatusSchema.parse('stand_by'),
      firedAt: null,
      ttlMs: null,
      updatedAt: Date.now()
    })
  }

  private async persist(): Promise<void> {
    await mkdir(this.stateDir, { recursive: true })
    await writeFile(this.statePath, ensureJsonTreeString(this.allStates()), {
      encoding: 'utf8',
      mode: 0o600
    })
  }

  private allStates(): HyperliquidEntryGateStatesResult {
    return HyperliquidEntryGateStatesResultSchema.parse({
      states: [...this.states.values()]
    })
  }

  /** Load the durable snapshot. A missing file is the fresh registry (stand_by). */
  async load(): Promise<void> {
    let text: string
    try {
      text = await readFile(this.statePath, 'utf8')
    } catch (error) {
      if (isFileNotFoundError(error)) return
      throw new Error(
        `Unable to read entry gate state at ${this.statePath}: ` +
          `${error instanceof Error ? error.message : String(error)}`
      )
    }
    const parsed = HyperliquidEntryGateStatesResultSchema.parse(JSON.parse(text))
    this.states = new Map(parsed.states.map((state) => [this.key(state.dex, state.coin), state]))
  }

  async getStates(): Promise<HyperliquidEntryGateStatesResult> {
    return this.allStates()
  }

  async getState(dex: string | null | undefined, coin: string): Promise<HyperliquidEntryGateState> {
    const existing = this.states.get(this.key(dex ?? '', coin))
    return existing ?? this.blankState(dex ?? '', coin)
  }

  async arm(dex: string | null | undefined, coin: string): Promise<HyperliquidEntryGateState> {
    const state = this.blankState(dex ?? '', coin)
    state.status = 'armed_awaiting'
    state.updatedAt = Date.now()
    this.states.set(this.key(state.dex, state.coin), state)
    await this.persist()
    return state
  }

  async standBy(dex: string | null | undefined, coin: string): Promise<HyperliquidEntryGateState> {
    const state = this.blankState(dex ?? '', coin)
    this.states.set(this.key(state.dex, state.coin), state)
    await this.persist()
    return state
  }

  /**
   * The trigger-watch calls this when the confluence stack fires: flips the
   * coin gate to trigger_fired with a bounded TTL. Within the TTL, entries are
   * allowed; once the TTL passes the gate returns to refusal.
   */
  async fireTrigger(
    dex: string | null | undefined,
    coin: string,
    ttlMs: number = DEFAULT_GATE_TTL_MS
  ): Promise<HyperliquidEntryGateState> {
    const state = this.blankState(dex ?? '', coin)
    state.status = 'trigger_fired'
    state.firedAt = Date.now()
    state.ttlMs = ttlMs
    state.updatedAt = Date.now()
    this.states.set(this.key(state.dex, state.coin), state)
    await this.persist()
    return state
  }

  /**
   * The crux: is a position-INCREASING order allowed for this coin right now?
   * Only trigger_fired within TTL passes. Missing state = stand_by = refuse.
   */
  async isEntryAllowed(
    dex: string | null | undefined,
    coin: string
  ): Promise<HyperliquidEntryGateDecision> {
    // Re-read the durable registry on every check so a fresh process sees the
    // state the trigger-watch or override wrote (the CLI runs one process per
    // command).
    await this.load()
    const state = await this.getState(dex, coin)
    const now = Date.now()
    const withinTtl =
      state.status === 'trigger_fired' &&
      !isNullish(state.firedAt) &&
      !isNullish(state.ttlMs) &&
      now - state.firedAt <= state.ttlMs
    if (withinTtl) {
      return HyperliquidEntryGateDecisionSchema.parse({
        allowed: true,
        state,
        reason: `trigger_fired within TTL (fired ${state.firedAt}, ttl ${state.ttlMs}ms)`
      })
    }
    const reason =
      state.status === 'stand_by'
        ? 'no entry trigger fired (gate stand_by)'
        : state.status === 'armed_awaiting'
          ? 'armed awaiting trigger — no trigger fired yet'
          : `trigger_fired but TTL expired (fired ${state.firedAt ?? 'never'})`
    return HyperliquidEntryGateDecisionSchema.parse({
      allowed: false,
      state,
      reason
    })
  }

  /**
   * Authority-gated journaled override: flips the gate to trigger_fired for a
   * bounded TTL so a legit night when the trigger genuinely fired but the watch
   * wobbled does not deadlock the desk. Default-refuse: an actor outside the
   * allowlist is refused and NOT journaled.
   */
  async override(params: {
    dex: string | null | undefined
    coin: string
    actor: string
    reason: string
    ttlMs?: number
  }): Promise<HyperliquidEntryGateOverrideResult> {
    const actor = params.actor.trim()
    if (!this.overrideActors.includes(actor)) {
      throw new Error(
        `entry-gate override refused: actor '${actor}' is not in the override authority ` +
          `(allowed: ${this.overrideActors.join(', ')}). Default is refuse.`
      )
    }

    const state = this.blankState(params.dex ?? '', params.coin)
    state.status = 'trigger_fired'
    state.firedAt = Date.now()
    state.ttlMs = params.ttlMs ?? DEFAULT_GATE_TTL_MS
    state.updatedAt = Date.now()
    this.states.set(this.key(state.dex, state.coin), state)
    await this.persist()

    const journalEntry = {
      ts: state.firedAt,
      actor,
      dex: state.dex,
      coin: state.coin,
      reason: params.reason.trim(),
      ttlMs: state.ttlMs
    }
    await mkdir(this.stateDir, { recursive: true })
    await appendFile(this.journalPath, `${ensureJsonTreeString(journalEntry)}\n`, {
      encoding: 'utf8',
      mode: 0o600
    })

    return HyperliquidEntryGateOverrideResultSchema.parse({
      granted: true,
      dex: state.dex,
      coin: state.coin,
      actor,
      reason: params.reason.trim(),
      ttlMs: state.ttlMs,
      firedAt: state.firedAt,
      journalPath: this.journalPath
    })
  }
}
