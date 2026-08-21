import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import BigNumber from 'bignumber.js'

import { resolveTradesStateDir } from '@/common/Env'
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

const MANIFEST_FILENAME = 'operative-package.json'
const OVERRIDES_FILENAME = 'sizing-lock-overrides.json'
const JOURNAL_FILENAME = 'sizing-lock-journal.jsonl'
const DEFAULT_SIZE_TOLERANCE = 0.02 // ±2% absorbs tick rounding on szDecimals
const DEFAULT_OVERRIDE_TTL_MS = 15 * 60 * 1000

// Authority for the journaled re-size override (same class as the entry-gate
// override): exec-lead (Desi) or chief only, default-refuse.
const DEFAULT_OVERRIDE_ACTORS = ['exec-lead', 'chief']

// The arm-collision guard permits a re-arm for a LIVE/IN-FLIGHT coin ONLY when
// an override actor (chief/exec-lead) explicitly journals the deliberate close.
const ARM_COLLISION_OVERRIDE_ACTORS = ['chief', 'exec-lead']

import type { HexString } from '@/types/Lang'

export type SizingLockArmCollisionCheck = (params: {
  address: HexString
  dex: string
  coin: string
}) => Promise<{
  livePosition: boolean
  inFlightFill: boolean
  /** An activated TWAP ladder is running for this coin (the TWAP-in-flight class). */
  twapInFlight?: boolean
  /** Open TWAP legs (the over-cap ladder class); default 0 when the check is silent. */
  openTwapLegs?: number
  note?: string | null
}>

export interface SizingLockServiceParams {
  readonly stateDir?: string
  readonly overrideActors?: readonly string[]
  readonly tolerance?: number
  /**
   * At-arm live-venue collision check (the COIN ghost-flatten class): a
   * manifest re-arm must not flatten a coin with a live position / in-flight
   * fill / resting entry. Injected by the CLI wiring (reads the venue). When
   * absent, arm() is non-guarded (pure manifest write) for callers with no
   * venue access.
   */
  readonly armCollisionCheck?: SizingLockArmCollisionCheck
  /**
   * TWAP/slot cap-count guard (the CXMT over-cap class): arming is refused
   * when an activated TWAP is in-flight for a coin, or when the open TWAP
   * legs would exceed the slot cap (default 4, the Play-v2 book cap). An
   * authority override (chief/exec-lead) still force-arms, journaled.
   */
  readonly slotCap?: number
}

// One persisted sizing override: an authority-gated grant that is TTL-windowed
// and consumed by the order path (mirroring the entry-gate override registry).
export interface SizingLockOverrideRecord {
  readonly key: string
  readonly until: number
  readonly actor: string
  readonly reason: string
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

  private readonly armCollisionCheck: SizingLockArmCollisionCheck | undefined

  private readonly manifestPath: string

  private readonly journalPath: string

  private readonly overrideActors: readonly string[]

  private readonly tolerance: number

  private readonly slotCap: number

  private manifest: HyperliquidPackageManifest

  private overrides: Map<string, SizingLockOverrideRecord>

  constructor(params: SizingLockServiceParams = {}) {
    this.stateDir = params.stateDir ?? resolveTradesStateDir()
    this.armCollisionCheck = params.armCollisionCheck
    this.manifestPath = resolve(this.stateDir, MANIFEST_FILENAME)
    this.overridesPath = resolve(this.stateDir, OVERRIDES_FILENAME)
    this.journalPath = resolve(this.stateDir, JOURNAL_FILENAME)
    this.overrideActors = params.overrideActors ?? DEFAULT_OVERRIDE_ACTORS
    this.tolerance = params.tolerance ?? DEFAULT_SIZE_TOLERANCE
    this.slotCap = params.slotCap ?? 4
    this.manifest = HyperliquidPackageManifestSchema.parse({ records: [] })
    this.overrides = new Map()
  }

  private readonly overridesPath: string

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

  private async persistOverrides(): Promise<void> {
    await mkdir(this.stateDir, { recursive: true })
    await writeFile(
      this.overridesPath,
      ensureJsonTreeString({ overrides: [...this.overrides.values()] }),
      {
        encoding: 'utf8',
        mode: 0o600
      }
    )
  }

  /** Load the durable override registry so a fresh process (one per CLI command)
   * sees an authority-gated grant written by another process. */
  private async loadOverrides(): Promise<void> {
    let text: string
    try {
      text = await readFile(this.overridesPath, 'utf8')
    } catch (error) {
      if (isFileNotFoundError(error)) {
        this.overrides = new Map()
        return
      }
      throw new Error(
        `Unable to read sizing-lock override registry at ${this.overridesPath}: ` +
          `${error instanceof Error ? error.message : String(error)}`
      )
    }
    const parsed: { overrides: SizingLockOverrideRecord[] } = JSON.parse(text)
    this.overrides = new Map(parsed.overrides.map((o) => [o.key, o]))
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
   *
   * ARM-COLLISION GUARD (the COIN ghost-flatten class): every coin in the new
   * package is checked against the live venue before the manifest is written.
   * A coin with a LIVE position, an IN-FLIGHT fill, or a RESTING entry is
   * REFUSED unless an authority actor (chief/exec-lead) forces the re-arm via
   * `overrideActor` — the deliberate-close path, journaled. This prevents the
   * arming process itself from flattening a live position (COIN open 180.09 +
   * close 180.07 ghost was a $95->$60 re-arm landing on an in-flight $95 fire).
   */
  async arm(params: {
    packageId: string
    version: string
    perCoin: HyperliquidSizingEntry[]
    /** Account to venue-check for arm collisions (live position / in-flight). */
    address?: HexString
    /** Authority override for the collision guard (chief | exec-lead only). */
    overrideActor?: string
    overrideReason?: string
  }): Promise<HyperliquidSizingLockArmResult> {
    await this.load()
    if (!isNullish(this.armCollisionCheck) && !isNullish(params.address)) {
      // TWAP/SLOT CAP-COUNT (the CXMT over-cap class): count the open TWAP
      // legs across every coin this package arms against the slot cap. A TWAP
      // ladder that would exceed the cap is refused-or-split before arming.
      let totalOpenTwapLegs = 0
      let totalLivePositions = 0
      for (const entry of params.perCoin) {
        const dex = normalizeDexName(entry.dex)
        const coin = normalizeCoinName(entry.coin)
        const collision = await this.armCollisionCheck({
          address: params.address,
          dex,
          coin
        })
        totalOpenTwapLegs += collision.openTwapLegs ?? 0
        if (collision.livePosition) totalLivePositions += 1
        const twapInFlight = collision.twapInFlight ?? false
        const blocked = collision.livePosition || collision.inFlightFill || twapInFlight
        if (blocked) {
          const actor = params.overrideActor?.trim()
          const forced = !isNullish(actor) && ARM_COLLISION_OVERRIDE_ACTORS.includes(actor)
          if (!forced) {
            const parts: string[] = []
            if (collision.livePosition) parts.push('a LIVE position')
            if (collision.inFlightFill) parts.push('an IN-FLIGHT fill')
            if (twapInFlight) parts.push('an IN-FLIGHT TWAP')
            throw new Error(
              `sizing-lock arm refused for ${coin} on ${dex}: ` +
                `arm-collision guard — the coin has ${parts.join(' and ')}` +
                `; a re-arm would flatten it (COIN ghost / TWAP-in-flight class). ` +
                `Deliberate close: re-run arm with --override-actor chief/exec-lead + ` +
                `--override-reason to force the re-arm (journaled).`
            )
          }
          const ts = Date.now()
          const journalEntry = {
            ts,
            actor,
            kind: twapInFlight ? 'twap-in-flight-override' : 'arm-collision-override',
            dex,
            coin,
            version: params.version,
            reason: (params.overrideReason ?? 'deliberate close + re-arm').trim()
          }
          await mkdir(this.stateDir, { recursive: true })
          await appendFile(this.journalPath, `${ensureJsonTreeString(journalEntry)}\n`, {
            encoding: 'utf8',
            mode: 0o600
          })
        }
      }
      // Slot-cap check across the full package: open TWAP legs (net of this
      // arm's coins being replaced in-place) must not exceed the slot cap.
      // The over-cap ladder (e.g. CXMT 15-leg/111.2 > 4-slot cap) is refused.
      if (totalLivePositions >= this.slotCap) {
        const actor = params.overrideActor?.trim()
        const forced = !isNullish(actor) && ARM_COLLISION_OVERRIDE_ACTORS.includes(actor)
        if (!forced) {
          throw new Error(
            `sizing-lock arm refused: slot-cap guard — ${totalLivePositions} live ` +
              `position(s) already meet the ${this.slotCap}-slot cap; this arm would ` +
              `overload the book (CXMT over-cap class). Re-run with ` +
              `--override-actor chief/exec-lead + --override-reason to force (journaled).`
          )
        }
        const ts = Date.now()
        await mkdir(this.stateDir, { recursive: true })
        await appendFile(
          this.journalPath,
          `${ensureJsonTreeString({
            ts,
            actor,
            kind: 'slot-cap-override',
            livePositions: totalLivePositions,
            slotCap: this.slotCap,
            version: params.version,
            reason: (params.overrideReason ?? 'over-cap force-arm').trim()
          })}\n`,
          { encoding: 'utf8', mode: 0o600 }
        )
      } else if (totalOpenTwapLegs > this.slotCap) {
        const actor = params.overrideActor?.trim()
        const forced = !isNullish(actor) && ARM_COLLISION_OVERRIDE_ACTORS.includes(actor)
        if (!forced) {
          throw new Error(
            `sizing-lock arm refused: slot-cap guard — ${totalOpenTwapLegs} open TWAP ` +
              `leg(s) exceed the ${this.slotCap}-slot cap; a TWAP ladder here ` +
              `would overload the book (CXMT 15-leg over-cap class). Re-run with ` +
              `--override-actor chief/exec-lead + --override-reason to force (journaled), ` +
              `or split the ladder to fit the cap.`
          )
        }
        const ts = Date.now()
        await mkdir(this.stateDir, { recursive: true })
        await appendFile(
          this.journalPath,
          `${ensureJsonTreeString({
            ts,
            actor,
            kind: 'slot-cap-override',
            openTwapLegs: totalOpenTwapLegs,
            slotCap: this.slotCap,
            version: params.version,
            reason: (params.overrideReason ?? 'over-cap force-arm').trim()
          })}\n`,
          { encoding: 'utf8', mode: 0o600 }
        )
      }
    }
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

    // ARM()-JOURNALING: every arm call appends an audit line (actor, ts,
    // package, old->new margin per coin) — closes the missing-log gap behind
    // the v13->v14 rewrite that hid the COIN flatten trigger.
    const nowIso = new Date().toISOString()
    const freshlySuperseded = keptRecords.filter(
      (r) => !isNullish(r.supersededAt) && r.supersededAt === now
    )
    const activeMap = new Map(
      freshlySuperseded.flatMap((r) => r.perCoin).map((p) => [entryKey(p), p])
    )
    const delta = params.perCoin.map((p) => {
      const key = entryKey(p)
      const old = activeMap.get(key)
      return {
        dex: normalizeDexName(p.dex),
        coin: normalizeCoinName(p.coin),
        oldMarginUsd: old?.marginUsd ?? null,
        newMarginUsd: p.marginUsd
      }
    })
    const armJournal = {
      ts: now,
      at: nowIso,
      actor: params.overrideActor?.trim() ?? 'chief',
      kind: 'arm',
      packageId: params.packageId,
      version: params.version,
      superseded: supersededVersions,
      delta
    }
    await mkdir(this.stateDir, { recursive: true })
    await appendFile(this.journalPath, `${ensureJsonTreeString(armJournal)}\n`, {
      encoding: 'utf8',
      mode: 0o600
    })

    return HyperliquidSizingLockArmResultSchema.parse({
      armed: true,
      packageId: params.packageId,
      version: params.version,
      superseded: supersededVersions.length > 0 ? supersededVersions : null,
      manifestPath: this.manifestPath
    })
  }

  /**
   * Active user-directive override for a coin (the escape hatch: a chief /
   * exec-lead journaled re-arm/close directive while a live position exists).
   * The order-path flatten guard consults this — an armed live position is not
   * flattened without it.
   */
  async hasActiveFlattenDirective(dex: string | null | undefined, coin: string): Promise<boolean> {
    await this.loadOverrides()
    const key = `${normalizeDexName(dex)}:${normalizeCoinName(coin)}`
    const override = this.overrides.get(key)
    return !isNullish(override) && override.until > Date.now()
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
    await this.loadOverrides()
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
    // Load the persisted override registry + manifest first so persistOverrides()
    // below writes the union — a prior grant (e.g. MRNA) must survive this grant.
    await this.loadOverrides()
    await this.load()
    const ttlMs = params.ttlMs ?? DEFAULT_OVERRIDE_TTL_MS
    const grantedAt = Date.now()
    const key = `${dex}:${coin}`
    this.overrides.set(key, {
      key,
      until: grantedAt + ttlMs,
      actor,
      reason: params.reason.trim()
    })
    await this.persistOverrides()

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
      stateDir: this.stateDir,
      statePath: this.overridesPath,
      journalPath: this.journalPath
    })
  }
}
