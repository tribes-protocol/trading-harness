/**
 * The gateway's single console wrapper. Nothing else in the app touches
 * `console` directly, so log formatting and the eventual switch to a real sink
 * are a one-file change.
 */

function timestamp(): string {
  return new Date().toISOString()
}

export function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  return 'unknown error'
}

export function logInfo(message: string): void {
  console.log(`${timestamp()} info  ${message}`)
}

export function logWarn(message: string): void {
  console.warn(`${timestamp()} warn  ${message}`)
}

export function logError(message: string, error: unknown): void {
  console.error(`${timestamp()} error ${message}: ${describeError(error)}`)
}
