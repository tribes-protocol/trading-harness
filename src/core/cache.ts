import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { getSettings } from './config.js';

/**
 * TTL caches. MemoryCache for hot per-process reuse; DiskCache for
 * immutable historical data (e.g. finalized EOD bars, macro vintages).
 *
 * IMPORTANT: caching is a licensing-sensitive operation. Adapters must only
 * cache datasets whose provider licensing permits storage — the provider
 * registry records each provider's storage restrictions, and adapters
 * declare per-operation cache policy. These classes enforce TTLs, not
 * licensing; the adapter is the enforcement point.
 */

interface CacheEntry<T> {
  value: T;
  storedAt: string;
  /** Epoch ms; null = no expiry (immutable data). */
  expiresAt: number | null;
}

export interface CacheResult<T> {
  value: T;
  cacheHit: boolean;
  storedAt?: string;
}

export class MemoryCache {
  private readonly entries = new Map<string, CacheEntry<unknown>>();

  constructor(private readonly maxEntries = 5_000) {}

  get<T>(key: string): CacheEntry<T> | undefined {
    const entry = this.entries.get(key) as CacheEntry<T> | undefined;
    if (!entry) return undefined;
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }
    return entry;
  }

  set<T>(key: string, value: T, ttlMs: number | null): void {
    if (!this.entries.has(key) && this.entries.size >= this.maxEntries) {
      // Drop the oldest insertion (Map preserves insertion order).
      // Overwrites never evict — refreshing a hot key must not shrink the
      // effective cache.
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, {
      value,
      storedAt: new Date().toISOString(),
      expiresAt: ttlMs === null ? null : Date.now() + ttlMs,
    });
  }

  async getOrFetch<T>(
    key: string,
    ttlMs: number | null,
    fn: () => Promise<T>,
  ): Promise<CacheResult<T>> {
    const hit = this.get<T>(key);
    if (hit) return { value: hit.value, cacheHit: true, storedAt: hit.storedAt };
    const value = await fn();
    this.set(key, value, ttlMs);
    return { value, cacheHit: false };
  }

  clear(): void {
    this.entries.clear();
  }
}

export class DiskCache {
  private readonly dir: string;

  constructor(namespace: string, baseDir?: string) {
    this.dir = join(baseDir ?? getSettings().cacheDir, namespace);
    mkdirSync(this.dir, { recursive: true });
  }

  private pathFor(key: string): string {
    const digest = createHash('sha256').update(key).digest('hex').slice(0, 40);
    return join(this.dir, `${digest}.json`);
  }

  get<T>(key: string): CacheEntry<T> | undefined {
    try {
      const raw = readFileSync(this.pathFor(key), 'utf8');
      const entry = JSON.parse(raw) as CacheEntry<T> & { key: string };
      if (entry.key !== key) return undefined; // hash collision guard
      if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
        rmSync(this.pathFor(key), { force: true });
        return undefined;
      }
      return entry;
    } catch {
      return undefined;
    }
  }

  set<T>(key: string, value: T, ttlMs: number | null): void {
    const entry = {
      key,
      value,
      storedAt: new Date().toISOString(),
      expiresAt: ttlMs === null ? null : Date.now() + ttlMs,
    };
    writeFileSync(this.pathFor(key), JSON.stringify(entry), 'utf8');
  }

  async getOrFetch<T>(
    key: string,
    ttlMs: number | null,
    fn: () => Promise<T>,
  ): Promise<CacheResult<T>> {
    const hit = this.get<T>(key);
    if (hit) return { value: hit.value, cacheHit: true, storedAt: hit.storedAt };
    const value = await fn();
    this.set(key, value, ttlMs);
    return { value, cacheHit: false };
  }
}
