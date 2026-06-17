import { logger } from '@shared/utils/Logger'

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
            logger.error('Retry attempt failed', {
              error,
              details: {
                module: 'async-control'
              }
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
