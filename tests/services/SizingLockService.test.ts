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
})