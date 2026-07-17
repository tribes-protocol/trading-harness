import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { Connection } from '@solana/web3.js'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { NATIVE_MINT } from '@/types/Solana'
import { ensureJsonTreeString } from '@/utils/Lang'

const EVM_RECIPIENT = '0x2222222222222222222222222222222222222222'
const ERC20_TOKEN = '0xaf88d065e77c8cc2239327c5edb3a432268e5831'
const SOL_SENDER = '11111111111111111111111111111111'
const SOL_RECIPIENT = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'
const SPL_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

function createMockSolConnection(params?: { destinationAccountExists?: boolean }): Connection {
  return {
    getLatestBlockhash: vi.fn().mockResolvedValue({
      blockhash: '11111111111111111111111111111111'
    }),
    getAccountInfo: vi
      .fn()
      .mockResolvedValue(params?.destinationAccountExists ? { data: Buffer.alloc(1) } : null)
  } as unknown as Connection
}

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
    vi.stubEnv('PRIVY_APP_ID', 'privy-app-id')

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
      const walletService = new WalletService({
        cwd,
        solConnection: createMockSolConnection()
      })
      await walletService.listWallets()
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }

    const headers = new Headers(capturedInit?.headers)
    expect(headers.get('Authorization')).toBe('Bearer token-from-env')
  })

  test('listAssets calls agent assets endpoint with bearer auth and parses PnL', async () => {
    vi.stubEnv('API_BASE_URL', 'https://api.example.com')
    vi.stubEnv('API_BEARER_TOKEN', 'token-from-env')
    vi.stubEnv('PRIVY_APP_ID', 'privy-app-id')

    let capturedUrl = ''
    let capturedInit: RequestInit | undefined
    const fetchSpy = vi.fn(
      async (url: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
        capturedUrl = String(url)
        capturedInit = init
        return new Response(
          ensureJsonTreeString({
            assets: [
              {
                kind: 'erc20',
                address: ERC20_TOKEN,
                name: 'USD Coin',
                symbol: 'USDC',
                decimals: 6,
                chainId: 8453,
                logo: null,
                verified: 'verified',
                wallet: '0x1111111111111111111111111111111111111111',
                balance: '150',
                balanceUsd: '150',
                usdPrice: '1',
                usdPrice24hrPercentChange: '0.1',
                pnl: {
                  address: ERC20_TOKEN,
                  pnl: {
                    realized_profit_usd: '20',
                    realized_profit_percent: '5.7',
                    unrealized_usd: '10',
                    unrealized_percent: '7.1',
                    total_usd: '30',
                    total_percent: '6'
                  }
                }
              }
            ],
            summary: {
              pnl: {
                realized_profit_usd: '125',
                unrealized_usd: '25',
                total_usd: '150'
              }
            }
          }),
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
      const walletService = new WalletService({
        cwd,
        solConnection: createMockSolConnection()
      })
      const assets = await walletService.listAssets({
        walletAddresses: ['0x1111111111111111111111111111111111111111'],
        chainIds: undefined
      })
      expect(assets.assets[0]?.pnl?.pnl.total_usd.toNumber()).toBe(30)
      expect(assets.summary.pnl.total_usd.toNumber()).toBe(150)
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }

    const headers = new Headers(capturedInit?.headers)
    expect(capturedUrl).toContain('/agent/assets?')
    expect(headers.get('Accept')).toBe('application/json')
    expect(headers.get('Authorization')).toBe('Bearer token-from-env')
  })

  test('buildEthTransfer returns native transfer txData', async () => {
    vi.stubEnv('API_BASE_URL', 'https://api.example.com')
    vi.stubEnv('API_BEARER_TOKEN', 'token-from-env')
    vi.stubEnv('PRIVY_APP_ID', 'privy-app-id')

    const { WalletService } = await import('@/services/WalletService')
    const walletService = new WalletService({
      cwd: process.cwd(),
      solConnection: createMockSolConnection()
    })
    const response = walletService.buildEthTransfer({
      chainId: 8453,
      tokenId: 'network',
      amount: 1_000_000_000_000_000_000n,
      toAddress: EVM_RECIPIENT
    })

    expect(response).toEqual({
      chainId: 8453,
      to: EVM_RECIPIENT,
      data: '0x',
      value: 1_000_000_000_000_000_000n
    })
  })

  test('buildEthTransfer returns ERC-20 transfer calldata', async () => {
    vi.stubEnv('API_BASE_URL', 'https://api.example.com')
    vi.stubEnv('API_BEARER_TOKEN', 'token-from-env')
    vi.stubEnv('PRIVY_APP_ID', 'privy-app-id')

    const { WalletService } = await import('@/services/WalletService')
    const walletService = new WalletService({
      cwd: process.cwd(),
      solConnection: createMockSolConnection()
    })
    const response = walletService.buildEthTransfer({
      chainId: 42161,
      tokenId: ERC20_TOKEN,
      amount: 5_000_000n,
      toAddress: EVM_RECIPIENT
    })

    expect(response).toEqual({
      chainId: 42161,
      to: ERC20_TOKEN,
      value: 0n,
      data: expect.stringMatching(/^0x[a-f0-9]+$/)
    })
    expect(response.data.length).toBeGreaterThan(10)
  })

  test('buildSolTransfer returns native SOL instruction', async () => {
    vi.stubEnv('API_BASE_URL', 'https://api.example.com')
    vi.stubEnv('API_BEARER_TOKEN', 'token-from-env')
    vi.stubEnv('PRIVY_APP_ID', 'privy-app-id')

    const { WalletService } = await import('@/services/WalletService')
    const walletService = new WalletService({
      cwd: process.cwd(),
      solConnection: createMockSolConnection()
    })
    const response = await walletService.buildSolTransfer({
      chainId: 'solana',
      tokenId: NATIVE_MINT,
      amount: 1_000_000n,
      toAddress: SOL_RECIPIENT,
      fromAddress: SOL_SENDER
    })

    expect(typeof response).toBe('string')
    expect(response.length).toBeGreaterThan(10)
  })

  test('buildSolTransfer returns SPL transfer instruction with ATA creation', async () => {
    vi.stubEnv('API_BASE_URL', 'https://api.example.com')
    vi.stubEnv('API_BEARER_TOKEN', 'token-from-env')
    vi.stubEnv('PRIVY_APP_ID', 'privy-app-id')

    const mockConnection = createMockSolConnection({ destinationAccountExists: false })
    const { WalletService } = await import('@/services/WalletService')
    const walletService = new WalletService({
      cwd: process.cwd(),
      solConnection: mockConnection
    })
    const response = await walletService.buildSolTransfer({
      chainId: 'solana',
      tokenId: SPL_MINT,
      amount: 2_500_000n,
      toAddress: SOL_RECIPIENT,
      fromAddress: SOL_SENDER
    })

    expect(typeof response).toBe('string')
    expect(mockConnection.getAccountInfo).toHaveBeenCalled()
  })
})
