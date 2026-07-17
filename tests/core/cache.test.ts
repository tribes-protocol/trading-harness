import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { DiskCache, MemoryCache } from '../../src/core/cache.js';

describe('MemoryCache', () => {
  it('hits within TTL and misses after expiry', async () => {
    const cache = new MemoryCache();
    cache.set('k', 42, 60_000);
    expect(cache.get<number>('k')?.value).toBe(42);
    cache.set('gone', 1, -1);
    expect(cache.get('gone')).toBeUndefined();
  });

  it('getOrFetch reports cacheHit correctly', async () => {
    const cache = new MemoryCache();
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      return 'value';
    };
    const first = await cache.getOrFetch('key', 60_000, fetcher);
    const second = await cache.getOrFetch('key', 60_000, fetcher);
    expect(first.cacheHit).toBe(false);
    expect(second.cacheHit).toBe(true);
    expect(calls).toBe(1);
  });

  it('evicts oldest entry at capacity', () => {
    const cache = new MemoryCache(2);
    cache.set('a', 1, null);
    cache.set('b', 2, null);
    cache.set('c', 3, null);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get<number>('c')?.value).toBe(3);
  });

  it('overwriting an existing key at capacity evicts nothing', () => {
    const cache = new MemoryCache(2);
    cache.set('a', 1, null);
    cache.set('b', 2, null);
    cache.set('b', 3, null);
    expect(cache.get<number>('a')?.value).toBe(1);
    expect(cache.get<number>('b')?.value).toBe(3);
  });
});

describe('DiskCache', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pi-cache-test-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('persists values with no expiry (immutable data)', async () => {
    const cache = new DiskCache('test-ns', dir);
    cache.set('series:CPIAUCSL:2020', { points: [1, 2, 3] }, null);
    const again = new DiskCache('test-ns', dir);
    expect(again.get<{ points: number[] }>('series:CPIAUCSL:2020')?.value.points).toEqual([
      1, 2, 3,
    ]);
  });

  it('misses on unknown keys and expired entries', () => {
    const cache = new DiskCache('test-ns2', dir);
    expect(cache.get('nope')).toBeUndefined();
    cache.set('expired', 1, -1);
    expect(cache.get('expired')).toBeUndefined();
  });
});
