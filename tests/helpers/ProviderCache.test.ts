import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { cachedProviderJson } from '@/helpers/ProviderCache'

describe('cachedProviderJson', () => {
  let baseDir: string

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'provider-cache-test-'))
  })

  it('serves a fresh entry from cache without refetching', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ value: 42 })

    const first = await cachedProviderJson({ cacheKey: 'k1', ttlMs: 60_000, fetchFn, baseDir })
    const second = await cachedProviderJson({ cacheKey: 'k1', ttlMs: 60_000, fetchFn, baseDir })

    expect(first).toEqual({ value: 42 })
    expect(second).toEqual({ value: 42 })
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('refetches after the TTL expires', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce({ gen: 1 }).mockResolvedValueOnce({ gen: 2 })

    const first = await cachedProviderJson({ cacheKey: 'k2', ttlMs: -1, fetchFn, baseDir })
    const second = await cachedProviderJson({ cacheKey: 'k2', ttlMs: -1, fetchFn, baseDir })

    expect(first).toEqual({ gen: 1 })
    expect(second).toEqual({ gen: 2 })
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('keeps distinct cache keys separate', async () => {
    const fetchA = vi.fn().mockResolvedValue({ from: 'a' })
    const fetchB = vi.fn().mockResolvedValue({ from: 'b' })

    const a = await cachedProviderJson({ cacheKey: 'ka', ttlMs: 60_000, fetchFn: fetchA, baseDir })
    const b = await cachedProviderJson({ cacheKey: 'kb', ttlMs: 60_000, fetchFn: fetchB, baseDir })

    expect(a).toEqual({ from: 'a' })
    expect(b).toEqual({ from: 'b' })
  })

  it('propagates fetch failures instead of caching them', async () => {
    const failing = vi.fn().mockRejectedValue(new Error('provider down'))
    await expect(
      cachedProviderJson({ cacheKey: 'k3', ttlMs: 60_000, fetchFn: failing, baseDir })
    ).rejects.toThrow('provider down')

    const recovering = vi.fn().mockResolvedValue({ ok: true })
    const result = await cachedProviderJson({
      cacheKey: 'k3',
      ttlMs: 60_000,
      fetchFn: recovering,
      baseDir
    })
    expect(result).toEqual({ ok: true })
  })
})
