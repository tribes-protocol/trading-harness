import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { isNullish, isRecord, isRequiredNumber } from '@/utils/Lang'

// Tiny read-through file cache for direct provider responses. tribes-cli is a
// short-lived process, so an in-memory cache would never hit; persisting under
// the gitignored .tribes/ directory lets repeated calls within a strategy cycle
// reuse fresh data instead of burning provider rate limits.
//
// Cache keys are logical descriptions (provider + endpoint + params) and MUST
// NEVER contain API keys — the key is hashed into the filename but the raw key
// is also stored in the entry for debuggability.

const CACHE_DIR = '.tribes/provider-cache'

type CachedProviderJsonParams = {
  // Logical cache key, e.g. 'coingecko:simple-price:bitcoin,ethereum:usd'. Must not
  // contain secrets.
  readonly cacheKey: string
  readonly ttlMs: number
  readonly fetchFn: () => Promise<unknown>
  // Base directory override; defaults to TRIBES_PROVIDER_CACHE_BASE (used by
  // tests to isolate cache state) and then the working directory.
  readonly baseDir?: string
}

function cacheFilePath(cacheKey: string, baseDir: string): string {
  const digest = createHash('sha256').update(cacheKey).digest('hex').slice(0, 32)
  return resolve(baseDir, join(CACHE_DIR, `${digest}.json`))
}

async function readFreshEntry(path: string, cacheKey: string): Promise<unknown> {
  const text = await readFile(path, 'utf8')
  const entry: unknown = JSON.parse(text)
  if (!isRecord(entry) || !isRequiredNumber(entry.expiresAt) || entry.cacheKey !== cacheKey) {
    return undefined
  }
  if (Date.now() >= entry.expiresAt) {
    return undefined
  }
  return entry.payload
}

export async function cachedProviderJson(params: CachedProviderJsonParams): Promise<unknown> {
  const baseDir = params.baseDir ?? process.env.TRIBES_PROVIDER_CACHE_BASE ?? process.cwd()
  const path = cacheFilePath(params.cacheKey, baseDir)

  try {
    const cached = await readFreshEntry(path, params.cacheKey)
    if (!isNullish(cached)) {
      return cached
    }
  } catch {
    // Missing or corrupt cache entry — treat as a miss.
  }

  const payload = await params.fetchFn()

  try {
    await mkdir(resolve(baseDir, CACHE_DIR), { recursive: true })
    await writeFile(
      path,
      ensureCompactJson({
        cacheKey: params.cacheKey,
        expiresAt: Date.now() + params.ttlMs,
        payload
      }),
      'utf8'
    )
  } catch {
    // Best-effort persistence: a read-only filesystem must not fail the request.
  }

  return payload
}

function ensureCompactJson(value: unknown): string {
  /* eslint-disable lucy/no-json-stringify */
  // Cache entries are machine-read only; compact JSON halves the on-disk size
  // versus the human-oriented ensureJsonTreeString pretty printer.
  return JSON.stringify(value)
  /* eslint-enable lucy/no-json-stringify */
}
