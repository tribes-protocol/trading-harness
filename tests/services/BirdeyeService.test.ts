import { afterEach, describe, expect, it, vi } from 'vitest'

import { BirdeyeService } from '@/services/BirdeyeService'
import { ensureJsonTreeString } from '@/utils/Lang'

const TEST_API_KEY = 'test-birdeye-key'
const SOL_ADDRESS = 'So11111111111111111111111111111111111111112'
const BONK_ADDRESS = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(ensureJsonTreeString(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

function makeService(apiKey = TEST_API_KEY): BirdeyeService {
  return new BirdeyeService({ apiKey })
}

describe('BirdeyeService', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps requested price addresses in order, drops unknowns, and sends key + chain headers', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          [SOL_ADDRESS]: {
            value: 171.42,
            updateUnixTime: 1784560000,
            priceChange24h: -2.1,
            liquidity: 45000000
          },
          [BONK_ADDRESS]: null
        }
      })
    )

    const result = await makeService().getPrices({
      addresses: [SOL_ADDRESS, BONK_ADDRESS, 'no-such-address'],
      chain: 'solana'
    })

    expect(result).toEqual({
      source: 'birdeye',
      chain: 'solana',
      prices: [
        {
          address: SOL_ADDRESS,
          price_usd: 171.42,
          change_24h_pct: -2.1,
          liquidity_usd: 45000000,
          updated_at: 1784560000
        }
      ]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.origin).toBe('https://public-api.birdeye.so')
    expect(requestUrl.pathname).toBe('/defi/multi_price')
    expect(requestUrl.searchParams.get('list_address')).toBe(
      `${SOL_ADDRESS},${BONK_ADDRESS},no-such-address`
    )
    expect(requestUrl.searchParams.get('include_liquidity')).toBe('true')
    expect(fetchSpy.mock.calls[0]?.[1]?.headers).toMatchObject({
      'X-API-KEY': TEST_API_KEY,
      'x-chain': 'solana'
    })
  })

  it('shapes the token overview and forwards a non-default chain header', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          address: SOL_ADDRESS,
          symbol: 'SOL',
          name: 'Wrapped SOL',
          price: 171.42,
          marketCap: 81000000000,
          fdv: 101000000000,
          liquidity: 45000000,
          v24hUSD: 2100000000,
          trade24h: 950000,
          holder: 1250000,
          uniqueWallet24h: 210000,
          priceChange1hPercent: 0.4,
          priceChange24hPercent: -2.1
        }
      })
    )

    const result = await makeService().getOverview({ address: SOL_ADDRESS, chain: 'ethereum' })

    expect(result).toEqual({
      source: 'birdeye',
      chain: 'ethereum',
      address: SOL_ADDRESS,
      symbol: 'SOL',
      name: 'Wrapped SOL',
      price_usd: 171.42,
      market_cap_usd: 81000000000,
      fdv_usd: 101000000000,
      liquidity_usd: 45000000,
      volume_24h_usd: 2100000000,
      trades_24h: 950000,
      holders: 1250000,
      unique_wallets_24h: 210000,
      change_1h_pct: 0.4,
      change_24h_pct: -2.1
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/defi/token_overview')
    expect(requestUrl.searchParams.get('address')).toBe(SOL_ADDRESS)
    expect(fetchSpy.mock.calls[0]?.[1]?.headers).toMatchObject({ 'x-chain': 'ethereum' })
  })

  it('shapes the token security flags', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          creatorAddress: 'CreatorAddr111',
          ownerAddress: null,
          creationTime: 1690000000,
          creatorPercentage: 0.012,
          ownerPercentage: null,
          top10HolderBalance: 123456789,
          top10HolderPercent: 0.42,
          mutableMetadata: false,
          freezeable: null,
          freezeAuthority: null,
          nonTransferable: null,
          transferFeeEnable: null
        }
      })
    )

    const result = await makeService().getSecurity({ address: BONK_ADDRESS, chain: 'solana' })

    expect(result).toEqual({
      source: 'birdeye',
      chain: 'solana',
      address: BONK_ADDRESS,
      creator_address: 'CreatorAddr111',
      owner_address: null,
      created_at: 1690000000,
      creator_pct: 0.012,
      owner_pct: null,
      top10_holder_pct: 0.42,
      mutable_metadata: false,
      freezeable: null,
      freeze_authority: null,
      non_transferable: null,
      transfer_fee_enabled: null
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/defi/token_security')
  })

  it('lists top holders with the requested limit', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          items: [
            { owner: 'Owner111', token_account: 'Account111', ui_amount: 1234567.89 },
            { owner: 'Owner222', token_account: 'Account222', ui_amount: 98765.4 }
          ]
        }
      })
    )

    const result = await makeService().getHolders({
      address: BONK_ADDRESS,
      limit: 2,
      chain: 'solana'
    })

    expect(result.holders).toEqual([
      { owner: 'Owner111', token_account: 'Account111', ui_amount: 1234567.89 },
      { owner: 'Owner222', token_account: 'Account222', ui_amount: 98765.4 }
    ])

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/defi/v3/token/holder')
    expect(requestUrl.searchParams.get('address')).toBe(BONK_ADDRESS)
    expect(requestUrl.searchParams.get('offset')).toBe('0')
    expect(requestUrl.searchParams.get('limit')).toBe('2')
  })

  it('flattens recent swaps and requests newest-first swaps only', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          items: [
            {
              txHash: 'TxHash111',
              blockUnixTime: 1784560000,
              side: 'buy',
              source: 'raydium',
              owner: 'Trader111',
              volumeUSD: 1520.5,
              from: { symbol: 'USDC', address: 'UsdcAddr', uiAmount: 1520.5 },
              to: { symbol: 'BONK', address: BONK_ADDRESS, uiAmount: 61500000 }
            }
          ]
        }
      })
    )

    const result = await makeService().getTrades({
      address: BONK_ADDRESS,
      limit: 10,
      chain: 'solana'
    })

    expect(result.trades).toEqual([
      {
        tx_hash: 'TxHash111',
        block_unix_time: 1784560000,
        side: 'buy',
        dex: 'raydium',
        owner: 'Trader111',
        from_symbol: 'USDC',
        from_amount: 1520.5,
        to_symbol: 'BONK',
        to_amount: 61500000,
        volume_usd: 1520.5
      }
    ])

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/defi/txs/token')
    expect(requestUrl.searchParams.get('tx_type')).toBe('swap')
    expect(requestUrl.searchParams.get('sort_type')).toBe('desc')
    expect(requestUrl.searchParams.get('limit')).toBe('10')
  })

  it('shapes trending tokens ordered by rank', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          updateUnixTime: 1784560000,
          tokens: [
            {
              address: BONK_ADDRESS,
              symbol: 'BONK',
              name: 'Bonk',
              rank: 1,
              price: 0.0000312,
              price24hChangePercent: 14.2,
              volume24hUSD: 98000000,
              liquidity: 21000000,
              marketcap: 2400000000
            }
          ]
        }
      })
    )

    const result = await makeService().getTrending({ limit: 5, chain: 'solana' })

    expect(result.tokens).toEqual([
      {
        address: BONK_ADDRESS,
        symbol: 'BONK',
        name: 'Bonk',
        rank: 1,
        price_usd: 0.0000312,
        change_24h_pct: 14.2,
        volume_24h_usd: 98000000,
        liquidity_usd: 21000000,
        market_cap_usd: 2400000000
      }
    ])

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/defi/token_trending')
    expect(requestUrl.searchParams.get('sort_by')).toBe('rank')
    expect(requestUrl.searchParams.get('sort_type')).toBe('asc')
    expect(requestUrl.searchParams.get('limit')).toBe('5')
  })

  it('shapes new listings with liquidity and listing source', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          items: [
            {
              address: 'NewToken111',
              symbol: 'NEW',
              name: 'New Token',
              liquidity: 54000,
              liquidityAddedAt: '2026-07-22T09:15:00',
              source: 'pumpfun'
            }
          ]
        }
      })
    )

    const result = await makeService().getNewListings({ limit: 5, chain: 'solana' })

    expect(result.tokens).toEqual([
      {
        address: 'NewToken111',
        symbol: 'NEW',
        name: 'New Token',
        liquidity_usd: 54000,
        listed_at: '2026-07-22T09:15:00',
        dex: 'pumpfun'
      }
    ])

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/defi/v2/tokens/new_listing')
    expect(requestUrl.searchParams.get('limit')).toBe('5')
  })

  it('maps ohlcv items into the shared candle contract with t in epoch ms', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          items: [
            { unix_time: 1784556400, o: 170.1, h: 172.4, l: 169.8, c: 171.42, v: 125000 },
            { unix_time: 1784560000, o: 171.42, h: 171.9, l: 170.5, c: 170.9, v: null }
          ]
        }
      })
    )

    const result = await makeService().getOhlcv({
      address: SOL_ADDRESS,
      timeframe: '1H',
      from: 1784550000,
      to: 1784560000,
      chain: 'solana'
    })

    expect(result).toEqual({
      source: 'birdeye',
      candles: [
        { t: 1784556400000, o: 170.1, h: 172.4, l: 169.8, c: 171.42, v: 125000 },
        { t: 1784560000000, o: 171.42, h: 171.9, l: 170.5, c: 170.9, v: null }
      ]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/defi/v3/ohlcv')
    expect(requestUrl.searchParams.get('address')).toBe(SOL_ADDRESS)
    expect(requestUrl.searchParams.get('type')).toBe('1H')
    expect(requestUrl.searchParams.get('time_from')).toBe('1784550000')
    expect(requestUrl.searchParams.get('time_to')).toBe('1784560000')
  })

  it('defaults the ohlcv window to 200 candles ending now when from/to are omitted', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ success: true, data: { items: [] } }))

    const result = await makeService().getOhlcv({
      address: SOL_ADDRESS,
      timeframe: '15m',
      from: null,
      to: null,
      chain: 'solana'
    })

    expect(result).toEqual({ source: 'birdeye', candles: [] })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    const timeFrom = Number(requestUrl.searchParams.get('time_from'))
    const timeTo = Number(requestUrl.searchParams.get('time_to'))
    expect(Number.isFinite(timeFrom)).toBe(true)
    expect(Number.isFinite(timeTo)).toBe(true)
    expect(timeTo - timeFrom).toBe(200 * 900)
  })

  it('shapes the wallet portfolio with USD totals', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          wallet: 'Wallet111',
          totalUsd: 1893.42,
          items: [
            {
              address: SOL_ADDRESS,
              symbol: 'SOL',
              name: 'Wrapped SOL',
              uiAmount: 10.5,
              priceUsd: 171.42,
              valueUsd: 1799.91
            },
            {
              address: 'UsdcAddr',
              symbol: 'USDC',
              uiAmount: 93.51,
              priceUsd: 1,
              valueUsd: 93.51
            }
          ]
        }
      })
    )

    const result = await makeService().getWalletPortfolio({
      wallet: 'Wallet111',
      chain: 'solana'
    })

    expect(result).toEqual({
      source: 'birdeye',
      chain: 'solana',
      wallet: 'Wallet111',
      total_usd: 1893.42,
      tokens: [
        {
          address: SOL_ADDRESS,
          symbol: 'SOL',
          name: 'Wrapped SOL',
          ui_amount: 10.5,
          price_usd: 171.42,
          value_usd: 1799.91
        },
        {
          address: 'UsdcAddr',
          symbol: 'USDC',
          ui_amount: 93.51,
          price_usd: 1,
          value_usd: 93.51
        }
      ]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/v1/wallet/token_list')
    expect(requestUrl.searchParams.get('wallet')).toBe('Wallet111')
  })

  it('throws the unavailable message without calling fetch when the key is unset', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    await expect(
      makeService('').getOverview({ address: SOL_ADDRESS, chain: 'solana' })
    ).rejects.toThrow(
      'BIRDEYE_API_KEY is not set — the `token-data` command group is unavailable on this box'
    )
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('throws on provider errors with status and truncated body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"success":false,"message":"rate limited"}', {
        status: 429,
        statusText: 'Too Many Requests'
      })
    )

    const error = await makeService()
      .getOverview({ address: SOL_ADDRESS, chain: 'solana' })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(Error)
    if (error instanceof Error) {
      expect(error.message).toContain('BirdEye /defi/token_overview failed: 429 Too Many Requests')
      expect(error.message).not.toContain(TEST_API_KEY)
    }
  })
})
