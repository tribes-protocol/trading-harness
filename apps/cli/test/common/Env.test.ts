import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * Regression guard for the retirement of the static per-sandbox key.
 *
 * The harness used to short-circuit `API_BEARER_TOKEN` to `process.env.TRIBES_API_KEY`
 * when the control plane injected it. That reliance is dropped (P25 #1994): the sole
 * bearer is now the ES256 JWT minted from the in-VM P-256 agent key and persisted to
 * `.env` as `API_BEARER_TOKEN`. `TRIBES_API_KEY` must no longer be read anywhere.
 */
describe('Env API_BEARER_TOKEN', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
    // Env.ts requires PRIVY_APP_ID under a non-production NODE_ENV (vitest = 'test').
    vi.stubEnv('PRIVY_APP_ID', 'test-privy-app-id')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test('resolves from API_BEARER_TOKEN and ignores the retired TRIBES_API_KEY', async () => {
    vi.stubEnv('API_BEARER_TOKEN', 'jwt-from-env')
    vi.stubEnv('TRIBES_API_KEY', 'static-sandbox-key')

    const { API_BEARER_TOKEN } = await import('@/common/Env')

    expect(API_BEARER_TOKEN).toBe('jwt-from-env')
  })

  test('does not fall back to TRIBES_API_KEY when no bearer token is set', async () => {
    vi.stubEnv('API_BEARER_TOKEN', '')
    vi.stubEnv('TRIBES_API_KEY', 'static-sandbox-key')

    const { API_BEARER_TOKEN } = await import('@/common/Env')

    expect(API_BEARER_TOKEN).toBe('')
  })
})
