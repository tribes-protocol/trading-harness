/**
 * Unwrap an error chain into one readable report.
 *
 * The Hyperliquid SDK wraps ANY wallet.signTypedData rejection into
 * `AbstractWalletError("Failed to sign typed data with viem wallet", { cause })`
 * (node_modules/@nktkas/hyperliquid/src/signing/_abstractWallet.ts:191), so a
 * plain `error.message` hides the true reason — the real server status/body from
 * `/agent/transaction/signEthTypedDataV4`, a wallet-key error, or a transport
 * failure. This walks `.cause` (cycle-guarded, depth-capped) and joins every
 * link so the chained reason surfaces instead of the pushed wrapper.
 */
export function unwrapCause(error: unknown): string {
  const lines: string[] = []
  const seen = new Set<unknown>()
  let current: unknown = error

  for (let depth = 0; depth < 16; depth += 1) {
    if (current === null || current === undefined) break
    if (typeof current !== 'object') {
      lines.push(String(current))
      break
    }
    if (seen.has(current)) {
      lines.push('(cause cycle detected — stopping)')
      break
    }
    seen.add(current)

    if (current instanceof Error) {
      const name = current.name && current.name !== 'Error' ? current.name : 'Error'
      lines.push(`${name}: ${current.message}`)
    } else {
      lines.push(String(current))
    }

    const cause = readCause(current)
    if (cause === undefined || cause === null) break
    current = cause
  }

  if (lines.length === 0) return String(error)
  return lines.join('  → caused by: ')
}

function readCause(error: object): unknown {
  if (error instanceof Error) return error.cause
  const descriptor = Object.getOwnPropertyDescriptor(error, 'cause')
  if (descriptor === undefined) return undefined
  return descriptor.value
}
