import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { MockInstance } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TokenDataService } from '@/services/TokenDataService'
import { ensureJsonTreeString } from '@/utils/Lang'

const BIRDEYE_KEY = 'test-birdeye-key'
const MORALIS_KEY = 'test-moralis-key'
const COINGECKO_KEY = 'test-coingecko-key'

type ServiceKeyOverrides = {
  birdeyeApiKey?: string
  moralisApiKey?: string
  coinGeckoProApiKey?: string
}

function buildService(overrides: ServiceKeyOverrides = {}): TokenDataService {
  return new TokenDataService({
    birdeyeApiKey: BIRDEYE_KEY,
    moralisApiKey: MORALIS_KEY,
    coinGeckoProApiKey: COINGECKO_KEY,
    ...overrides
  })
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(ensureJsonTreeString(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

function capturedRequest(
  fetchSpy: MockInstance<typeof fetch>,
  index: number
): { url: URL; headers: Headers } {
  const call = fetchSpy.mock.calls[index]
  if (!call) {
    throw new Error(`expected a fetch call at index ${index}`)
  }
  const [input, init] = call
  const url = input instanceof URL ? input : new URL(String(input))
  return { url, headers: new Headers(init?.headers) }
}

describe('TokenDataService', () => {
  beforeEach(async () => {
    process.env.TRIBES_PROVIDER_CACHE_BASE = await mkdtemp(join(tmpdir(), 'cache-'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.TRIBES_PROVIDER_CACHE_BASE
  })

  describe('getPrice', () => {
    it('fetches a Birdeye price with API key and chain slug headers', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse({
          success: true,
          data: { value: 1.23, updateUnixTime: 1721000000, liquidity: 456.7 }
        })
      )

      const result = await buildService().getPrice({ address: '0xabc', chainId: 1 })

      expect(result).toEqual({
        source: 'birdeye',
        address: '0xabc',
        chain_id: 1,
        price_usd: 1.23,
        liquidity_usd: 456.7,
        updated_at: 1721000000
      })
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const { url, headers } = capturedRequest(fetchSpy, 0)
      expect(url.origin).toBe('https://public-api.birdeye.so')
      expect(url.pathname).toBe('/defi/price')
      expect(url.searchParams.get('address')).toBe('0xabc')
      expect(url.searchParams.get('include_liquidity')).toBe('true')
      expect(headers.get('x-api-key')).toBe(BIRDEYE_KEY)
      expect(headers.get('x-chain')).toBe('ethereum')
    })

    it('falls through to Moralis when Birdeye returns success:false on HTTP 200', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(jsonResponse({ success: false, message: 'no data' }))
        .mockResolvedValueOnce(jsonResponse({ usdPrice: 2.5, pairTotalLiquidityUsd: '123.45' }))

      const result = await buildService().getPrice({ address: '0xabc', chainId: 8453 })

      expect(result).toEqual({
        source: 'moralis',
        address: '0xabc',
        chain_id: 8453,
        price_usd: 2.5,
        liquidity_usd: 123.45,
        updated_at: null
      })
      expect(fetchSpy).toHaveBeenCalledTimes(2)
      const { url, headers } = capturedRequest(fetchSpy, 1)
      expect(url.origin).toBe('https://deep-index.moralis.io')
      expect(url.pathname).toBe('/api/v2.2/erc20/0xabc/price')
      expect(url.searchParams.get('chain')).toBe('base')
      expect(headers.get('x-api-key')).toBe(MORALIS_KEY)
    })

    it('routes the Solana fallback to the Moralis Solana gateway', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(jsonResponse({ usdPrice: 0.5 }))
      const service = buildService({ birdeyeApiKey: '' })

      const result = await service.getPrice({ address: 'MintAddr111', chainId: 'solana' })

      expect(result).toEqual({
        source: 'moralis',
        address: 'MintAddr111',
        chain_id: 'solana',
        price_usd: 0.5,
        liquidity_usd: null,
        updated_at: null
      })
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const { url } = capturedRequest(fetchSpy, 0)
      expect(url.origin).toBe('https://solana-gateway.moralis.io')
      expect(url.pathname).toBe('/token/mainnet/MintAddr111/price')
    })

    it('throws naming every provider when none are configured, without fetching', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
      const service = buildService({ birdeyeApiKey: '', moralisApiKey: '' })

      const error: unknown = await service
        .getPrice({ address: '0xabc', chainId: 1 })
        .catch((caught: unknown) => caught)

      expect(error).toBeInstanceOf(Error)
      expect(String(error)).toContain('BIRDEYE_API_KEY is not set')
      expect(String(error)).toContain('MORALIS_API_KEY is not set')
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('never leaks the API key through aggregated provider errors', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(`{"success":false,"message":"bad key ${BIRDEYE_KEY}"}`, {
          status: 400,
          statusText: 'Bad Request'
        })
      )
      const service = buildService({ moralisApiKey: '' })

      const error: unknown = await service
        .getPrice({ address: '0xabc', chainId: 1 })
        .catch((caught: unknown) => caught)

      expect(error).toBeInstanceOf(Error)
      expect(String(error)).toContain('birdeye')
      expect(String(error)).toContain('moralis: MORALIS_API_KEY is not set')
      expect(String(error)).not.toContain(BIRDEYE_KEY)
    })
  })

  describe('getOverview', () => {
    it('parses CoinGecko onchain string-numbers when Birdeye fails', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(jsonResponse({ success: false, message: 'plan gated' }))
        .mockResolvedValueOnce(
          jsonResponse({
            data: {
              id: 'polygon_pos_0xabc',
              type: 'token',
              attributes: {
                name: 'Test Token',
                symbol: 'TST',
                decimals: 18,
                price_usd: '1.5',
                fdv_usd: '1000000.25',
                total_reserve_in_usd: '50000.5',
                volume_usd: { h24: '2500.75' },
                market_cap_usd: null
              }
            }
          })
        )

      const result = await buildService().getOverview({ address: '0xabc', chainId: 137 })

      expect(result).toEqual({
        source: 'coingecko-onchain',
        address: '0xabc',
        chain_id: 137,
        name: 'Test Token',
        symbol: 'TST',
        decimals: 18,
        price_usd: 1.5,
        market_cap_usd: null,
        fdv_usd: 1000000.25,
        liquidity_usd: 50000.5,
        volume_24h_usd: 2500.75,
        price_change_24h_pct: null,
        holders: null
      })
      expect(fetchSpy).toHaveBeenCalledTimes(2)
      const { url, headers } = capturedRequest(fetchSpy, 1)
      expect(url.origin).toBe('https://pro-api.coingecko.com')
      expect(url.pathname).toBe('/api/v3/onchain/networks/polygon_pos/tokens/0xabc')
      expect(headers.get('x-cg-pro-api-key')).toBe(COINGECKO_KEY)
    })

    it('normalizes a Birdeye overview on the happy path', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse({
          success: true,
          data: {
            name: 'Wrapped SOL',
            symbol: 'SOL',
            decimals: 9,
            price: 150.25,
            marketCap: 70000000000,
            fdv: 88000000000,
            liquidity: 12000000,
            v24hUSD: 950000000,
            priceChange24hPercent: -2.15,
            holder: 1234567
          }
        })
      )

      const result = await buildService().getOverview({
        address: 'So11111111111111111111111111111111111111112',
        chainId: 'solana'
      })

      expect(result.source).toBe('birdeye')
      expect(result.market_cap_usd).toBe(70000000000)
      expect(result.holders).toBe(1234567)
      expect(result.price_change_24h_pct).toBe(-2.15)
      const { headers } = capturedRequest(fetchSpy, 0)
      expect(headers.get('x-chain')).toBe('solana')
    })
  })

  describe('getOhlcv', () => {
    it('normalizes candles sorted by time and passes the interval enum value', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse({
          success: true,
          data: {
            items: [
              { unixTime: 200, o: 2, h: 3, l: 1, c: 2.5, v: 10 },
              { unixTime: 100, o: 1, h: 2, l: 0.5, c: 1.5, v: 5 }
            ]
          }
        })
      )

      const result = await buildService().getOhlcv({
        address: '0xabc',
        chainId: 1,
        interval: '1H',
        limit: 2,
        timeFrom: 1000,
        timeTo: 8200
      })

      expect(result).toEqual({
        source: 'birdeye',
        address: '0xabc',
        chain_id: 1,
        interval: '1H',
        candles: [
          { time_s: 100, open: 1, high: 2, low: 0.5, close: 1.5, volume: 5 },
          { time_s: 200, open: 2, high: 3, low: 1, close: 2.5, volume: 10 }
        ]
      })
      const { url } = capturedRequest(fetchSpy, 0)
      expect(url.pathname).toBe('/defi/ohlcv')
      expect(url.searchParams.get('type')).toBe('1H')
      expect(url.searchParams.get('time_from')).toBe('1000')
      expect(url.searchParams.get('time_to')).toBe('8200')
      expect(url.searchParams.get('currency')).toBe('usd')
    })

    it('throws the env-var message without fetching when Birdeye is unconfigured', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
      const service = buildService({ birdeyeApiKey: '' })

      await expect(
        service.getOhlcv({
          address: '0xabc',
          chainId: 1,
          interval: '1H',
          limit: 10,
          timeFrom: null,
          timeTo: null
        })
      ).rejects.toThrow('BIRDEYE_API_KEY is not set')
      expect(fetchSpy).not.toHaveBeenCalled()
    })
  })

  describe('getSecurity', () => {
    it('normalizes GoPlus-style EVM string flags and leaves Solana checks null', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse({
          success: true,
          data: {
            isHoneypot: '0',
            buyTax: '0.02',
            sellTax: '',
            isMintable: '1',
            isProxy: '0',
            isOpenSource: '1',
            canTakeBackOwnership: '0',
            hiddenOwner: '1',
            ownerAddress: '0xowner',
            ownerPercentage: '5.5',
            creatorAddress: '0xcreator',
            creatorPercentage: '1.1',
            holderCount: '1000'
          }
        })
      )

      const result = await buildService().getSecurity({ address: '0xabc', chainId: 56 })

      expect(result.source).toBe('birdeye')
      expect(result.checks).toEqual({
        freezeable: null,
        freeze_authority: null,
        transfer_fee_enable: null,
        non_transferable: null,
        mutable_metadata: null,
        top10_holder_percent: null,
        owner_address: '0xowner',
        owner_percentage: 5.5,
        creator_address: '0xcreator',
        creator_percentage: 1.1,
        is_honeypot: false,
        buy_tax: 0.02,
        sell_tax: null,
        is_mintable: true,
        is_proxy: false,
        is_open_source: true,
        can_take_back_ownership: false,
        hidden_owner: true
      })
      const { headers } = capturedRequest(fetchSpy, 0)
      expect(headers.get('x-chain')).toBe('bsc')
    })

    it('normalizes Solana security fields and leaves EVM checks null', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse({
          success: true,
          data: {
            freezeable: false,
            freezeAuthority: null,
            transferFeeEnable: false,
            nonTransferable: null,
            mutableMetadata: true,
            top10HolderPercent: 0.42,
            ownerAddress: null,
            ownerPercentage: null,
            creatorAddress: 'CreatorAddr',
            creatorPercentage: 0.01
          }
        })
      )

      const result = await buildService().getSecurity({ address: 'MintAddr', chainId: 'solana' })

      expect(result.checks.freezeable).toBe(false)
      expect(result.checks.mutable_metadata).toBe(true)
      expect(result.checks.top10_holder_percent).toBe(0.42)
      expect(result.checks.creator_percentage).toBe(0.01)
      expect(result.checks.is_honeypot).toBeNull()
      expect(result.checks.buy_tax).toBeNull()
    })
  })

  describe('getHolders', () => {
    it('routes Solana holders to Birdeye and ranks by list order', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse({
          success: true,
          data: {
            items: [
              {
                owner: 'wallet1',
                ui_amount: 1000.5,
                amount: '1000500000',
                decimals: 6,
                mint: 'MintAddr',
                token_account: 'TokenAcct1'
              },
              { owner: 'wallet2', ui_amount: 500 }
            ]
          }
        })
      )

      const result = await buildService().getHolders({
        address: 'MintAddr',
        chainId: 'solana',
        limit: 2
      })

      expect(result).toEqual({
        source: 'birdeye',
        address: 'MintAddr',
        chain_id: 'solana',
        holders: [
          { rank: 1, owner_address: 'wallet1', amount: 1000.5, pct_of_supply: null },
          { rank: 2, owner_address: 'wallet2', amount: 500, pct_of_supply: null }
        ]
      })
      const { url, headers } = capturedRequest(fetchSpy, 0)
      expect(url.origin).toBe('https://public-api.birdeye.so')
      expect(url.pathname).toBe('/defi/v3/token/holder')
      expect(url.searchParams.get('limit')).toBe('2')
      expect(url.searchParams.get('offset')).toBe('0')
      expect(headers.get('x-chain')).toBe('solana')
    })

    it('routes EVM holders to Moralis owners with DESC ordering', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse({
          result: [
            {
              owner_address: '0xdead',
              balance: '1234500000000000000000',
              balance_formatted: '1234.5',
              percentage_relative_to_total_supply: 12.5,
              is_contract: false
            }
          ]
        })
      )

      const result = await buildService().getHolders({
        address: '0xabc',
        chainId: 137,
        limit: 5
      })

      expect(result).toEqual({
        source: 'moralis',
        address: '0xabc',
        chain_id: 137,
        holders: [{ rank: 1, owner_address: '0xdead', amount: 1234.5, pct_of_supply: 12.5 }]
      })
      const { url, headers } = capturedRequest(fetchSpy, 0)
      expect(url.origin).toBe('https://deep-index.moralis.io')
      expect(url.pathname).toBe('/api/v2.2/erc20/0xabc/owners')
      expect(url.searchParams.get('chain')).toBe('polygon')
      expect(url.searchParams.get('order')).toBe('DESC')
      expect(url.searchParams.get('limit')).toBe('5')
      expect(headers.get('x-api-key')).toBe(MORALIS_KEY)
    })
  })

  describe('getTrending', () => {
    it('fetches Birdeye trending tokens ranked ascending, nullable-defensively', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse({
          success: true,
          data: {
            updateUnixTime: 1721000000,
            tokens: [
              {
                address: 'Mint1',
                rank: 1,
                name: 'Token One',
                symbol: 'ONE',
                price: 0.1,
                volume24hUSD: 1000,
                liquidity: 500
              },
              { address: 'Mint2' }
            ]
          }
        })
      )

      const result = await buildService().getTrending({ chainId: 'solana', limit: 20 })

      expect(result).toEqual({
        source: 'birdeye',
        chain_id: 'solana',
        tokens: [
          {
            rank: 1,
            address: 'Mint1',
            name: 'Token One',
            symbol: 'ONE',
            price_usd: 0.1,
            volume_24h_usd: 1000,
            liquidity_usd: 500
          },
          {
            rank: null,
            address: 'Mint2',
            name: null,
            symbol: null,
            price_usd: null,
            volume_24h_usd: null,
            liquidity_usd: null
          }
        ]
      })
      const { url, headers } = capturedRequest(fetchSpy, 0)
      expect(url.pathname).toBe('/defi/token_trending')
      expect(url.searchParams.get('sort_by')).toBe('rank')
      expect(url.searchParams.get('sort_type')).toBe('asc')
      expect(url.searchParams.get('limit')).toBe('20')
      expect(headers.get('x-chain')).toBe('solana')
    })
  })
})
