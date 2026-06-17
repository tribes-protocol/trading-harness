import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

describe('WalletService', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  test('listWallets sends Authorization header', async () => {
    vi.stubEnv('API_BASE_URL', 'https://api.example.com')
    vi.stubEnv('API_BEARER_TOKEN', 'token-from-env')

    let capturedInit: RequestInit | undefined
    const fetchSpy = vi.fn(
      async (_url: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
        capturedInit = init
        return new Response(
          '[{"evmWalletId":"evm-wallet-id","evmWalletAddress":"0x1111111111111111111111111111111111111111","solWalletId":"sol-wallet-id","solWalletAddress":"11111111111111111111111111111111"}]',
          {
            status: 200,
            headers: {
              'content-type': 'application/json'
            }
          }
        )
      }
    )
    vi.stubGlobal('fetch', fetchSpy)

    const { WalletService } = await import('@/services/WalletService')
    const cwd = await mkdtemp(join(tmpdir(), 'wallet-skill-test-'))
    try {
      const walletService = new WalletService({ cwd })
      await walletService.listWallets()
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }

    const headers = new Headers(capturedInit?.headers)
    expect(headers.get('Authorization')).toBe('Bearer token-from-env')
  })

  test('listAssets sends Authorization header', async () => {
    vi.stubEnv('API_BASE_URL', 'https://api.example.com')
    vi.stubEnv('API_BEARER_TOKEN', 'token-from-env')

    let capturedInit: RequestInit | undefined
    const fetchSpy = vi.fn(
      async (_url: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
        capturedInit = init
        return new Response('[]', {
          status: 200,
          headers: {
            'content-type': 'application/json'
          }
        })
      }
    )
    vi.stubGlobal('fetch', fetchSpy)

    const { WalletService } = await import('@/services/WalletService')
    const cwd = await mkdtemp(join(tmpdir(), 'wallet-skill-test-'))
    try {
      const walletService = new WalletService({ cwd })
      await walletService.listAssets({
        walletAddresses: ['0x1111111111111111111111111111111111111111'],
        chainIds: undefined
      })
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }

    const headers = new Headers(capturedInit?.headers)
    expect(headers.get('Accept')).toBe('application/json')
    expect(headers.get('Authorization')).toBe('Bearer token-from-env')
  })
})
