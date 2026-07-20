import { createPublicKey } from 'node:crypto'

import { jwtVerify } from 'jose'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@/helpers/CliLoginKey', () => ({
  writeCliLoginKey: vi.fn().mockResolvedValue(undefined)
}))
vi.mock('@/helpers/AuthKey', () => ({
  writeAgentAuthorizationKey: vi.fn().mockResolvedValue(undefined)
}))
vi.mock('@/helpers/WalletSnapshot', () => ({
  clearWalletSnapshot: vi.fn().mockResolvedValue(undefined)
}))
vi.mock('@/helpers/OpenUrlInBrowser', () => ({
  openUrlInBrowser: vi.fn().mockResolvedValue(true)
}))
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn().mockRejectedValue(new Error('no .env')),
  writeFile: vi.fn().mockResolvedValue(undefined)
}))
// Keep signLoginProof real; only stub the bearer mint (reads the auth key from disk).
vi.mock('@/helpers/Jwt', async (importActual) => {
  const actual = await importActual<typeof import('@/helpers/Jwt')>()
  return {
    ...actual,
    getApiBearerToken: vi.fn().mockResolvedValue('bearer-token')
  }
})

describe('LoginService', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  test('poll attaches an ES256 X-Agent-Login-Proof that verifies against the login public key', async () => {
    vi.stubEnv('API_BASE_URL', 'https://api.example.com')
    vi.stubEnv('PRIVY_APP_ID', 'privy-app-id')

    let capturedInit: RequestInit | undefined
    const fetchSpy = vi.fn(
      async (_url: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
        capturedInit = init
        return new Response('{"sandboxId":"sandbox-1","userId":"user-1"}', {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      }
    )
    vi.stubGlobal('fetch', fetchSpy)

    const { openUrlInBrowser } = await import('@/helpers/OpenUrlInBrowser')
    const { LoginService } = await import('@/services/LoginService')

    await new LoginService().runLogin()

    // The login page URL carries the requestId (`id`) and the public key the server
    // stores as agentPublicKey (`pubKey`, base64url(DER) SPKI).
    const openedUrl = new URL(vi.mocked(openUrlInBrowser).mock.calls[0]?.[0] ?? '')
    const requestId = openedUrl.searchParams.get('id') ?? ''
    const pubKeyCompact = openedUrl.searchParams.get('pubKey') ?? ''
    expect(requestId).not.toBe('')
    expect(pubKeyCompact).not.toBe('')

    const headers = new Headers(capturedInit?.headers)
    const proof = headers.get('X-Agent-Login-Proof')
    expect(proof).not.toBeNull()

    const publicKey = createPublicKey({
      key: Buffer.from(pubKeyCompact, 'base64url'),
      format: 'der',
      type: 'spki'
    })
    const { payload, protectedHeader } = await jwtVerify(proof ?? '', publicKey, {
      algorithms: ['ES256'],
      requiredClaims: ['exp']
    })

    expect(protectedHeader.alg).toBe('ES256')
    expect(payload.sub).toBe(requestId)
    expect(typeof payload.exp).toBe('number')
  })
})
