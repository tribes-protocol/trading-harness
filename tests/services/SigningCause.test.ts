import { describe, expect, test } from 'vitest'

import { unwrapCause } from '@/helpers/Cause'
import {
  HyperliquidSignReplayCommandOptionsSchema,
  HyperliquidSignReplayResultSchema
} from '@/types/Hyperliquid'

describe('unwrapCause', () => {
  test('surfaces the chained cause behind an SDK-wrapped signer error', () => {
    // The SDK wraps ANY wallet.signTypedData rejection into AbstractWalletError
    // with {cause}. A plain .message hid the real 403 (the bug that froze the
    // desk's close). unwrapCause must walk to the true reason.
    const terminalError = new Error(
      'Failed to sign Ethereum typed data: 403 Forbidden{"error":"Agent wallet does not belong to caller"}'
    )
    const sdkWrapper = new Error('Failed to sign typed data with viem wallet', {
      cause: terminalError
    })

    const report = unwrapCause(sdkWrapper)
    expect(report).toContain('Failed to sign typed data with viem wallet')
    expect(report).toContain('caused by')
    expect(report).toContain('403 Forbidden')
    expect(report).toContain('Agent wallet does not belong to caller')
  })

  test('is cycle-safe and finite for a circular cause chain', () => {
    const a = new Error('a')
    const b = new Error('b', { cause: a })
    ;(a as { cause?: unknown }).cause = b

    const report = unwrapCause(a)
    expect(report).toContain('cause cycle detected')
  })

  test('handles non-error values and empty chains', () => {
    expect(unwrapCause('boom')).toBe('boom')
    expect(unwrapCause(new Error('plain')).length).toBeGreaterThan(0)
  })
})

describe('HyperliquidSignReplayCommandOptionsSchema', () => {
  test('defaults to market reduce-only (diagnostic, no broadcast)', () => {
    const parsed = HyperliquidSignReplayCommandOptionsSchema.parse({
      from: '0xbb64c24a6b2ee1185621490d2a1ae06522f15f57',
      coin: 'BTC',
      amount: '0.02166',
      side: 'short',
      walletId: 'abc'
    })
    expect(parsed.type).toBe('market')
    expect(parsed.reduceOnly).toBe(true)
  })
})

describe('HyperliquidSignReplayResultSchema', () => {
  test('accepts the SDK Signature shape {r,s,v} on success', () => {
    const parsed = HyperliquidSignReplayResultSchema.parse({
      kind: 'sign-replay',
      broadcast: false,
      coin: 'BTC',
      side: 'short',
      nonce: 1,
      timestamp: 2,
      ok: true,
      signature: {
        r: '0x' + 'ab'.repeat(32),
        s: '0x' + 'cd'.repeat(32),
        v: 28
      }
    })
    expect(parsed.ok).toBe(true)
  })

  test('accepts the unwrapped failure cause on error', () => {
    const parsed = HyperliquidSignReplayResultSchema.parse({
      kind: 'sign-replay',
      broadcast: false,
      coin: 'BTC',
      side: 'short',
      nonce: 1,
      timestamp: 2,
      ok: false,
      error:
        'AbstractWalletError: Failed to sign typed data with viem wallet → caused by: 403 Forbidden'
    })
    expect(parsed.ok).toBe(false)
  })
})
