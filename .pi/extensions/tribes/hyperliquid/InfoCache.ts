/**
 * Hyperliquid `/info` request with a last-known-good response cache.
 *
 * Lives outside index.ts (like LiqEstimator / DexDiscovery) so it can be
 * unit-tested without dragging in the pi-coding-agent runtime imports that
 * file pulls in.
 *
 * Cache semantics — deliberately explicit:
 *
 * - KEY: the exact serialized POST body (`{ type, ...params }`). Two calls
 *   share a cache entry only when they request literally the same thing, so a
 *   `clearinghouseState` for dex `xyz` never answers one for dex `main`.
 * - WRITE: every HTTP 200 overwrites its key's entry with the raw body text and
 *   a timestamp. Nothing else writes the cache — a non-200 never poisons it.
 * - FRESH READ: a cached entry is served *instead of* fetching only when the
 *   caller passed `cacheTtlMs` and the entry is younger than it. `cacheTtlMs`
 *   defaults to 0, i.e. always fetch. (Callers already passed this option; it
 *   was previously accepted and ignored.)
 * - RATE LIMIT (429): the request is SKIPPED, not retried and not backed off,
 *   and it never throws when a cached value exists. The last-known-good value
 *   for that key is returned however old it is — a 429 must not blow up the
 *   Hyperliquid panel. Staleness is surfaced, not hidden: every stale serve is
 *   recorded with the timestamp of the 200 it came from, so the caller can
 *   render "updated <then>" instead of implying the data is live.
 * - 429 WITH NO CACHED VALUE: throws HyperliquidRateLimitError. There is no
 *   stale value to show, and it never fabricates one, never returns another
 *   key's value, and never returns an empty success that would render as a
 *   real (and wrong) zero balance. The caller surfaces it as an error state.
 * - LIFETIME: process memory only; nothing is persisted. The key count is
 *   bounded in practice by the fixed set of request shapes the widget issues.
 */

const HYPERLIQUID_INFO_URL = 'https://api.hyperliquid.xyz/info'

export class HyperliquidRateLimitError extends Error {
  readonly status = 429

  constructor(message: string) {
    super(message)
    this.name = 'HyperliquidRateLimitError'
  }
}

export type InfoBody = { type: string } & Record<string, unknown>

export type InfoRequestOptions = {
  /** Serve a cached 200 without fetching while it is younger than this. */
  readonly cacheTtlMs?: number
}

type CacheEntry = {
  /** The raw 200 body. Kept as text so each serve parses its own value and no
   *  caller can mutate what the next one reads. */
  readonly text: string
  readonly storedAtMs: number
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>

const cache = new Map<string, CacheEntry>()

/**
 * Timestamp of the OLDEST 200 that a 429 has been answered with since the last
 * `resetStaleServes()`. `null` means nothing served so far is stale.
 *
 * The status build drains this at the start of a snapshot and reads it at the
 * end, so the snapshot can date itself to the data it actually contains rather
 * than to the moment it was assembled.
 */
let oldestStaleServeMs: number | null = null

export function resetStaleServes(): void {
  oldestStaleServeMs = null
}

export function staleServedSinceMs(): number | null {
  return oldestStaleServeMs
}

function recordStaleServe(storedAtMs: number): void {
  if (oldestStaleServeMs === null || storedAtMs < oldestStaleServeMs) {
    oldestStaleServeMs = storedAtMs
  }
}

/** Test seam only — production callers never need this. */
export function clearInfoCache(): void {
  cache.clear()
  oldestStaleServeMs = null
}

export type InfoRequestDeps = {
  readonly fetchImpl?: FetchLike
  readonly nowMs?: () => number
  readonly url?: string
}

/**
 * The value plus the provenance a caller needs to date it honestly:
 * `fetchedAtMs` is when the 200 that produced this value actually landed, and
 * `stale` is true when a 429 was skipped and this is the previous value.
 */
export type InfoResult<T> = {
  readonly value: T
  readonly fetchedAtMs: number
  readonly stale: boolean
}

/** Convenience wrapper for the many call sites that only want the value. */
export async function infoRequest<T>(
  body: InfoBody,
  options: InfoRequestOptions = {},
  deps: InfoRequestDeps = {}
): Promise<T> {
  return (await infoRequestWithMeta<T>(body, options, deps)).value
}

/**
 * POST to Hyperliquid `/info`, caching the latest 200 per request body and
 * skipping (rather than failing) when the venue answers 429.
 */
export async function infoRequestWithMeta<T>(
  body: InfoBody,
  options: InfoRequestOptions = {},
  deps: InfoRequestDeps = {}
): Promise<InfoResult<T>> {
  const doFetch = deps.fetchImpl ?? fetch
  const now = deps.nowMs ?? Date.now
  const url = deps.url ?? HYPERLIQUID_INFO_URL

  // Serialized here, once: this string is both the wire body and the cache key.
  const key = serializeBody(body)

  const ttlMs = options.cacheTtlMs ?? 0
  const cached = cache.get(key)
  if (cached !== undefined && ttlMs > 0 && now() - cached.storedAtMs < ttlMs) {
    const value: T = JSON.parse(cached.text)
    return { value, fetchedAtMs: cached.storedAtMs, stale: false }
  }

  const response = await doFetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: key
  })

  // Read the status BEFORE touching the body. A 429 comes back with an empty
  // body, and serializing an empty body used to throw and destroy the status
  // code before anyone could branch on it.
  if (response.status === 429) {
    if (cached !== undefined) {
      // Skip: no retry, no backoff. Serve the last good value at any age and
      // record when it was fetched so the panel can date it honestly.
      recordStaleServe(cached.storedAtMs)
      const value: T = JSON.parse(cached.text)
      return { value, fetchedAtMs: cached.storedAtMs, stale: true }
    }
    throw new HyperliquidRateLimitError(
      `Hyperliquid info ${body.type} rate limited (429) and no cached response is available`
    )
  }

  const text = await response.text()

  if (!response.ok) {
    throw new Error(`Hyperliquid info ${response.status}: ${text.length > 0 ? text : '<empty>'}`)
  }

  if (text.length === 0) {
    throw new Error(`Hyperliquid info ${response.status}: empty response body`)
  }

  const value: T = JSON.parse(text)
  const fetchedAtMs = now()
  cache.set(key, { text, storedAtMs: fetchedAtMs })
  return { value, fetchedAtMs, stale: false }
}

function serializeBody(body: InfoBody): string {
  /* eslint-disable lucy/no-json-stringify */
  // Request bodies are plain string/number/boolean records built in this
  // extension — no bigint, URL or toJSON values — so the sanctioned
  // ensureJsonTreeString wrapper buys nothing here, and its nullish-throws
  // behaviour is exactly what we are trying to keep off this path.
  return JSON.stringify(body)
  /* eslint-enable lucy/no-json-stringify */
}
