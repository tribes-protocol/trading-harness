import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test, vi } from 'vitest'

import { EntryGateService } from '@/services/EntryGateService'

async function freshService(overrideActors?: readonly string[]): Promise<{
  service: EntryGateService
  stateDir: string
}> {
  const stateDir = await mkdtemp(join(tmpdir(), 'entry-gate-'))
  const service = new EntryGateService({ stateDir, overrideActors })
  await service.load()
  return { service, stateDir }
}

describe('EntryGateService gate state registry', () => {
  test('missing state defaults to stand_by = refuse (no-trigger entry impossible)', async () => {
    const { service } = await freshService()
    const decision = await service.isEntryAllowed('main', 'BTC')
    expect(decision.allowed).toBe(false)
    expect(decision.reason).toContain('stand_by')
  })

  test('armed_awaiting still refuses — a trigger must have fired', async () => {
    const { service } = await freshService()
    await service.arm('main', 'BTC')
    const decision = await service.isEntryAllowed('main', 'BTC')
    expect(decision.allowed).toBe(false)
    expect(decision.reason).toContain('awaiting trigger')
  })

  test('trigger_fired within TTL allows the entry', async () => {
    const { service } = await freshService()
    await service.fireTrigger('main', 'BTC', 60_000)
    const decision = await service.isEntryAllowed('main', 'BTC')
    expect(decision.allowed).toBe(true)
    expect(decision.state.status).toBe('trigger_fired')
  })

  test('trigger_fired with expired TTL refuses again', async () => {
    vi.useFakeTimers()
    try {
      const { service } = await freshService()
      await service.fireTrigger('main', 'BTC', 60_000)
      vi.setSystemTime(Date.now() + 60_001)
      const decision = await service.isEntryAllowed('main', 'BTC')
      expect(decision.allowed).toBe(false)
      expect(decision.reason).toContain('TTL expired')
    } finally {
      vi.useRealTimers()
    }
  })

  test('gate state is durable across a reload (survives the watch loop)', async () => {
    const { service, stateDir } = await freshService()
    await service.fireTrigger('main', 'BTC', 60_000)
    const reloaded = new EntryGateService({ stateDir })
    await reloaded.load()
    const decision = await reloaded.isEntryAllowed('main', 'BTC')
    expect(decision.allowed).toBe(true)
  })

  test('coins normalize case and dex names normalize to main', async () => {
    const { service } = await freshService()
    await service.fireTrigger(null, 'btc', 60_000)
    const state = await service.getState('', 'BTC')
    expect(state.coin).toBe('BTC')
    expect(state.dex).toBe('main')
    expect(await service.isEntryAllowed('', 'BTC')).toMatchObject({ allowed: true })
  })
})

describe('EntryGateService override (authority-gated, journaled)', () => {
  test('refuses an actor outside the allowlist by default', async () => {
    const { service } = await freshService(['exec-lead', 'chief'])
    await expect(
      service.override({ dex: 'main', coin: 'BTC', actor: 'runa', reason: 'not authorized' })
    ).rejects.toThrow('refused')
  })

  test('grants an authorized actor, journals the entry, and expires', async () => {
    const { service, stateDir } = await freshService(['exec-lead', 'chief'])
    const result = await service.override({
      dex: 'main',
      coin: 'BTC',
      actor: 'exec-lead',
      reason: 'trigger fired but watch wobbled',
      ttlMs: 60_000
    })
    expect(result.granted).toBe(true)
    expect(result.actor).toBe('exec-lead')
    expect(await service.isEntryAllowed('main', 'BTC')).toMatchObject({ allowed: true })

    const journal = await readFile(join(stateDir, 'entry-gate-journal.jsonl'), 'utf8')
    expect(journal).toContain('exec-lead')
    expect(journal).toContain('watch wobbled')
  })

  // CLOBBER REGRESSION (desk P0, 2026-08-20): each CLI override runs in its own
  // process with a fresh empty in-memory map, and the write path persisted the
  // whole map WITHOUT re-loading first — so grant B erased grant A on disk
  // (the MRNA/ETH flap). The fix loads the persisted registry before set, so
  // persisting writes the true union. These prove the clobber cannot recur.
  test('across-process grants accumulate — grant A then grant B, both persist', async () => {
    const { service: a, stateDir } = await freshService(['exec-lead', 'chief'])
    await a.override({ dex: 'main', coin: 'ETH', actor: 'exec-lead', reason: 'a', ttlMs: 60_000 })

    // Fresh process = the second CLI command. Must load the persisted ETH grant
    // before writing MRNA, else MRNA would clobber ETH.
    const b = new EntryGateService({ stateDir, overrideActors: ['exec-lead', 'chief'] })
    await b.override({ dex: 'main', coin: 'MRNA', actor: 'exec-lead', reason: 'b', ttlMs: 60_000 })

    const eth = await b.isEntryAllowed('main', 'ETH')
    const mrna = await b.isEntryAllowed('main', 'MRNA')
    expect(eth.allowed).toBe(true)
    expect(mrna.allowed).toBe(true)

    // The persisted file must hold BOTH states.
    const raw = JSON.parse(await readFile(join(stateDir, 'entry-gate.json'), 'utf8'))
    const coins = (raw.states as { coin: string }[]).map((s) => s.coin)
    expect(coins).toContain('ETH')
    expect(coins).toContain('MRNA')
  })

  test('re-grant MRNA after an ETH re-invoke — both survive (no clobber)', async () => {
    const { service: a, stateDir } = await freshService(['exec-lead', 'chief'])
    await a.override({ dex: 'main', coin: 'ETH', actor: 'exec-lead', reason: 'eth-1', ttlMs: 60_000 })
    const b = new EntryGateService({ stateDir, overrideActors: ['exec-lead', 'chief'] })
    await b.override({ dex: 'main', coin: 'MRNA', actor: 'exec-lead', reason: 'mrna', ttlMs: 60_000 })

    // Another re-invoke of ETH (the exact flap: last ETH write wiped MRNA).
    const c = new EntryGateService({ stateDir, overrideActors: ['exec-lead', 'chief'] })
    await c.override({ dex: 'main', coin: 'ETH', actor: 'exec-lead', reason: 'eth-2', ttlMs: 60_000 })

    const eth = await c.isEntryAllowed('main', 'ETH')
    const mrna = await c.isEntryAllowed('main', 'MRNA')
    expect(eth.allowed).toBe(true)
    expect(mrna.allowed).toBe(true)
  })
})