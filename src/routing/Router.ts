import { ZodError } from 'zod'

import { type AssetSource, EmptyPayloadError, NotFoundError } from '@/routing/Capabilities'
import type { CapabilityAttempt, CapabilityAttemptOutcome } from '@/types/Capability'
import { isFetchNetworkError, isNullish } from '@/utils/Lang'

const DETAIL_MAX_CHARS = 200
// Every service embeds the HTTP status as `failed: <status>` in its error
// message; the router classifies from that.
const HTTP_STATUS_PATTERN = /failed: (\d{3})/
const RETRIABLE_HTTP_STATUSES = new Set([401, 403, 408, 429])

type ResolveCapabilityParams<T> = {
  readonly capability: string
  readonly sources: ReadonlyArray<AssetSource<T>>
}

export type ResolvedCapability<T> = T & {
  readonly source: string
  readonly attempted: CapabilityAttempt[]
}

type ClassifiedFailure = {
  readonly outcome: CapabilityAttemptOutcome
  readonly detail: string
  readonly retriable: boolean
}

function classifyFailure(error: unknown): ClassifiedFailure | null {
  const message = error instanceof Error ? error.message : String(error)
  const detail = message.slice(0, DETAIL_MAX_CHARS)
  if (error instanceof NotFoundError) {
    // Finality is decided by the source's authoritative flag.
    return { outcome: 'not_found', detail, retriable: true }
  }
  if (error instanceof EmptyPayloadError) {
    return { outcome: 'empty', detail, retriable: true }
  }
  if (error instanceof ZodError) {
    return { outcome: 'parse_error', detail, retriable: true }
  }
  if (
    isFetchNetworkError(error) ||
    (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError'))
  ) {
    return { outcome: 'timeout', detail, retriable: true }
  }
  if (message.includes('is not set')) {
    return { outcome: 'key_unset', detail, retriable: true }
  }
  const match = HTTP_STATUS_PATTERN.exec(message)
  if (!isNullish(match) && !isNullish(match[1])) {
    const status = Number(match[1])
    if (status === 404) {
      return { outcome: 'not_found', detail, retriable: true }
    }
    return {
      outcome: `http_${status}`,
      detail,
      retriable: RETRIABLE_HTTP_STATUSES.has(status) || status >= 500
    }
  }
  // Unclassifiable errors (bugs, unexpected shapes) are rethrown as-is.
  return null
}

function describeTrail(attempted: CapabilityAttempt[]): string {
  return attempted
    .map((attempt) =>
      isNullish(attempt.detail)
        ? `${attempt.provider}: ${attempt.outcome}`
        : `${attempt.provider}: ${attempt.outcome} (${attempt.detail})`
    )
    .join('; ')
}

// Try sources in order. NEXT on: key unset, 401/403/408/429/5xx, timeout,
// empty payload, schema-parse failure, and not-found from a non-authoritative
// source. FINAL on: not-found from an authoritative source, any other HTTP
// status. One provider per response; every attempt is recorded.
export async function resolveCapability<T extends object>(
  params: ResolveCapabilityParams<T>
): Promise<ResolvedCapability<T>> {
  const attempted: CapabilityAttempt[] = []
  for (const source of params.sources) {
    let payload: T
    try {
      payload = await source.fetch()
    } catch (error) {
      const classified = classifyFailure(error)
      if (isNullish(classified)) {
        throw error
      }
      attempted.push({
        provider: source.provider,
        outcome: classified.outcome,
        detail: classified.detail
      })
      const notFoundIsFinal = classified.outcome === 'not_found' && source.authoritative === true
      if (!classified.retriable || notFoundIsFinal) {
        throw new Error(`asset ${params.capability} failed — ${describeTrail(attempted)}`)
      }
      continue
    }
    attempted.push({ provider: source.provider, outcome: 'ok' })
    return { ...payload, source: source.provider, attempted }
  }
  throw new Error(`asset ${params.capability}: all providers failed — ${describeTrail(attempted)}`)
}
