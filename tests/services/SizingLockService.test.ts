import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import BigNumber from 'bignumber.js'
import { describe, expect, test, vi } from 'vitest'

import { SizingLockService } from '@/services/SizingLockService'

async function freshService(overrideActors?: readonly string[]): Promise<{
  service: SizingLockService
  stateDir: string
}> {
  const stateDir = await mkdtemp(join(tmpdir(), 'sizing-lock-'))
  const service = new SizingLockService({ stateDir, overrideActors })
  await service.load()
  return { service, stateDir }
}

// The v2 manifest the desk ran the BTC long under (pre-correction sizing).
const V2_BTC_ENTRY = {
  coin: 'BTC',
  dex: 'main',
  notionalUsd: 1498.7,
  marginUsd: 99.88,
  leverage: 15,
  szDecimals: 5
}

// The corrected v3 sizing (operative after supersession).
const V3_BTC_ENTRY = {
  coin: 'BTC',
  dex: 'main',
  notionalUsd: 3182.7,
  marginUsd: 212.18,
  leverage: 20,
  szDecimals: 5
}

const BTC_REFERENCE_PRICE = new BigNumber(69178.0)

describe('SizingLockService — no operative manifest = refuse', () => {
  test('refuses any entry when no manifest exists (refusal-first)', async () => {
    const { service } = await freshService()
    const decision = await service.isEntrySizeAllowed({
      dex: 'main',
      coin: 'BTC',
      amount: new BigNumber(0.02166),
      referencePrice: BTC_REFERENCE_PRICE
    })
    expect(decision.allowed).toBe(false)
    expect(decision.reason).toContain('no operative package manifest')
  })
})

describe('SizingLockService — operative-version lock across a supersession', () => {
  test('v2 entry (locked notional) is allowed while v2 is operative', async () => {
    const { service } = await freshService()
    await service.arm({ packageId: 'A-212', version: 'v2', perCoin: [V2_BTC_ENTRY] })
    const decision = await service.isEntrySizeAllowed({
      dex: 'main',
      coin: 'BTC',
      amount: new BigNumber(0.02166), // 0.02166 × 69,178 ≈ $1,498.7 — v2 locked
      referencePrice: BTC_REFERENCE_PRICE
    })
    expect(decision.allowed).toBe(true)
    expect(decision.reason).toContain('v2')
  })

  test('stale-size entry REFUSED pre-broadcast: off-lock notional beyond ±2%', async () => {
    const { service } = await freshService()
    await service.arm({ packageId: 'A-212', version: 'v2', perCoin: [V2_BTC_ENTRY] })
    // A wrong size (e.g. 3× the locked notional) must refuse.
    const decision = await service.isEntrySizeAllowed({
      dex: 'main',
      coin: 'BTC',
      amount: new BigNumber(0.06),
      referencePrice: BTC_REFERENCE_PRICE
    })
    expect(decision.allowed).toBe(false)
    expect(decision.reason).toContain('off-lock')
  })

  test('supersession: v3 operative → v3 size allowed, v2 size refused', async () => {
    const { service } = await freshService()
    // Desk arms v2, then v3 supersedes it.
    await service.arm({ packageId: 'A-212', version: 'v2', perCoin: [V2_BTC_ENTRY] })
    const armed = await service.arm({
      packageId: 'A-212',
      version: 'v3',
      perCoin: [V3_BTC_ENTRY]
    })
    expect(armed.superseded).toEqual(['v2'])

    const operative = await service.getOperative()
    expect(operative?.version).toBe('v3')

    // The v3 locked size passes.
    const v3Size = new BigNumber(0.046) // 0.046 × 69,178 ≈ $3,182.2 — within ±2% of 3182.70
    const v3Decision = await service.isEntrySizeAllowed({
      dex: 'main',
      coin: 'BTC',
      amount: v3Size,
      referencePrice: BTC_REFERENCE_PRICE
    })
    expect(v3Decision.allowed).toBe(true)
    expect(v3Decision.reason).toContain('v3')

    // The stale v2 size (the actual breach: 0.02166 @ 69,178) must now REFUSE —
    // it is off-lock against the operative v3 manifest.
    const staleV2Size = new BigNumber(0.02166)
    const staleDecision = await service.isEntrySizeAllowed({
      dex: 'main',
      coin: 'BTC',
      amount: staleV2Size,
      referencePrice: BTC_REFERENCE_PRICE
    })
    expect(staleDecision.allowed).toBe(false)
    expect(staleDecision.reason).toContain('off-lock')
  })

  test('a coin with no entry in the operative manifest is refused', async () => {
    const { service } = await freshService()
    await service.arm({ packageId: 'A-212', version: 'v3', perCoin: [V3_BTC_ENTRY] })
    const decision = await service.isEntrySizeAllowed({
      dex: 'main',
      coin: 'ETH',
      amount: new BigNumber(1),
      referencePrice: new BigNumber(3000)
    })
    expect(decision.allowed).toBe(false)
    expect(decision.reason).toContain('no sizing entry')
  })
})

describe('SizingLockService — authority-gated journaled override', () => {
  test('refuses an actor outside the allowlist by default', async () => {
    const { service } = await freshService(['exec-lead', 'chief'])
    await expect(
      service.override({ dex: 'main', coin: 'BTC', actor: 'runa', reason: 'not authorized' })
    ).rejects.toThrow('refused')
  })

  test('grants an authorized actor, journals it, and lets the off-lock size through within TTL', async () => {
    const { service, stateDir } = await freshService(['exec-lead', 'chief'])
    await service.arm({ packageId: 'A-212', version: 'v3', perCoin: [V3_BTC_ENTRY] })

    const result = await service.override({
      dex: 'main',
      coin: 'BTC',
      actor: 'exec-lead',
      reason: 'deliberate re-size for the night',
      ttlMs: 60_000
    })
    expect(result.granted).toBe(true)

    const journal = await readFile(join(stateDir, 'sizing-lock-journal.jsonl'), 'utf8')
    expect(journal).toContain('exec-lead')
    expect(journal).toContain('re-size')

    // Off-lock size now allowed under the override.
    const decision = await service.isEntrySizeAllowed({
      dex: 'main',
      coin: 'BTC',
      amount: new BigNumber(0.02166),
      referencePrice: BTC_REFERENCE_PRICE
    })
    expect(decision.allowed).toBe(true)
    expect(decision.reason).toContain('override')
  })

  // CLOBBER REGRESSION (desk P0, 2026-08-20): the sizing override write path
  // persisted the whole in-memory override map without re-loading the persisted
  // registry first — so a later grant erased an earlier one (MRNA's sizing
  // override vanished). Fix loads overrides before set, so persist writes union.
  test('across-process sizing grants accumulate — ETH then MRNA both persist', async () => {
    const { service: a, stateDir } = await freshService(['exec-lead', 'chief'])
    await a.arm({ packageId: 'A-212', version: 'v3', perCoin: [V3_BTC_ENTRY] })
    await a.override({ dex: 'main', coin: 'ETH', actor: 'exec-lead', reason: 'eth', ttlMs: 60_000 })

    // Fresh process = the second CLI command; must see ETH before writing MRNA.
    const b = new SizingLockService({ stateDir, overrideActors: ['exec-lead', 'chief'] })
    await b.arm({ packageId: 'A-212', version: 'v3', perCoin: [V3_BTC_ENTRY] })
    await b.override({
      dex: 'main',
      coin: 'MRNA',
      actor: 'exec-lead',
      reason: 'mrna',
      ttlMs: 60_000
    })

    // Both override gates must be consumed.
    const eth = await b.isEntrySizeAllowed({
      dex: 'main',
      coin: 'ETH',
      amount: new BigNumber(0.1),
      referencePrice: new BigNumber(3000)
    })
    const mrna = await b.isEntrySizeAllowed({
      dex: 'main',
      coin: 'MRNA',
      amount: new BigNumber(0.1),
      referencePrice: new BigNumber(100)
    })
    expect(eth.allowed).toBe(true)
    expect(mrna.allowed).toBe(true)

    const raw = JSON.parse(await readFile(join(stateDir, 'sizing-lock-overrides.json'), 'utf8'))
    const keys = (raw.overrides as { key: string }[]).map((o) => o.key)
    expect(keys).toContain('main:ETH')
    expect(keys).toContain('main:MRNA')
  })

  test('override expires after TTL — off-lock refused again', async () => {
    vi.useFakeTimers()
    try {
      const { service } = await freshService(['exec-lead', 'chief'])
      await service.arm({ packageId: 'A-212', version: 'v3', perCoin: [V3_BTC_ENTRY] })
      await service.override({
        dex: 'main',
        coin: 'BTC',
        actor: 'exec-lead',
        reason: 'one-night re-size',
        ttlMs: 60_000
      })
      vi.setSystemTime(Date.now() + 60_001)
      const decision = await service.isEntrySizeAllowed({
        dex: 'main',
        coin: 'BTC',
        amount: new BigNumber(0.02166),
        referencePrice: BTC_REFERENCE_PRICE
      })
      expect(decision.allowed).toBe(false)
      expect(decision.reason).toContain('off-lock')
    } finally {
      vi.useRealTimers()
    }
  })

  // ORACLE regression (Desi's attempt 3): a sizing-lock override granted by one
  // CLI process MUST be consumed by a SEPARATE process's order-path check. The
  // original defect: the override lived only in memory, so a fresh process never
  // saw it — the grant was persisted+journaled but the check refused identically.
  test('ORACLE attempt-3: override granted in one process is consumed by a fresh-process check', async () => {
    const { service: granter, stateDir } = await freshService(['exec-lead', 'chief'])
    await granter.arm({ packageId: 'A-212', version: 'v3', perCoin: [V3_BTC_ENTRY] })
    const grant = await granter.override({
      dex: 'main',
      coin: 'BTC',
      actor: 'exec-lead',
      reason: 'desk override for the authorized entry',
      ttlMs: 60_000
    })
    expect(grant.granted).toBe(true)

    // A fresh process (new instance, same stateDir) runs the order-path check.
    const checker = new SizingLockService({ stateDir, overrideActors: ['exec-lead', 'chief'] })
    const decision = await checker.isEntrySizeAllowed({
      dex: 'main',
      coin: 'BTC',
      amount: new BigNumber(0.0259), // $1,791 — below package v3, would be off-lock without the override
      referencePrice: new BigNumber(71913)
    })
    expect(decision.allowed).toBe(true)
    expect(decision.reason).toContain('override')
  })

  // ORACLE regression (Desi's attempt 4 / Path A): arming a new package version
  // supersedes the old and the check validates against the CURRENT operative
  // version — no override needed. This path already worked, must stay green.
  test('ORACLE attempt-4: arm supersedes and the check passes against the new operative version', async () => {
    const { service } = await freshService()
    await service.arm({ packageId: 'A-212', version: 'v3', perCoin: [V3_BTC_ENTRY] })
    // Desk arms v3-PATHA with a lock matched to the intended trade notional.
    await service.arm({
      packageId: 'A-212',
      version: 'v3-PATHA',
      perCoin: [
        {
          coin: 'BTC',
          dex: 'main',
          notionalUsd: 1863.26,
          marginUsd: 93.16,
          leverage: 20,
          szDecimals: 5
        }
      ]
    })
    const operative = await service.getOperative()
    expect(operative?.version).toBe('v3-PATHA')
    const decision = await service.isEntrySizeAllowed({
      dex: 'main',
      coin: 'BTC',
      amount: new BigNumber(0.0259),
      referencePrice: new BigNumber(71913) // ≈ $1,862 — within ±2% of the new lock
    })
    expect(decision.allowed).toBe(true)
    expect(decision.reason).toContain('v3-PATHA')
  })
})

describe('SizingLockService — anchored state dir (cwd-independent)', () => {
  test('arm+override from a foreign cwd lands in the anchored store and a fresh order-path read sees it', async () => {
    const anchor = await mkdtemp(join(tmpdir(), 'sizing-anchor-'))
    const foreign = await mkdtemp(join(tmpdir(), 'sizing-foreign-'))
    const savedCwd = process.cwd()
    vi.stubEnv('TRIBES_STATE_DIR', anchor)
    try {
      process.chdir(foreign)

      // Writer CLI process: no explicit stateDir — must resolve to the anchored store.
      const writer = new SizingLockService()
      const armed = await writer.arm({ packageId: 'A-212', version: 'v3', perCoin: [V3_BTC_ENTRY] })
      expect(armed.manifestPath).toBe(join(anchor, 'operative-package.json'))
      const grant = await writer.override({
        dex: 'main',
        coin: 'BTC',
        actor: 'exec-lead',
        reason: 'foreign-cwd re-size',
        ttlMs: 60_000
      })
      expect(grant.stateDir).toBe(anchor)
      expect(grant.statePath).toBe(join(anchor, 'sizing-lock-overrides.json'))

      // The write must NOT have landed in the foreign cwd (the old bug).
      await expect(
        readFile(join(foreign, '.tribes', 'operative-package.json'), 'utf8')
      ).rejects.toThrow('ENOENT')

      // Order-path process: fresh instance, same anchored default — sees manifest + override.
      const reader = new SizingLockService()
      const decision = await reader.isEntrySizeAllowed({
        dex: 'main',
        coin: 'BTC',
        amount: new BigNumber(0.0259),
        referencePrice: new BigNumber(71913)
      })
      expect(decision.allowed).toBe(true)
      expect(decision.reason).toContain('override')
    } finally {
      process.chdir(savedCwd)
      vi.unstubAllEnvs()
      await rm(anchor, { recursive: true, force: true })
      await rm(foreign, { recursive: true, force: true })
    }
  })
})
describe('SizingLockService arm-collision guard (COIN ghost-flatten class)', () => {
  const ADDR = '0xbb64c24a6b2ee1185621490d2a1ae06522f15f57'

  // A service whose armCollisionCheck returns a programmable verdict per coin.
  async function collisionService(
    verdicts: Record<string, { livePosition?: boolean; inFlightFill?: boolean }>
  ): Promise<{
    service: SizingLockService
    stateDir: string
  }> {
    const stateDir = await mkdtemp(join(tmpdir(), 'sizing-arm-collision-'))
    const service = new SizingLockService({
      stateDir,
      overrideActors: ['exec-lead', 'chief'],
      armCollisionCheck: async (params: { address: string; dex: string; coin: string }) => {
        const v = verdicts[params.coin] ?? { livePosition: false, inFlightFill: false }
        return { livePosition: v.livePosition ?? false, inFlightFill: v.inFlightFill ?? false }
      }
    })
    await service.load()
    return { service, stateDir }
  }

  const COIN_ENTRY = {
    coin: 'COIN',
    dex: 'main',
    notionalUsd: 95,
    marginUsd: 95,
    leverage: 20,
    szDecimals: 4
  }
  const COIN_ENTRY_60 = { ...COIN_ENTRY, notionalUsd: 60, marginUsd: 60 }

  test('re-arm a coin with a LIVE position is REFUSED', async () => {
    const { service } = await collisionService({ COIN: { livePosition: true } })
    await service.arm({ packageId: 'A-1', version: 'v1', perCoin: [COIN_ENTRY] })
    await expect(
      service.arm({ packageId: 'A-1', version: 'v14', perCoin: [COIN_ENTRY_60], address: ADDR })
    ).rejects.toThrow('arm-collision guard')
  })

  test('re-arm with NO live position passes', async () => {
    const { service } = await collisionService({})
    await service.arm({ packageId: 'A-1', version: 'v1', perCoin: [COIN_ENTRY], address: ADDR })
    const armed = await service.arm({
      packageId: 'A-1',
      version: 'v14',
      perCoin: [COIN_ENTRY_60],
      address: ADDR
    })
    expect(armed.armed).toBe(true)
    expect(armed.version).toBe('v14')
  })

  test('re-arm with IN-FLIGHT fill is REFUSED (the COIN $95->$60 repro)', async () => {
    const { service } = await collisionService({ COIN: { inFlightFill: true } })
    await service.arm({ packageId: 'A-1', version: 'v1', perCoin: [COIN_ENTRY] })
    await expect(
      service.arm({ packageId: 'A-1', version: 'v14', perCoin: [COIN_ENTRY_60], address: ADDR })
    ).rejects.toThrow('IN-FLIGHT')
  })

  test('live-position + explicit chief/exec-lead override passes + journaled', async () => {
    const { service, stateDir } = await collisionService({ COIN: { livePosition: true } })
    await service.arm({ packageId: 'A-1', version: 'v1', perCoin: [COIN_ENTRY] })
    const armed = await service.arm({
      packageId: 'A-1',
      version: 'v14',
      perCoin: [COIN_ENTRY_60],
      address: ADDR,
      overrideActor: 'exec-lead',
      overrideReason: 'deliberate close + re-arm at new spec'
    })
    expect(armed.version).toBe('v14')
    const journal = await readFile(join(stateDir, 'sizing-lock-journal.jsonl'), 'utf8')
    expect(journal).toContain('arm-collision-override')
    expect(journal).toContain('exec-lead')
  })

  test('non-authority override actor cannot force the collision guard', async () => {
    const { service } = await collisionService({ COIN: { livePosition: true } })
    await service.arm({ packageId: 'A-1', version: 'v1', perCoin: [COIN_ENTRY] })
    await expect(
      service.arm({
        packageId: 'A-1',
        version: 'v14',
        perCoin: [COIN_ENTRY_60],
        address: ADDR,
        overrideActor: 'runa',
        overrideReason: 'not allowed'
      })
    ).rejects.toThrow('arm-collision guard')
  })

  test('no address -> no venue guard (manifest-only arm unchanged)', async () => {
    const { service } = await collisionService({ COIN: { livePosition: true } })
    const armed = await service.arm({ packageId: 'A-1', version: 'v14', perCoin: [COIN_ENTRY_60] })
    expect(armed.version).toBe('v14')
  })
})

describe('SizingLockService arm-collision — resting entry + reduce-only', () => {
  test('a resting entry (bracket) alone does NOT block a size-matched re-arm', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'sizing-arm-resting-'))
    const service = new SizingLockService({
      stateDir,
      overrideActors: ['exec-lead', 'chief'],
      armCollisionCheck: async () => ({
        livePosition: false,
        inFlightFill: false,
        restingEntry: true
      })
    })
    await service.load()
    const armed = await service.arm({
      packageId: 'A-1',
      version: 'v14',
      perCoin: [
        { coin: 'COIN', dex: 'main', notionalUsd: 95, marginUsd: 95, leverage: 20, szDecimals: 4 }
      ],
      address: '0xbb64c24a6b2ee1185621490d2a1ae06522f15f57'
    })
    expect(armed.version).toBe('v14')
    await rm(stateDir, { recursive: true, force: true })
  })

  test('the guard only governs arm — reduce-only exits / closes are untouched', async () => {
    // SizingLockService has no order/cancel path; the guard is scoped to arm().
    // isEntrySizeAllowed skips nothing for reduce-only in the ORDER path (the
    // HyperliquidService.assertSizingLockAllowed returns early on reduceOnly).
    // This test documents the seam: arm() accepts an override actor, so a
    // deliberate close-then-rearm is possible without any exit being blocked.
    const stateDir = await mkdtemp(join(tmpdir(), 'sizing-arm-ro-'))
    const service = new SizingLockService({ stateDir, overrideActors: ['exec-lead', 'chief'] })
    await service.load()
    const armed = await service.arm({
      packageId: 'A-1',
      version: 'v1',
      perCoin: [
        { coin: 'COIN', dex: 'main', notionalUsd: 95, marginUsd: 95, leverage: 20, szDecimals: 4 }
      ]
    })
    expect(armed.armed).toBe(true)
    await rm(stateDir, { recursive: true, force: true })
  })
})

function parseRecordsJournal(file: string): unknown[] {
  // JournalL: pretty-printed JSON records separated by a newline. Split on
  // record boundaries: each record STARTS at '{' and ends at the matching
  // top-level '}\n' (the next record's opening brace on its own line).
  const out: unknown[] = []
  let start = 0
  let depth = 0
  for (let i = 0; i < file.length; i++) {
    const ch = file[i]
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) {
        const next = file[i + 1]
        if (next === '\n' || next === '\r' || i === file.length - 1) {
          out.push(JSON.parse(file.slice(start, i + 1)))
          start = i + 2
          depth = 0
        }
      }
    }
  }
  return out
}

describe('SizingLockService arm-journaling + order-path flatten guard', () => {
  test('every arm() call appends an arm journal line with actor, ts, coin, old->new margin', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'sizing-arm-journal-'))
    const service = new SizingLockService({
      stateDir,
      overrideActors: ['exec-lead', 'chief'],
      armCollisionCheck: async () => ({ livePosition: false, inFlightFill: false })
    })
    await service.load()
    await service.arm({
      packageId: 'A-1',
      version: 'v14-COIN60',
      perCoin: [
        { coin: 'COIN', dex: 'main', notionalUsd: 60, marginUsd: 60, leverage: 20, szDecimals: 4 }
      ],
      address: '0xbb64c24a6b2ee1185621490d2a1ae06522f15f57' as `0x${string}`
    })
    const journal = await readFile(join(stateDir, 'sizing-lock-journal.jsonl'), 'utf8')
    const entry = parseRecordsJournal(journal).find((e) => e.kind === 'arm')
    expect(entry.kind).toBe('arm')
    expect(entry.version).toBe('v14-COIN60')
    expect(entry.delta[0].coin).toBe('COIN')
    expect(entry.delta[0].newMarginUsd).toBe(60)
    await rm(stateDir, { recursive: true, force: true })
  })

  test('arm journal records old->new margin on a re-arm (v13 950 -> v14 600)', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'sizing-arm-journal2-'))
    const service = new SizingLockService({
      stateDir,
      overrideActors: ['exec-lead', 'chief'],
      armCollisionCheck: async () => ({ livePosition: false, inFlightFill: false })
    })
    await service.load()
    await service.arm({
      packageId: 'A-1',
      version: 'v13',
      perCoin: [
        { coin: 'COIN', dex: 'main', notionalUsd: 95, marginUsd: 95, leverage: 20, szDecimals: 4 }
      ],
      address: '0xbb64c24a6b2ee1185621490d2a1ae06522f26f57' as `0x${string}`
    })
    await service.arm({
      packageId: 'A-1',
      version: 'v14',
      perCoin: [
        { coin: 'COIN', dex: 'main', notionalUsd: 60, marginUsd: 60, leverage: 20, szDecimals: 4 }
      ],
      address: '0xbb64c24a6b2ee1185621490d2a1ae06522f26f57' as `0x${string}`
    })
    const journal = await readFile(join(stateDir, 'sizing-lock-journal.jsonl'), 'utf8')
    const records = parseRecordsJournal(journal)
    const v14 = records.find((e) => e.version === 'v14')
    expect(v14).toBeTruthy()
    expect(v14.delta[0].oldMarginUsd).toBe(95)
    expect(v14.delta[0].newMarginUsd).toBe(60)
    await rm(stateDir, { recursive: true, force: true })
  })

  test('hasActiveFlattenDirective reflects a live chief/exec-lead override for the coin', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'sizing-flatten-directive-'))
    const service = new SizingLockService({ stateDir, overrideActors: ['exec-lead', 'chief'] })
    await service.load()
    expect(await service.hasActiveFlattenDirective('main', 'COIN')).toBe(false)
    await service.override({
      dex: 'main',
      coin: 'COIN',
      actor: 'chief',
      reason: 'user directive: close + re-place COIN at new spec',
      ttlMs: 60_000
    })
    expect(await service.hasActiveFlattenDirective('main', 'COIN')).toBe(true)
    await rm(stateDir, { recursive: true, force: true })
  })

  test('user-directive-through-Chef arm override ALLOWED + journaled (deliberate close)', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'sizing-arm-directive-'))
    const service = new SizingLockService({
      stateDir,
      overrideActors: ['exec-lead', 'chief'],
      armCollisionCheck: async () => ({ livePosition: true, inFlightFill: false })
    })
    await service.load()
    await service.arm({
      packageId: 'A-1',
      version: 'v1',
      perCoin: [
        { coin: 'COIN', dex: 'main', notionalUsd: 95, marginUsd: 95, leverage: 20, szDecimals: 4 }
      ]
    })
    const armed = await service.arm({
      packageId: 'A-1',
      version: 'v14',
      perCoin: [
        { coin: 'COIN', dex: 'main', notionalUsd: 60, marginUsd: 60, leverage: 20, szDecimals: 4 }
      ],
      address: '0xbb64c24a6b2ee1185621490d2a1ae06522f26f57' as `0x${string}`,
      overrideActor: 'chief',
      overrideReason: 'user directive: deliberate close + re-place COIN at new spec'
    })
    expect(armed.version).toBe('v14')
    const journal = await readFile(join(stateDir, 'sizing-lock-journal.jsonl'), 'utf8')
    const entry = parseRecordsJournal(journal).find((e) => e.kind === 'arm-collision-override')
    expect(entry.kind).toBe('arm-collision-override')
    expect(entry.actor).toBe('chief')
    await rm(stateDir, { recursive: true, force: true })
  })
})

describe('SizingLockService TWAP-in-flight + slot-cap guard (CXMT over-cap class)', () => {
  const ADDR = '0xbb64c24a6b2ee1185621490d2a1ae06522f15f57'

  async function twapService(
    verdicts: Record<
      string,
      { livePosition?: boolean; twapInFlight?: boolean; openTwapLegs?: number }
    >,
    slotCap = 4
  ): Promise<{ service: SizingLockService; stateDir: string }> {
    const stateDir = await mkdtemp(join(tmpdir(), 'sizing-twap-cap-'))
    const service = new SizingLockService({
      stateDir,
      overrideActors: ['exec-lead', 'chief'],
      slotCap,
      armCollisionCheck: async (params: { address: string; dex: string; coin: string }) => {
        const v = verdicts[params.coin] ?? {
          livePosition: false,
          inFlightFill: false,
          twapInFlight: false,
          openTwapLegs: 0
        }
        return {
          livePosition: v.livePosition ?? false,
          inFlightFill: false,
          twapInFlight: v.twapInFlight ?? false,
          openTwapLegs: v.openTwapLegs ?? 0
        }
      }
    })
    await service.load()
    return { service, stateDir }
  }

  const COIN_ENTRY = {
    coin: 'COIN',
    dex: 'main',
    notionalUsd: 95,
    marginUsd: 95,
    leverage: 20,
    szDecimals: 4
  }

  test('arm a coin with an IN-FLIGHT TWAP is REFUSED', async () => {
    const { service, stateDir } = await twapService({ COIN: { twapInFlight: true } })
    await service.arm({ packageId: 'A-1', version: 'v1', perCoin: [COIN_ENTRY] })
    await expect(
      service.arm({
        packageId: 'A-1',
        version: 'v14',
        perCoin: [COIN_ENTRY],
        address: ADDR
      })
    ).rejects.toThrow('IN-FLIGHT TWAP')
    await rm(stateDir, { recursive: true, force: true })
  })

  test('cap-count: a TWAP ladder over the slot cap is REFUSED (CXMT 15-leg case)', async () => {
    const { service, stateDir } = await twapService({ CXMT: { openTwapLegs: 15 } }, 4)
    await service.arm({ packageId: 'A-1', version: 'v1', perCoin: [COIN_ENTRY] })
    await expect(
      service.arm({
        packageId: 'A-1',
        version: 'v14',
        perCoin: [{ ...COIN_ENTRY, coin: 'CXMT' }],
        address: ADDR
      })
    ).rejects.toThrow('slot-cap guard')
    await rm(stateDir, { recursive: true, force: true })
  })

  test('within-cap TWAP passes (no refusal when open legs fit the slot cap)', async () => {
    const { service, stateDir } = await twapService(
      { COIN: { livePosition: false, openTwapLegs: 1 } },
      4
    )
    await service.arm({ packageId: 'A-1', version: 'v1', perCoin: [COIN_ENTRY] })
    const armed = await service.arm({
      packageId: 'A-1',
      version: 'v14',
      perCoin: [COIN_ENTRY],
      address: ADDR
    })
    expect(armed.version).toBe('v14')
    await rm(stateDir, { recursive: true, force: true })
  })

  test('authority override force-arms over the over-cap ladder + journaled', async () => {
    const { service, stateDir } = await twapService({ CXMT: { openTwapLegs: 15 } }, 4)
    await service.arm({ packageId: 'A-1', version: 'v1', perCoin: [COIN_ENTRY] })
    const armed = await service.arm({
      packageId: 'A-1',
      version: 'v14',
      perCoin: [{ ...COIN_ENTRY, coin: 'CXMT' }],
      address: ADDR,
      overrideActor: 'exec-lead',
      overrideReason: 'user directive: force the over-cap ladder at Chief go'
    })
    expect(armed.version).toBe('v14')
    const journal = await readFile(join(stateDir, 'sizing-lock-journal.jsonl'), 'utf8')
    expect(journal).toContain('slot-cap-override')
    expect(journal).toContain('exec-lead')
    await rm(stateDir, { recursive: true, force: true })
  })
})
