import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import BigNumber from 'bignumber.js'

import {
  type HyperliquidPackageManifest,
  type HyperliquidPackageManifestRecord,
  HyperliquidPackageManifestRecordSchema,
  HyperliquidPackageManifestSchema,
  type HyperliquidSizingEntry,
  type HyperliquidSizingLockArmResult,
  HyperliquidSizingLockArmResultSchema,
  type HyperliquidSizingLockDecision,
  HyperliquidSizingLockDecisionSchema,
  type HyperliquidSizingLockOverrideResult,
  HyperliquidSizingLockOverrideResultSchema
} from '@/types/Hyperliquid'
import { ensureJsonTreeString, isNullish } from '@/utils/Lang'

const DEFAULT_STATE_DIR = resolve(process.cwd(), '.tribes')
const MANIFEST_FILENAME = 'operative-package.json'
const JOURNAL_FILENAME = 'sizing-lock-journal.jsonl'
const DEFAULT_SIZE_TOLERANCE = 0.02 // ±2% absorbs tick rounding on szDecimals
const DEFAULT_OVERRIDE_TTL_MS = 15 * 60 * 1000

// Authority for the journaled re-size override (same class as the entry-gate
// override): exec-lead (Desi) or chief only, default-refuse.
const DEFAULT_OVERRIDE_ACTORS = ['exec-lead', 'chief']

export interface SizingLockServiceParams {
  readonly stateDir?: string
  readonly overrideActors?: readonly string[]
  readonly tolerance?: number
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

function entryKey(entry: HyperliquidSizingEntry): string {
  return `${normalizeDexName(entry.dex)}:${normalizeCoinName(entry.coin)}`
}

/**
 * Sizing-lock: the operative-package manifest + entry-size validation.
 *
 * The earlier breach class (BTC 0.02166 @ 69,178 ran on pre-correction v2
 * sizing while v3 was operative) happened because sizing was agent-side math
 * with no machine-readable operative version. This makes the operative package
 * a versioned JSON manifest the order path reads: for a position-INCREASING
 * order, notional = amount × referencePrice must match the operative package's
 * locked notional within ±2%, and the manifest must not be superseded. Missing
 * manifest / missing coin entry / off-lock / superseded → refuse BEFORE any
 * sign or broadcast. Reduce-only exits and cancels are never blocked.
 */
export class SizingLockService {
  private readonly stateDir: string

  private readonly manifestPath: string

  private readonly journalPath: string

  private readonly overrideActors: readonly string[]

  private readonly tolerance: number

  private manifest: HyperliquidPackageManifest

  private overrides: Map<string, { until: number; actor: string; reason: string }>

  constructor(params: SizingLockServiceParams = {}) {
    this.stateDir = params.stateDir ?? DEFAULT_STATE_DIR
    this.manifestPath = resolve(this.stateDir, MANIFEST_FILENAME)
    this.journalPath = resolve(this.stateDir, JOURNAL_FILENAME)
    this.overrideActors = params.overrideActors ?? DEFAULT_OVERRIDE_ACTORS
    this.tolerance = params.tolerance ?? DEFAULT_SIZE_TOLERANCE
    this.manifest = HyperliquidPackageManifestSchema.parse({ records: [] })
    this.overrides = new Map()
  }

  private async persistManifest(): Promise<void> {
    await mkdir(this.stateDir, { recursive: true })
    await writeFile(this.manifestPath, ensureJsonTreeString(this.manifest), {
      encoding: 'utf8',
      mode: 0o600
    })
  }

  /** Load the durable manifest. A missing file = no operative package (refuse). */
  async load(): Promise<void> {
    let text: string
    try {
      text = await readFile(this.manifestPath, 'utf8')
    } catch (error) {
      if (isFileNotFoundError(error)) {
        this.manifest = HyperliquidPackageManifestSchema.parse({ records: [] })
        return
      }
      throw new Error(
        `Unable to read operative-package manifest at ${this.manifestPath}: ` +
          `${error instanceof Error ? error.message : String(error)}`
      )
    }
    this.manifest = HyperliquidPackageManifestSchema.parse(JSON.parse(text))
  }

  private operative(): HyperliquidPackageManifestRecord | null {
    const now = Date.now()
    for (const record of this.manifest.records) {
      if (isNullish(record.supersededAt) || record.supersededAt > now) return record
    }
    return null
  }

  async getOperative(): Promise<HyperliquidPackageManifestRecord | null> {
    return this.operative()
  }

  /**
   * Desk arms (or supersedes) a package: the new version becomes operative and
   * every older record is marked superseded at now.
   */
  async arm(params: {
    packageId: string
    version: string
    perCoin: HyperliquidSizingEntry[]
  }): Promise<HyperliquidSizingLockArmResult> {
    await this.load()
    const now = Date.now()
    const supersededVersions: string[] = []
    const keptRecords: HyperliquidPackageManifestRecord[] = []
    for (const record of this.manifest.records) {
      if (isNullish(record.supersededAt) || record.supersededAt > now) {
        const superseded = HyperliquidPackageManifestRecordSchema.parse({
          ...record,
          supersededAt: now
        })
        keptRecords.push(superseded)
        supersededVersions.push(record.version)
      } else {
        keptRecords.push(record)
      }
    }
    const newRecord = HyperliquidPackageManifestRecordSchema.parse({
      packageId: params.packageId,
      version: params.version,
      supersededAt: null,
      perCoin: params.perCoin
    })
    this.manifest = HyperliquidPackageManifestSchema.parse({
      records: [...keptRecords, newRecord]
    })
    await this.persistManifest()
    return HyperliquidSizingLockArmResultSchema.parse({
      armed: true,
      packageId: params.packageId,
      version: params.version,
      superseded: supersededVersions.length > 0 ? supersededVersions : null,
      manifestPath: this.manifestPath
    })
  }

  /**
   * The crux: is the intended entry size locked to the operative package?
   * Re-loads the manifest on every check so a fresh process (one per CLI
   * command) sees what the desk armed.
   */
  async isEntrySizeAllowed(params: {
    dex: string | null | undefined
    coin: string
    amount: BigNumber
    referencePrice: BigNumber
  }): Promise<HyperliquidSizingLockDecision> {
    await this.load()
    const dex = normalizeDexName(params.dex)
    const coin = normalizeCoinName(params.coin)

    const override = this.overrides.get(`${dex}:${coin}`)
    if (!isNullish(override) && override.until > Date.now()) {
      return HyperliquidSizingLockDecisionSchema.parse({
        allowed: true,
        reason: `sizing override by ${override.actor}: ${override.reason} (until ${override.until})`,
        operative: this.operative(),
        entry: null,
        actualNotionalUsd: null,
        lockedNotionalUsd: null
      })
    }

    const operative = this.operative()
    if (isNullish(operative)) {
      return HyperliquidSizingLockDecisionSchema.parse({
        allowed: false,
        reason: 'no operative package manifest — entry size not locked',
        operative: null,
        entry: null,
        actualNotionalUsd: null,
        lockedNotionalUsd: null
      })
    }

    const entry = operative.perCoin.find((e) => entryKey(e) === `${dex}:${coin}`)
    if (isNullish(entry)) {
      return HyperliquidSizingLockDecisionSchema.parse({
        allowed: false,
        reason: `no sizing entry for ${coin} on ${dex} in operative package ${operative.packageId} ${operative.version}`,
        operative,
        entry: null,
        actualNotionalUsd: null,
        lockedNotionalUsd: null
      })
    }

    const actualNotionalUsd = params.amount.multipliedBy(params.referencePrice).toNumber()
    const lockedNotionalUsd = entry.notionalUsd
    const deviation = Math.abs(actualNotionalUsd - lockedNotionalUsd) / lockedNotionalUsd
    if (deviation > this.tolerance) {
      return HyperliquidSizingLockDecisionSchema.parse({
        allowed: false,
        reason:
          `entry size off-lock: notional $${actualNotionalUsd.toFixed(2)} deviates ${(deviation * 100).toFixed(2)}% ` +
          `from operative package ${operative.packageId} ${operative.version} locked notional ` +
          `$${lockedNotionalUsd.toFixed(2)} (tolerance ${(this.tolerance * 100).toFixed(0)}%)`,
        operative,
        entry,
        actualNotionalUsd,
        lockedNotionalUsd
      })
    }

    return HyperliquidSizingLockDecisionSchema.parse({
      allowed: true,
      reason: `entry size locked to operative package ${operative.packageId} ${operative.version} (notional $${actualNotionalUsd.toFixed(2)})`,
      operative,
      entry,
      actualNotionalUsd,
      lockedNotionalUsd
    })
  }

  /**
   * Authority-gated journaled re-size override: lets a deliberate off-lock size
   * through for a bounded TTL (Desi/Chief only, default-refuse, journaled).
   */
  async override(params: {
    dex: string | null | undefined
    coin: string
    actor: string
    reason: string
    ttlMs?: number
  }): Promise<HyperliquidSizingLockOverrideResult> {
    const actor = params.actor.trim()
    if (!this.overrideActors.includes(actor)) {
      throw new Error(
        `sizing-lock override refused: actor '${actor}' is not in the override authority ` +
          `(allowed: ${this.overrideActors.join(', ')}). Default is refuse.`
      )
    }
    const dex = normalizeDexName(params.dex)
    const coin = normalizeCoinName(params.coin)
    const ttlMs = params.ttlMs ?? DEFAULT_OVERRIDE_TTL_MS
    const grantedAt = Date.now()
    this.overrides.set(`${dex}:${coin}`, {
      until: grantedAt + ttlMs,
      actor,
      reason: params.reason.trim()
    })

    const journalEntry = {
      ts: grantedAt,
      actor,
      dex,
      coin,
      reason: params.reason.trim(),
      ttlMs
    }
    await mkdir(this.stateDir, { recursive: true })
    await appendFile(this.journalPath, `${ensureJsonTreeString(journalEntry)}\n`, {
      encoding: 'utf8',
      mode: 0o600
    })

    return HyperliquidSizingLockOverrideResultSchema.parse({
      granted: true,
      dex,
      coin,
      actor,
      reason: params.reason.trim(),
      ttlMs,
      grantedAt,
      journalPath: this.journalPath
    })
  }
}
