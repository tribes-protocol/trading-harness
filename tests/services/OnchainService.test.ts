import { mkdtemp, readdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { OnchainService } from '@/services/OnchainService'
import { ensureJsonTreeString, isRecord } from '@/utils/Lang'

const MORALIS_KEY = 'test-moralis-key'
const ALCHEMY_KEY = 'test-alchemy-key'
const HELIUS_KEY = 'test-helius-key'

const EVM_ADDRESS = '0xAbCd000000000000000000000000000000001234'
const SOLANA_ADDRESS = 'So1anaWa11etAddre55xxxxxxxxxxxxxxxxxxxxx'

let cacheBase = ''

function buildService(params?: {
  moralisApiKey?: string
  alchemyApiKey?: string
  heliusApiKey?: string
}): OnchainService {
  return new OnchainService({
    moralisApiKey: params?.moralisApiKey ?? '',
    alchemyApiKey: params?.alchemyApiKey ?? '',
    heliusApiKey: params?.heliusApiKey ?? ''
  })
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(ensureJsonTreeString(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

function requestBodyText(init: RequestInit | undefined): string {
  return typeof init?.body === 'string' ? init.body : ''
}

function parseJsonRpcBody(init: RequestInit | undefined): Record<string, unknown> {
  const parsed: unknown = JSON.parse(requestBodyText(init))
  if (!isRecord(parsed)) {
    throw new Error('expected a JSON-RPC request body object')
  }
  return parsed
}

function headerValue(init: RequestInit | undefined, name: string): string | null {
  const headers = init?.headers
  if (isRecord(headers)) {
    const value = headers[name]
    return typeof value === 'string' ? value : null
  }
  return null
}

describe('OnchainService', () => {
  beforeEach(async () => {
    cacheBase = await mkdtemp(join(tmpdir(), 'cache-'))
    process.env.TRIBES_PROVIDER_CACHE_BASE = cacheBase
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.TRIBES_PROVIDER_CACHE_BASE
  })

  describe('balances', () => {
    it('fetches EVM balances via Moralis, nulls native token_address, sorts by usd desc and truncates', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse({
          result: [
            {
              token_address: '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270',
              symbol: 'ETH',
              name: 'Ether',
              decimals: 18,
              balance: '1500000000000000000',
              balance_formatted: '1.5',
              native_token: true,
              usd_value: 4500
            },
            {
              token_address: '0xtokenA',
              symbol: 'AAA',
              name: 'Token A',
              decimals: 18,
              balance_formatted: '3',
              native_token: false,
              usd_value: 10
            },
            {
              token_address: '0xtokenB',
              symbol: 'BBB',
              name: 'Token B',
              decimals: 6,
              balance_formatted: '2',
              native_token: false,
              usd_value: null
            },
            {
              token_address: '0xtokenC',
              symbol: 'CCC',
              name: 'Token C',
              decimals: 18,
              balance_formatted: '7',
              native_token: false,
              usd_value: 100
            }
          ]
        })
      )

      const service = buildService({ moralisApiKey: MORALIS_KEY, alchemyApiKey: ALCHEMY_KEY })
      const result = await service.getBalances({ address: EVM_ADDRESS, chainId: 1, limit: 3 })

      expect(result.source).toBe('moralis')
      expect(result.chain_id).toBe(1)
      expect(result.assets).toHaveLength(3)
      expect(result.assets.map((asset) => asset.symbol)).toEqual(['ETH', 'CCC', 'AAA'])
      expect(result.assets[0].token_address).toBeNull()
      expect(result.assets[0].amount).toBe(1.5)

      const [urlArg, initArg] = fetchSpy.mock.calls[0]
      const urlText = String(urlArg)
      expect(urlText).toContain('https://deep-index.moralis.io/api/v2.2/wallets/')
      expect(urlText).toContain(`${EVM_ADDRESS}/tokens`)
      expect(urlText).toContain('chain=eth')
      expect(urlText).toContain('exclude_spam=true')
      expect(headerValue(initArg, 'X-API-Key')).toBe(MORALIS_KEY)
    })

    it('serves EVM balances from Alchemy when Moralis is unconfigured, scaling hex balances by decimals', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(async (input, init): Promise<Response> => {
          const body = parseJsonRpcBody(init)
          expect(String(input)).toBe(`https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`)
          if (body.method === 'alchemy_getTokenBalances') {
            return jsonResponse({
              jsonrpc: '2.0',
              id: 1,
              result: {
                address: EVM_ADDRESS,
                tokenBalances: [
                  // 1e18 -> amount 1 at 18 decimals
                  { contractAddress: '0xToken1', tokenBalance: '0x0de0b6b3a7640000' },
                  {
                    contractAddress: '0xZeroToken',
                    tokenBalance:
                      '0x0000000000000000000000000000000000000000000000000000000000000000'
                  },
                  // 1e9 -> amount 1 at 9 decimals
                  { contractAddress: '0xToken2', tokenBalance: '0x3b9aca00' }
                ]
              }
            })
          }
          if (body.method === 'alchemy_getTokenMetadata') {
            const contract = Array.isArray(body.params) ? body.params[0] : null
            if (contract === '0xToken1') {
              return jsonResponse({
                jsonrpc: '2.0',
                id: 1,
                result: { name: 'Token One', symbol: 'TK1', decimals: 18, logo: null }
              })
            }
            return jsonResponse({
              jsonrpc: '2.0',
              id: 1,
              result: { name: 'Token Two', symbol: 'TK2', decimals: 9, logo: null }
            })
          }
          throw new Error(`unexpected method ${String(body.method)}`)
        })

      const service = buildService({ alchemyApiKey: ALCHEMY_KEY })
      const result = await service.getBalances({ address: EVM_ADDRESS, chainId: 1, limit: 50 })

      expect(result.source).toBe('alchemy')
      expect(result.assets).toHaveLength(2)
      expect(result.assets.map((asset) => asset.symbol).sort()).toEqual(['TK1', 'TK2'])
      for (const asset of result.assets) {
        expect(asset.amount).toBe(1)
        expect(asset.usd_value).toBeNull()
      }
      // 1 balances call + 2 metadata calls (zero balance filtered before metadata)
      expect(fetchSpy).toHaveBeenCalledTimes(3)

      // No API key may ever land in cache keys or cached entries — the Alchemy
      // URL contains the key, so cache keys must be built from logical parts.
      const cacheDir = join(cacheBase, '.tribes/provider-cache')
      const files = await readdir(cacheDir)
      expect(files.length).toBeGreaterThan(0)
      for (const file of files) {
        const text = await readFile(join(cacheDir, file), 'utf8')
        expect(text).not.toContain(ALCHEMY_KEY)
      }
    })

    it('caps Alchemy metadata lookups at --limit', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(async (_input, init): Promise<Response> => {
          const body = parseJsonRpcBody(init)
          if (body.method === 'alchemy_getTokenBalances') {
            return jsonResponse({
              jsonrpc: '2.0',
              id: 1,
              result: {
                address: EVM_ADDRESS,
                tokenBalances: [
                  { contractAddress: '0xToken1', tokenBalance: '0x01' },
                  { contractAddress: '0xToken2', tokenBalance: '0x02' },
                  { contractAddress: '0xToken3', tokenBalance: '0x03' }
                ]
              }
            })
          }
          return jsonResponse({
            jsonrpc: '2.0',
            id: 1,
            result: { name: 'Token', symbol: 'TKN', decimals: 0, logo: null }
          })
        })

      const service = buildService({ alchemyApiKey: ALCHEMY_KEY })
      const result = await service.getBalances({ address: EVM_ADDRESS, chainId: 8453, limit: 1 })

      expect(result.assets).toHaveLength(1)
      // 1 balances call + only 1 metadata call despite 3 nonzero tokens
      expect(fetchSpy).toHaveBeenCalledTimes(2)
    })

    it('falls back to Alchemy when the Moralis request fails', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init): Promise<Response> => {
        if (String(input).includes('deep-index.moralis.io')) {
          return jsonResponse({ message: 'bad request' }, 400)
        }
        const body = parseJsonRpcBody(init)
        if (body.method === 'alchemy_getTokenBalances') {
          return jsonResponse({
            jsonrpc: '2.0',
            id: 1,
            result: {
              address: EVM_ADDRESS,
              tokenBalances: [{ contractAddress: '0xToken1', tokenBalance: '0x0de0b6b3a7640000' }]
            }
          })
        }
        return jsonResponse({
          jsonrpc: '2.0',
          id: 1,
          result: { name: 'Token One', symbol: 'TK1', decimals: 18, logo: null }
        })
      })

      const service = buildService({ moralisApiKey: MORALIS_KEY, alchemyApiKey: ALCHEMY_KEY })
      const result = await service.getBalances({ address: EVM_ADDRESS, chainId: 1, limit: 10 })

      expect(result.source).toBe('alchemy')
      expect(result.assets).toHaveLength(1)
      expect(result.assets[0].amount).toBe(1)
    })

    it('fetches Solana balances via Helius searchAssets with native balance and prices', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(async (input, init): Promise<Response> => {
          expect(String(input)).toBe(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`)
          const body = parseJsonRpcBody(init)
          expect(body.method).toBe('searchAssets')
          expect(body.params).toEqual({
            ownerAddress: SOLANA_ADDRESS,
            tokenType: 'fungible',
            displayOptions: { showNativeBalance: true }
          })
          return jsonResponse({
            jsonrpc: '2.0',
            id: 1,
            result: {
              total: 1,
              limit: 1000,
              items: [
                {
                  id: 'BonkMint111111111111111111111111111111111111',
                  content: { metadata: { name: 'Bonk', symbol: 'Bonk' } },
                  token_info: {
                    symbol: 'BONK',
                    balance: 1000000000,
                    decimals: 5,
                    price_info: { price_per_token: 0.00002, total_price: 0.2, currency: 'usd' }
                  }
                }
              ],
              nativeBalance: { lamports: 2000000000, price_per_sol: 150, total_price: 300 }
            }
          })
        })

      const service = buildService({ heliusApiKey: HELIUS_KEY })
      const result = await service.getBalances({
        address: SOLANA_ADDRESS,
        chainId: 'solana',
        limit: 50
      })

      expect(result.source).toBe('helius')
      expect(result.chain_id).toBe('solana')
      expect(result.assets).toHaveLength(2)
      expect(result.assets[0]).toEqual({
        token_address: null,
        symbol: 'SOL',
        name: 'Solana',
        decimals: 9,
        amount: 2,
        usd_value: 300
      })
      expect(result.assets[1]).toEqual({
        token_address: 'BonkMint111111111111111111111111111111111111',
        symbol: 'BONK',
        name: 'Bonk',
        decimals: 5,
        amount: 10000,
        usd_value: 0.2
      })
      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    it('falls back to the Moralis Solana portfolio (no fabricated prices) when Helius is unconfigured', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse({
          nativeBalance: { solana: '1.5', lamports: '1500000000' },
          tokens: [
            {
              mint: 'WifMint1111111111111111111111111111111111111',
              name: 'dogwifhat',
              symbol: 'WIF',
              amount: '12.5',
              amountRaw: '12500000',
              decimals: 6
            }
          ]
        })
      )

      const service = buildService({ moralisApiKey: MORALIS_KEY })
      const result = await service.getBalances({
        address: SOLANA_ADDRESS,
        chainId: 'solana',
        limit: 50
      })

      expect(result.source).toBe('moralis')
      expect(result.assets).toHaveLength(2)
      for (const asset of result.assets) {
        expect(asset.usd_value).toBeNull()
      }
      const solAsset = result.assets.find((asset) => asset.symbol === 'SOL')
      expect(solAsset?.amount).toBe(1.5)
      expect(solAsset?.token_address).toBeNull()
      const wifAsset = result.assets.find((asset) => asset.symbol === 'WIF')
      expect(wifAsset?.amount).toBe(12.5)

      const urlText = String(fetchSpy.mock.calls[0][0])
      expect(urlText).toBe(
        `https://solana-gateway.moralis.io/account/mainnet/${SOLANA_ADDRESS}/portfolio`
      )
      expect(headerValue(fetchSpy.mock.calls[0][1], 'X-API-Key')).toBe(MORALIS_KEY)
    })
  })

  describe('net worth', () => {
    it('fetches Moralis net worth with chains[i] params and normalizes string numbers', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse({
          total_networth_usd: '123.45',
          chains: [
            { chain: 'eth', networth_usd: '100' },
            { chain: 'base', networth_usd: '23.45' }
          ]
        })
      )

      const service = buildService({ moralisApiKey: MORALIS_KEY })
      const result = await service.getNetWorth({ address: EVM_ADDRESS, chainIds: [1, 8453] })

      expect(result).toEqual({
        source: 'moralis',
        address: EVM_ADDRESS,
        total_networth_usd: 123.45,
        chains: [
          { chain_id: 1, networth_usd: 100 },
          { chain_id: 8453, networth_usd: 23.45 }
        ]
      })

      const urlText = String(fetchSpy.mock.calls[0][0])
      expect(urlText).toContain(`/wallets/${EVM_ADDRESS}/net-worth`)
      expect(urlText).toContain('exclude_spam=true')
      expect(urlText).toContain('exclude_unverified_contracts=true')
      expect(decodeURIComponent(urlText)).toContain('chains[0]=eth')
      expect(decodeURIComponent(urlText)).toContain('chains[1]=base')
    })
  })

  describe('transfers', () => {
    it('merges Alchemy from/to pages by uniqueId, labels direction and sorts by block desc', async () => {
      const counterpartyIn = '0x1111111111111111111111111111111111111111'
      const counterpartyOut = '0x2222222222222222222222222222222222222222'
      const duplicate = {
        uniqueId: 'dup:external',
        blockNum: '0x30',
        hash: '0xdup',
        from: EVM_ADDRESS,
        to: EVM_ADDRESS,
        value: 2,
        asset: 'ETH',
        category: 'external',
        metadata: { blockTimestamp: '2026-07-03T00:00:00.000Z' }
      }
      const bodies: Record<string, unknown>[] = []
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(async (_input, init): Promise<Response> => {
          const body = parseJsonRpcBody(init)
          bodies.push(body)
          const filter = Array.isArray(body.params) ? body.params[0] : null
          if (isRecord(filter) && typeof filter.fromAddress === 'string') {
            return jsonResponse({
              jsonrpc: '2.0',
              id: 1,
              result: {
                transfers: [
                  {
                    uniqueId: 'out-1:external',
                    blockNum: '0x10',
                    hash: '0xout1',
                    from: EVM_ADDRESS,
                    to: counterpartyOut,
                    value: 1.5,
                    asset: 'ETH',
                    category: 'external',
                    metadata: { blockTimestamp: '2026-07-01T00:00:00.000Z' }
                  },
                  duplicate
                ]
              }
            })
          }
          return jsonResponse({
            jsonrpc: '2.0',
            id: 1,
            result: {
              transfers: [
                {
                  uniqueId: 'in-1:erc20',
                  blockNum: '0x20',
                  hash: '0xin1',
                  from: counterpartyIn,
                  to: EVM_ADDRESS,
                  value: 100,
                  asset: 'USDC',
                  category: 'erc20',
                  metadata: { blockTimestamp: '2026-07-02T00:00:00.000Z' }
                },
                duplicate
              ]
            }
          })
        })

      const service = buildService({ alchemyApiKey: ALCHEMY_KEY })
      const result = await service.getTransfers({ address: EVM_ADDRESS, chainId: 1, limit: 25 })

      expect(result.source).toBe('alchemy')
      expect(result.transfers).toHaveLength(3)
      expect(result.transfers.map((transfer) => transfer.hash)).toEqual([
        '0xdup',
        '0xin1',
        '0xout1'
      ])
      expect(result.transfers.map((transfer) => transfer.direction)).toEqual(['out', 'in', 'out'])
      expect(result.transfers[1].counterparty).toBe(counterpartyIn)
      expect(result.transfers[2].counterparty).toBe(counterpartyOut)
      expect(result.transfers[1].asset).toBe('USDC')
      expect(result.transfers[1].amount).toBe(100)
      expect(result.transfers[1].category).toBe('erc20')
      expect(result.transfers[1].timestamp).toBe('2026-07-02T00:00:00.000Z')

      expect(fetchSpy).toHaveBeenCalledTimes(2)
      const filters = bodies.map((body) => (Array.isArray(body.params) ? body.params[0] : null))
      const fromFilter = filters.find((filter) => isRecord(filter) && 'fromAddress' in filter)
      const toFilter = filters.find((filter) => isRecord(filter) && 'toAddress' in filter)
      expect(isRecord(fromFilter) && fromFilter.fromAddress).toBe(EVM_ADDRESS)
      expect(isRecord(toFilter) && toFilter.toAddress).toBe(EVM_ADDRESS)
      for (const filter of filters) {
        expect(isRecord(filter) && filter.maxCount).toBe('0x19')
        expect(isRecord(filter) && filter.order).toBe('desc')
        expect(isRecord(filter) && filter.withMetadata).toBe(true)
        expect(isRecord(filter) && filter.category).toEqual(['external', 'erc20'])
      }
    })

    it('routes BNB transfers to Moralis wallet history', async () => {
      const counterparty = '0x3333333333333333333333333333333333333333'
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse({
          result: [
            {
              hash: '0xbnb1',
              block_timestamp: '2026-07-10T12:00:00.000Z',
              category: 'token send',
              summary: 'Sent 5 CAKE',
              from_address: EVM_ADDRESS.toLowerCase(),
              to_address: counterparty,
              erc20_transfers: [{ token_symbol: 'CAKE', value_formatted: '5' }],
              native_transfers: []
            }
          ]
        })
      )

      const service = buildService({
        moralisApiKey: MORALIS_KEY,
        alchemyApiKey: ALCHEMY_KEY
      })
      const result = await service.getTransfers({ address: EVM_ADDRESS, chainId: 56, limit: 25 })

      expect(result.source).toBe('moralis')
      expect(result.chain_id).toBe(56)
      expect(result.transfers).toEqual([
        {
          hash: '0xbnb1',
          timestamp: '2026-07-10T12:00:00.000Z',
          direction: 'out',
          counterparty,
          asset: 'CAKE',
          amount: 5,
          category: 'token send'
        }
      ])

      const urlText = String(fetchSpy.mock.calls[0][0])
      expect(urlText).toContain(
        `https://deep-index.moralis.io/api/v2.2/wallets/${EVM_ADDRESS}/history`
      )
      expect(urlText).toContain('chain=bsc')
      expect(urlText).toContain('order=DESC')
      expect(urlText).toContain('limit=25')
    })

    it('maps Helius enhanced transactions with token, native and ambiguous cases', async () => {
      const other = 'OtherWa11etAddre55yyyyyyyyyyyyyyyyyyyyyy'
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse([
          {
            signature: 'sig1',
            type: 'TRANSFER',
            source: 'SYSTEM_PROGRAM',
            timestamp: 1730000000,
            tokenTransfers: [
              {
                fromUserAccount: other,
                toUserAccount: SOLANA_ADDRESS,
                mint: 'MintX111111111111111111111111111111111111111',
                tokenAmount: 42
              }
            ],
            nativeTransfers: []
          },
          {
            signature: 'sig2',
            type: 'UNKNOWN',
            source: 'SYSTEM_PROGRAM',
            timestamp: null,
            tokenTransfers: [],
            nativeTransfers: [
              { fromUserAccount: SOLANA_ADDRESS, toUserAccount: other, amount: 1000000000 }
            ]
          },
          {
            signature: 'sig3',
            type: 'SWAP',
            source: 'JUPITER',
            timestamp: 1730000100,
            tokenTransfers: [],
            nativeTransfers: []
          }
        ])
      )

      const service = buildService({ heliusApiKey: HELIUS_KEY })
      const result = await service.getTransfers({
        address: SOLANA_ADDRESS,
        chainId: 'solana',
        limit: 10
      })

      expect(result.source).toBe('helius')
      expect(result.chain_id).toBe('solana')
      expect(result.transfers).toHaveLength(3)
      expect(result.transfers[0]).toEqual({
        hash: 'sig1',
        timestamp: new Date(1730000000 * 1000).toISOString(),
        direction: 'in',
        counterparty: other,
        asset: 'MintX111111111111111111111111111111111111111',
        amount: 42,
        category: 'TRANSFER'
      })
      expect(result.transfers[1]).toEqual({
        hash: 'sig2',
        timestamp: null,
        direction: 'out',
        counterparty: other,
        asset: 'SOL',
        amount: 1,
        category: 'UNKNOWN'
      })
      expect(result.transfers[2].direction).toBeNull()
      expect(result.transfers[2].counterparty).toBeNull()
      expect(result.transfers[2].asset).toBeNull()
      expect(result.transfers[2].amount).toBeNull()
      expect(result.transfers[2].category).toBe('SWAP')

      const urlText = String(fetchSpy.mock.calls[0][0])
      expect(urlText).toContain(
        `https://api-mainnet.helius-rpc.com/v0/addresses/${SOLANA_ADDRESS}/transactions`
      )
      expect(urlText).toContain(`api-key=${HELIUS_KEY}`)
      expect(urlText).toContain('limit=10')
    })
  })

  describe('configuration and secret hygiene', () => {
    it('throws env-var errors without fetching when providers are unconfigured', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
      const service = buildService()

      await expect(
        service.getBalances({ address: EVM_ADDRESS, chainId: 1, limit: 10 })
      ).rejects.toThrow(
        'MORALIS_API_KEY and ALCHEMY_API_KEY are not set; onchain EVM balances are disabled'
      )
      await expect(
        service.getBalances({ address: SOLANA_ADDRESS, chainId: 'solana', limit: 10 })
      ).rejects.toThrow(
        'HELIUS_API_KEY and MORALIS_API_KEY are not set; onchain Solana balances are disabled'
      )
      await expect(service.getNetWorth({ address: EVM_ADDRESS, chainIds: [1] })).rejects.toThrow(
        'MORALIS_API_KEY is not set; onchain net-worth is disabled'
      )
      await expect(
        service.getTransfers({ address: EVM_ADDRESS, chainId: 1, limit: 10 })
      ).rejects.toThrow('ALCHEMY_API_KEY is not set; onchain transfers on this chain is disabled')
      await expect(
        service.getTransfers({ address: EVM_ADDRESS, chainId: 56, limit: 10 })
      ).rejects.toThrow('MORALIS_API_KEY is not set; onchain transfers on this chain is disabled')
      await expect(
        service.getTransfers({ address: SOLANA_ADDRESS, chainId: 'solana', limit: 10 })
      ).rejects.toThrow('HELIUS_API_KEY is not set; onchain Solana transfers is disabled')

      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('redacts the Moralis key from provider error messages', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse({ message: `invalid key ${MORALIS_KEY}` }, 400)
      )

      const service = buildService({ moralisApiKey: MORALIS_KEY })
      const promise = service.getNetWorth({ address: EVM_ADDRESS, chainIds: [1] })
      await expect(promise).rejects.toThrow('moralis request')
      await promise.catch((error: unknown) => {
        expect(error).toBeInstanceOf(Error)
        if (error instanceof Error) {
          expect(error.message).not.toContain(MORALIS_KEY)
          expect(error.message).toContain('***')
        }
      })
    })

    it('redacts the Alchemy key from error messages even though it lives in the URL path', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ message: 'boom' }, 400))

      const service = buildService({ alchemyApiKey: ALCHEMY_KEY })
      const promise = service.getTransfers({ address: EVM_ADDRESS, chainId: 1, limit: 5 })
      await expect(promise).rejects.toThrow('alchemy request')
      await promise.catch((error: unknown) => {
        expect(error).toBeInstanceOf(Error)
        if (error instanceof Error) {
          expect(error.message).not.toContain(ALCHEMY_KEY)
          expect(error.message).toContain('/v2/***')
        }
      })
    })

    it('surfaces JSON-RPC error bodies as errors without the key', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse({
          jsonrpc: '2.0',
          id: 1,
          error: { code: -32600, message: `bad request for ${ALCHEMY_KEY}` }
        })
      )

      const service = buildService({ alchemyApiKey: ALCHEMY_KEY })
      const promise = service.getBalances({ address: EVM_ADDRESS, chainId: 1, limit: 5 })
      await expect(promise).rejects.toThrow('alchemy alchemy_getTokenBalances failed')
      await promise.catch((error: unknown) => {
        if (error instanceof Error) {
          expect(error.message).not.toContain(ALCHEMY_KEY)
        }
      })
    })
  })
})
