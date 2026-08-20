export class ShutdownError extends Error {
  constructor() {
    super('Process shutdown requested')
    this.name = 'ShutdownError'
  }
}

// Wraps a timeout failure that should be retried by an outer mechanism (e.g. a queue
// consumer redelivering the message) instead of being captured as a hard Sentry error.
export class RecoverableTimeoutError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'RecoverableTimeoutError'
  }
}

// Robustly detects timeout-class errors without brittle message matching.
// Covers: our own AbortController timeouts, DOMException 'TimeoutError', and the
// name-based `TimeoutError` thrown by HTTP clients (which carry no stack trace).
// `DOMException` is guarded for runtimes where it is not defined globally so the
// instanceof check cannot throw a ReferenceError that masks the original failure.
export function isTimeoutError(error: unknown): boolean {
  if (error instanceof RecoverableTimeoutError) {
    return true
  }
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return error.name === 'TimeoutError'
  }
  if (error instanceof Error) {
    return error.name === 'TimeoutError'
  }
  return false
}

let shutdownRequested = false
const shutdownListeners: Array<() => void> = []

export function isShutdownRequested(): boolean {
  return shutdownRequested
}

export function addShutdownListener(listener: () => void): () => void {
  if (shutdownRequested) {
    listener()
    return () => undefined
  }
  shutdownListeners.push(listener)
  return () => {
    const idx = shutdownListeners.indexOf(listener)
    if (idx >= 0) {
      shutdownListeners.splice(idx, 1)
    }
  }
}

// Use process.once so the handler auto-removes after first signal.
// First signal: sets flag and notifies listeners for graceful shutdown.
// Second signal (or orchestrator SIGKILL): default behavior terminates the process.
if (typeof process !== 'undefined' && typeof process.on === 'function') {
  const onShutdown = (): void => {
    shutdownRequested = true
    for (const listener of [...shutdownListeners]) {
      listener()
    }
    shutdownListeners.length = 0
  }
  process.once('SIGINT', onShutdown)
  process.once('SIGTERM', onShutdown)
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function retry<T>({
  fn,
  maxRetries = 3,
  logError = true,
  ms = 1000,
  shouldRetry
}: {
  fn: () => Promise<T>
  maxRetries?: number
  logError?: boolean
  ms?: number
  shouldRetry?: (error: unknown) => boolean
}): Promise<T> {
  return new Promise((resolve, reject) => {
    let retries = 0
    const attempt = (): void => {
      if (shutdownRequested) {
        reject(new ShutdownError())
        return
      }

      fn()
        .then(resolve)
        .catch((error: unknown) => {
          if (shutdownRequested) {
            reject(new ShutdownError())
            return
          }

          if (logError) {
            console.error('Retry attempt failed', error, {
              module: 'async-control'
            })
          }
          if (shouldRetry && !shouldRetry(error)) {
            reject(error)
            return
          }
          if (retries < maxRetries) {
            retries += 1
            const timer = setTimeout(() => {
              removeListener()
              attempt()
            }, ms)
            const removeListener = addShutdownListener(() => {
              clearTimeout(timer)
              reject(new ShutdownError())
            })
            return
          }
          reject(error)
        })
    }

    attempt()
  })
}

export function retryForever<T>({
  fn,
  ms = 1000
}: {
  fn: () => Promise<T>
  ms?: number
}): Promise<T> {
  return retry({ fn, maxRetries: Infinity, ms })
}

// ---------------------------------------------------------------------------
// Provider-abort-aware retry classification (provider-reliability advisory)
//
// A mid-turn provider abort is only recoverable when retrying the SAME call is
// warranted. `content_filter` is NOT: a blind identical replay re-symptoms the
// boundary hit instead of recovering — it needs a session reseat + RERUN, not a
// retry. The classifier below distinguishes recoverable (timeout, provider_error,
// route-failed/transient) from terminal (content_filter, non-recoverable at the
// call layer) so the venue-watch path can back off the former and never
// blind-retry the latter.
// ---------------------------------------------------------------------------

export const ProviderAbortClassSchema = {
  NONE: 'none',
  RECOVERABLE: 'recoverable',
  TERMINAL: 'terminal'
} as const
export type ProviderAbortClass =
  (typeof ProviderAbortClassSchema)[keyof typeof ProviderAbortClassSchema]

function errorIdentity(error: unknown): string {
  if (error instanceof Error) return `${error.name} ${error.message}`
  return String(error)
}

// Classify a provider/route abort into a retry decision. content_filter is the
// one terminal case: no retry at the call layer — reseat + rerun required.
export function classifyProviderAbort(error: unknown): ProviderAbortClass {
  const identity = errorIdentity(error).toLowerCase()
  if (identity.includes('content_filter') || identity.includes('content filter')) {
    return ProviderAbortClassSchema.TERMINAL
  }
  if (isTimeoutError(error)) return ProviderAbortClassSchema.RECOVERABLE
  if (
    identity.includes('provider_error') ||
    identity.includes('route-failed') ||
    identity.includes('mid-turn') ||
    identity.includes('abort')
  ) {
    return ProviderAbortClassSchema.RECOVERABLE
  }
  return ProviderAbortClassSchema.NONE
}

// Variable backoff for recoverable provider aborts: 1s, 2s, then 5s, capped (max
// 3 attempts). Not used for terminal aborts (never blind-retried).
const PROVIDER_BACKOFF_MS = [1000, 2000, 5000]

// Provider-abort-aware retry wrapper for the venue-watch call path: back off and
// retry definitively-recoverable provider errors; do NOT retry a terminal
// content_filter (throw through immediately so the caller reseats + reruns
// instead of replaying an identical rebound).
export async function retryProviderAware<T>(params: {
  fn: () => Promise<T>
  maxRetries?: number
  logError?: boolean
}): Promise<T> {
  const maxRetries = params.maxRetries ?? 3
  const backoffs = PROVIDER_BACKOFF_MS
  let retriesSoFar = 0

  return await new Promise<T>((resolve, reject) => {
    const attempt = (): void => {
      params
        .fn()
        .then(resolve)
        .catch((error: unknown) => {
          if (isShutdownRequested()) {
            reject(new ShutdownError())
            return
          }
          const attemptIndex = Math.min(retriesSoFar, backoffs.length - 1)
          const backoffMs = backoffs[attemptIndex] ?? 1000
          const cls = classifyProviderAbort(error)
          if (cls === ProviderAbortClassSchema.TERMINAL) {
            reject(error)
            return
          }
          if (cls !== ProviderAbortClassSchema.RECOVERABLE) {
            reject(error)
            return
          }
          if (retriesSoFar >= maxRetries) {
            reject(error)
            return
          }
          if (params.logError !== false) {
            console.error('Provider abort — backing off', error, { module: 'async-control' })
          }
          retriesSoFar += 1
          const timer = setTimeout(() => {
            removeListener()
            attempt()
          }, backoffMs)
          const removeListener = addShutdownListener(() => {
            clearTimeout(timer)
            reject(new ShutdownError())
          })
        })
    }

    attempt()
  })
}
