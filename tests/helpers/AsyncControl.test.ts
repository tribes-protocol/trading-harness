import { describe, expect, test, vi } from 'vitest'

import {
  classifyProviderAbort,
  ProviderAbortClassSchema,
  retryProviderAware
} from '@/helpers/AsyncControl'

describe('classifyProviderAbort', () => {
  test('content_filter is terminal (never blind-retried)', () => {
    const error = new Error('content_filter: provider refused the turn')
    expect(classifyProviderAbort(error)).toBe(ProviderAbortClassSchema.TERMINAL)
  })

  test('provider_error / route-failed / mid-turn abort are recoverable', () => {
    expect(classifyProviderAbort(new Error('provider_error upstream'))).toBe(
      ProviderAbortClassSchema.RECOVERABLE
    )
    expect(classifyProviderAbort(new Error('route-failed: no replay'))).toBe(
      ProviderAbortClassSchema.RECOVERABLE
    )
    expect(classifyProviderAbort(new Error('mid-turn abort'))).toBe(
      ProviderAbortClassSchema.RECOVERABLE
    )
  })

  test('timeouts are recoverable', () => {
    const timeout = new Error('request timed out')
    timeout.name = 'TimeoutError'
    expect(classifyProviderAbort(timeout)).toBe(ProviderAbortClassSchema.RECOVERABLE)
  })

  test('unrelated errors are not provider aborts', () => {
    expect(classifyProviderAbort(new Error('ECONNREFUSED'))).toBe(ProviderAbortClassSchema.NONE)
  })

  test('HTTP rate-limit (429) is recoverable', () => {
    const http429 = new Error('429 Too Many Requests')
    http429.name = 'HttpRequestError'
    expect(classifyProviderAbort(http429)).toBe(ProviderAbortClassSchema.RECOVERABLE)
    expect(classifyProviderAbort(new Error('rate limit exceeded'))).toBe(
      ProviderAbortClassSchema.RECOVERABLE
    )
  })
})

describe('retryProviderAware', () => {
  test('retries recoverable provider errors with backoff, then resolves', async () => {
    let calls = 0
    const fn = vi.fn(async () => {
      calls += 1
      if (calls < 3) throw new Error('provider_error upstream')
      return 'ok'
    })
    const result = await retryProviderAware({ fn })
    expect(result).toBe('ok')
    expect(calls).toBe(3)
  })

  test('does NOT retry a terminal content_filter — throws through immediately', async () => {
    const fn = vi.fn(async () => {
      throw new Error('content_filter: unrecoverable at call layer')
    })
    await expect(retryProviderAware({ fn })).rejects.toThrow('content_filter')
    expect(fn).toHaveBeenCalledTimes(1) // exactly one attempt, no blind replay
  })

  test('gives up after maxRetries on a persistent recoverable error', async () => {
    let calls = 0
    const fn = vi.fn(async () => {
      calls += 1
      throw new Error('provider_error')
    })
    await expect(retryProviderAware({ fn, maxRetries: 2 })).rejects.toThrow('provider_error')
    expect(calls).toBe(3) // initial + 2 retries
  })
})