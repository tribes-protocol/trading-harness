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

  it('maps pair ohlcv items into the shared candle contract from the pair endpoint', async () => {
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

    const result = await makeService().getPairOhlcv({
      address: 'PairAddress1111111111111111111111111111111',
      timeframe: '1D',
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
    expect(requestUrl.pathname).toBe('/defi/v3/ohlcv/pair')
    expect(requestUrl.searchParams.get('address')).toBe(
      'PairAddress1111111111111111111111111111111'
    )
    expect(requestUrl.searchParams.get('type')).toBe('1D')
    expect(requestUrl.searchParams.get('time_from')).toBe('1784550000')
    expect(requestUrl.searchParams.get('time_to')).toBe('1784560000')
    expect(fetchSpy.mock.calls[0]?.[1]?.headers).toMatchObject({ 'x-chain': 'solana' })
  })

  it('shapes token search results, drops market groups, and sends keyword + chain params', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          items: [
            {
              type: 'token',
              result: [
                {
                  address: BONK_ADDRESS,
                  symbol: 'BONK',
                  name: 'Bonk',
                  network: 'solana',
                  price: 0.0000312,
                  liquidity: 21000000,
                  volume_24h_usd: 98000000
                },
                { symbol: 'GHOST', name: 'No Address Token' }
              ]
            },
            { type: 'market', result: [{ address: 'PairAddr111', name: 'BONK-SOL' }] }
          ]
        }
      })
    )

    const result = await makeService().getSearch({ keyword: 'bonk', chain: 'solana', limit: 5 })

    expect(result).toEqual({
      source: 'birdeye',
      chain: 'solana',
      keyword: 'bonk',
      results: [
        {
          address: BONK_ADDRESS,
          symbol: 'BONK',
          name: 'Bonk',
          price_usd: 0.0000312,
          liquidity_usd: 21000000,
          volume_24h_usd: 98000000,
          network: 'solana'
        }
      ]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/defi/v3/search')
    expect(requestUrl.searchParams.get('keyword')).toBe('bonk')
    expect(requestUrl.searchParams.get('chain')).toBe('solana')
    expect(requestUrl.searchParams.get('target')).toBe('token')
    expect(requestUrl.searchParams.get('search_by')).toBe('combination')
    expect(requestUrl.searchParams.get('sort_by')).toBe('volume_24h_usd')
    expect(requestUrl.searchParams.get('sort_type')).toBe('desc')
    expect(requestUrl.searchParams.get('limit')).toBe('5')
    expect(fetchSpy.mock.calls[0]?.[1]?.headers).toMatchObject({
      'X-API-KEY': TEST_API_KEY,
      'x-chain': 'solana'
    })
  })

  it('defaults search to all chains and 20 results when chain and limit are omitted', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ success: true, data: { items: [] } }))

    const result = await makeService().getSearch({ keyword: 'bonk', chain: null, limit: null })

    expect(result).toEqual({ source: 'birdeye', chain: 'all', keyword: 'bonk', results: [] })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.searchParams.get('chain')).toBe('all')
    expect(requestUrl.searchParams.get('limit')).toBe('20')
    expect(fetchSpy.mock.calls[0]?.[1]?.headers).toMatchObject({ 'x-chain': 'all' })
  })

  it('shapes mint/burn transactions and requests all types newest-first', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          items: [
            {
              tx_hash: 'MintTx111',
              block_time: 1784560000,
              common_type: 'mint',
              ui_amount: 5000000,
              slot: 312345678
            },
            {
              tx_hash: 'BurnTx222',
              block_time: 1784550000,
              common_type: 'burn',
              ui_amount: 120000,
              slot: 312345000
            }
          ]
        }
      })
    )

    const result = await makeService().getMintBurns({
      address: BONK_ADDRESS,
      limit: 2,
      chain: 'solana'
    })

    expect(result).toEqual({
      source: 'birdeye',
      chain: 'solana',
      address: BONK_ADDRESS,
      transactions: [
        {
          tx_hash: 'MintTx111',
          block_unix_time: 1784560000,
          type: 'mint',
          amount: 5000000,
          slot: 312345678
        },
        {
          tx_hash: 'BurnTx222',
          block_unix_time: 1784550000,
          type: 'burn',
          amount: 120000,
          slot: 312345000
        }
      ]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/defi/v3/token/mint-burn-txs')
    expect(requestUrl.searchParams.get('address')).toBe(BONK_ADDRESS)
    expect(requestUrl.searchParams.get('sort_by')).toBe('block_time')
    expect(requestUrl.searchParams.get('sort_type')).toBe('desc')
    expect(requestUrl.searchParams.get('type')).toBe('all')
    expect(requestUrl.searchParams.get('offset')).toBe('0')
    expect(requestUrl.searchParams.get('limit')).toBe('2')
  })

  it('shapes token creation info', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          decimals: 5,
          symbol: 'BONK',
          name: 'Bonk',
          mint: BONK_ADDRESS,
          creator: 'CreatorAddr111',
          txHash: 'DeployTx111',
          slot: 168000000,
          blockHumanTime: '2022-12-25T12:00:00',
          blockUnixTime: 1671969600
        }
      })
    )

    const result = await makeService().getCreationInfo({
      address: BONK_ADDRESS,
      chain: 'solana'
    })

    expect(result).toEqual({
      source: 'birdeye',
      chain: 'solana',
      address: BONK_ADDRESS,
      symbol: 'BONK',
      name: 'Bonk',
      decimals: 5,
      creator: 'CreatorAddr111',
      tx_hash: 'DeployTx111',
      slot: 168000000,
      created_at: 1671969600
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/defi/token_creation_info')
    expect(requestUrl.searchParams.get('address')).toBe(BONK_ADDRESS)
  })

  it('returns null creation fields when BirdEye has no creation record', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ success: true, data: null }))

    const result = await makeService().getCreationInfo({
      address: BONK_ADDRESS,
      chain: 'solana'
    })

    expect(result).toEqual({
      source: 'birdeye',
      chain: 'solana',
      address: BONK_ADDRESS
    })
  })

  it('shapes exit-liquidity from data.items, matches checksummed EVM keys case-insensitively, and drops unknowns', async () => {
    // Real shape: data.items is an ARRAY; the USD figure is `exit_liquidity`,
    // and EVM chains echo the CHECKSUMMED address while callers pass lowercase.
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          items: [
            {
              token: '0x940181a94A35A4569E4529A3CDfB74e38FD98631',
              exit_liquidity: 75812362.09839873,
              liquidity: 151624724.19679746,
              currency: 'USD',
              address: '0x940181a94A35A4569E4529A3CDfB74e38FD98631',
              symbol: 'AERO'
            },
            {
              token: '0x4200000000000000000000000000000000000006',
              exit_liquidity: 91000,
              currency: 'USD',
              address: '0x4200000000000000000000000000000000000006',
              symbol: 'WETH'
            }
          ]
        }
      })
    )

    const result = await makeService().getExitLiquidity({
      addresses: [
        '0x940181a94a35a4569e4529a3cdfb74e38fd98631',
        '0x4200000000000000000000000000000000000006',
        '0xdeadbeef00000000000000000000000000000000'
      ],
      chain: 'base'
    })

    expect(result).toEqual({
      source: 'birdeye',
      chain: 'base',
      tokens: [
        {
          address: '0x940181a94a35a4569e4529a3cdfb74e38fd98631',
          exit_liquidity_usd: 75812362.09839873
        },
        { address: '0x4200000000000000000000000000000000000006', exit_liquidity_usd: 91000 }
      ]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/defi/v3/token/exit-liquidity/multiple')
    expect(requestUrl.searchParams.get('list_address')).toBe(
      '0x940181a94a35a4569e4529a3cdfb74e38fd98631,0x4200000000000000000000000000000000000006,0xdeadbeef00000000000000000000000000000000'
    )
    expect(fetchSpy.mock.calls[0]?.[1]?.headers).toMatchObject({ 'x-chain': 'base' })
  })

  it('shapes windowed trade-history totals and sends the time frame', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        success: true,
        data: [
          {
            address: BONK_ADDRESS,
            sell: 410000,
            buy: 540000,
            total_trade: 950000,
            volume_buy_usd: 51000000,
            volume_sell_usd: 47000000,
            total_volume_usd: 98000000
          }
        ]
      })
    )

    const result = await makeService().getTradeHistory({
      address: BONK_ADDRESS,
      timeFrame: '7d',
      chain: 'solana'
    })

    expect(result).toEqual({
      source: 'birdeye',
      chain: 'solana',
      address: BONK_ADDRESS,
      time_frame: '7d',
      stats: [
        {
          address: BONK_ADDRESS,
          buys: 540000,
          sells: 410000,
          total_trades: 950000,
          volume_buy_usd: 51000000,
          volume_sell_usd: 47000000,
          total_volume_usd: 98000000
        }
      ]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/defi/v3/all-time/trades/single')
    expect(requestUrl.searchParams.get('address')).toBe(BONK_ADDRESS)
    expect(requestUrl.searchParams.get('time_frame')).toBe('7d')
  })

  it('keeps requested trade-data addresses in order and drops unknowns', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          [BONK_ADDRESS]: {
            price: 0.0000312,
            price_change_1h_percent: 0.8,
            price_change_24h_percent: 14.2,
            trade_24h: 950000,
            buy_24h: 540000,
            sell_24h: 410000,
            volume_24h_usd: 98000000,
            volume_24h_change_percent: 22.5,
            unique_wallet_24h: 210000,
            holder: 1250000,
            last_trade_unix_time: 1784560000
          },
          [SOL_ADDRESS]: null
        }
      })
    )

    const result = await makeService().getTradeStats({
      addresses: [BONK_ADDRESS, SOL_ADDRESS, 'no-such-address'],
      chain: 'solana'
    })

    expect(result).toEqual({
      source: 'birdeye',
      chain: 'solana',
      tokens: [
        {
          address: BONK_ADDRESS,
          price_usd: 0.0000312,
          change_1h_pct: 0.8,
          change_24h_pct: 14.2,
          trades_24h: 950000,
          buys_24h: 540000,
          sells_24h: 410000,
          volume_24h_usd: 98000000,
          volume_24h_change_pct: 22.5,
          unique_wallets_24h: 210000,
          holders: 1250000,
          last_trade_at: 1784560000
        }
      ]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/defi/v3/token/trade-data/multiple')
    expect(requestUrl.searchParams.get('list_address')).toBe(
      `${BONK_ADDRESS},${SOL_ADDRESS},no-such-address`
    )
  })

  it('shapes the current wallet net worth and sends value-sorted pagination params', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          totalNetWorth: 1893.42,
          items: [
            {
              address: SOL_ADDRESS,
              symbol: 'SOL',
              uiAmount: 10.5,
              priceUsd: 171.42,
              valueUsd: 1799.91,
              allocation: 95.06
            }
          ]
        }
      })
    )

    const result = await makeService().getWalletNetWorth({
      wallet: 'Wallet111',
      limit: 20,
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
          ui_amount: 10.5,
          price_usd: 171.42,
          value_usd: 1799.91,
          cost_basis_usd: null,
          allocation_pct: 95.06
        }
      ]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/wallet/v2/current-net-worth')
    expect(requestUrl.searchParams.get('wallet')).toBe('Wallet111')
    expect(requestUrl.searchParams.get('sort_by')).toBe('value')
    expect(requestUrl.searchParams.get('sort_type')).toBe('desc')
    expect(requestUrl.searchParams.get('offset')).toBe('0')
    expect(requestUrl.searchParams.get('limit')).toBe('20')
    expect(fetchSpy.mock.calls[0]?.[1]?.headers).toMatchObject({
      'X-API-KEY': TEST_API_KEY,
      'x-chain': 'solana'
    })
  })

  it('shapes net-worth details, coalesces probed field casings, and sends interval + time', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          net_worth: 1000.5,
          holdings: [
            {
              token_address: BONK_ADDRESS,
              token_symbol: 'BONK',
              ui_amount: '3200000.5',
              value: 99.84,
              costBasisUsd: 70.1,
              weight: 9.98
            }
          ]
        }
      })
    )

    const result = await makeService().getWalletNetWorthDetails({
      wallet: 'Wallet111',
      interval: '1h',
      time: '2026-07-22 10:00:00',
      limit: 10,
      chain: 'solana'
    })

    expect(result).toEqual({
      source: 'birdeye',
      chain: 'solana',
      wallet: 'Wallet111',
      interval: '1h',
      time: '2026-07-22 10:00:00',
      total_usd: 1000.5,
      tokens: [
        {
          address: BONK_ADDRESS,
          symbol: 'BONK',
          ui_amount: 3200000.5,
          price_usd: null,
          value_usd: 99.84,
          cost_basis_usd: 70.1,
          allocation_pct: 9.98
        }
      ]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/wallet/v2/net-worth-details')
    expect(requestUrl.searchParams.get('wallet')).toBe('Wallet111')
    expect(requestUrl.searchParams.get('type')).toBe('1h')
    expect(requestUrl.searchParams.get('sort_type')).toBe('desc')
    expect(requestUrl.searchParams.get('time')).toBe('2026-07-22 10:00:00')
    expect(requestUrl.searchParams.get('limit')).toBe('10')
  })

  it('shapes net-worth chart points from a bare data array and sends count + direction', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        success: true,
        data: [
          { unixTime: 1784473600, valueUsd: 1750.1 },
          { unixTime: 1784560000, valueUsd: 1893.42 }
        ]
      })
    )

    const result = await makeService().getWalletNetWorthChart({
      wallet: 'Wallet111',
      interval: '1d',
      count: 7,
      chain: 'solana'
    })

    expect(result).toEqual({
      source: 'birdeye',
      chain: 'solana',
      wallet: 'Wallet111',
      interval: '1d',
      points: [
        { unix_time: 1784473600, value_usd: 1750.1 },
        { unix_time: 1784560000, value_usd: 1893.42 }
      ]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/wallet/v2/net-worth')
    expect(requestUrl.searchParams.get('wallet')).toBe('Wallet111')
    expect(requestUrl.searchParams.get('count')).toBe('7')
    expect(requestUrl.searchParams.get('direction')).toBe('back')
    expect(requestUrl.searchParams.get('type')).toBe('1d')
    expect(requestUrl.searchParams.get('sort_type')).toBe('desc')
  })

  it('shapes wallet balance changes and sends the time window', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          items: [
            {
              address: SOL_ADDRESS,
              symbol: 'SOL',
              blockTime: 1784560000,
              changeType: 'increase',
              uiAmount: 2.5,
              valueUsd: 428.55
            }
          ]
        }
      })
    )

    const result = await makeService().getWalletBalanceChanges({
      wallet: 'Wallet111',
      from: 1784470000,
      to: 1784560000,
      limit: 20,
      chain: 'solana'
    })

    expect(result).toEqual({
      source: 'birdeye',
      chain: 'solana',
      wallet: 'Wallet111',
      changes: [
        {
          block_unix_time: 1784560000,
          address: SOL_ADDRESS,
          symbol: 'SOL',
          amount: 2.5,
          value_usd: 428.55,
          change_type: 'increase'
        }
      ]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/wallet/v2/balance-change')
    expect(requestUrl.searchParams.get('address')).toBe('Wallet111')
    expect(requestUrl.searchParams.get('time_from')).toBe('1784470000')
    expect(requestUrl.searchParams.get('time_to')).toBe('1784560000')
    expect(requestUrl.searchParams.get('offset')).toBe('0')
    expect(requestUrl.searchParams.get('limit')).toBe('20')
  })

  it('shapes wallet transfer totals via POST with the wallet in the JSON body', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          totalAmount: 152000.5,
          totalValueUsd: 98765.4,
          transferCount: 412,
          uniqueCounterparties: 37
        }
      })
    )

    const result = await makeService().getWalletTransferTotal({
      wallet: 'Wallet111',
      chain: 'solana'
    })

    expect(result).toEqual({
      source: 'birdeye',
      chain: 'solana',
      wallet: 'Wallet111',
      transfer_count: 412
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/wallet/v2/transfer/total')
    const requestInit = fetchSpy.mock.calls[0]?.[1]
    expect(requestInit?.method).toBe('POST')
    expect(JSON.parse(String(requestInit?.body))).toEqual({ wallet: 'Wallet111' })
    expect(requestInit?.headers).toMatchObject({
      'X-API-KEY': TEST_API_KEY,
      'x-chain': 'solana',
      'Content-Type': 'application/json'
    })
  })

  it('flattens token transfer totals into metric rows and drops non-scalar fields', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          total_transfer: 91234,
          total_volume_usd: 4500000.25,
          top_wallet: 'Whale111',
          breakdown: { in: 1, out: 2 }
        }
      })
    )

    const result = await makeService().getTokenTransferTotal({
      address: BONK_ADDRESS,
      chain: 'solana'
    })

    expect(result).toEqual({
      source: 'birdeye',
      chain: 'solana',
      address: BONK_ADDRESS,
      metrics: [
        { metric: 'total_transfer', value: 91234 },
        { metric: 'total_volume_usd', value: 4500000.25 },
        { metric: 'top_wallet', value: 'Whale111' }
      ]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/token/v1/transfer/total')
    const requestInit = fetchSpy.mock.calls[0]?.[1]
    expect(requestInit?.method).toBe('POST')
    expect(JSON.parse(String(requestInit?.body))).toEqual({ token_address: BONK_ADDRESS })
  })

  it('matches checksummed EVM price keys against the lowercase request address', async () => {
    // BirdEye keys EVM price data by the CHECKSUMMED address; callers pass lowercase.
    const wethLower = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'
    const wethChecksum = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          [wethChecksum]: {
            value: 1876.3895230319401,
            updateUnixTime: 1784867915,
            priceChange24h: -2.3559478489202954,
            liquidity: 949935486.3065736
          }
        }
      })
    )

    const result = await makeService().getPrices({ addresses: [wethLower], chain: 'ethereum' })

    expect(result.prices).toEqual([
      {
        address: wethLower,
        price_usd: 1876.3895230319401,
        change_24h_pct: -2.3559478489202954,
        liquidity_usd: 949935486.3065736,
        updated_at: 1784867915
      }
    ])
  })

  it('matches checksummed EVM trade-data keys against the lowercase request address', async () => {
    const wethLower = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'
    const wethChecksum = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          [wethChecksum]: { price: 1876.38, trade_24h: 1200, volume_24h_usd: 500000 }
        }
      })
    )

    const result = await makeService().getTradeStats({ addresses: [wethLower], chain: 'ethereum' })

    // The checksummed EVM key resolves against the lowercase request, so the row
    // is populated rather than dropped.
    expect(result.tokens).toEqual([
      {
        address: wethLower,
        price_usd: 1876.38,
        trades_24h: 1200,
        volume_24h_usd: 500000
      }
    ])
  })

  it('reads the net-worth total from total_value and maps amount/price/value holdings (live shape)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          wallet: 'Wallet111',
          currency: 'usd',
          total_value: '603347764.5334971',
          current_timestamp: '2026-07-24T04:39:33.762438943Z',
          items: [
            {
              address: '27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4',
              decimals: 6,
              price: 3.6368317485922432,
              balance: '58686659500489',
              amount: 58686659.500489,
              symbol: 'JLP',
              name: 'Jupiter Perps LP',
              value: '213433506.49020097'
            }
          ]
        }
      })
    )

    const result = await makeService().getWalletNetWorth({
      wallet: 'Wallet111',
      limit: 20,
      chain: 'solana'
    })

    expect(result.total_usd).toBe(603347764.5334971)
    expect(result.tokens).toEqual([
      {
        address: '27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4',
        symbol: 'JLP',
        ui_amount: 58686659.500489,
        price_usd: 3.6368317485922432,
        value_usd: 213433506.49020097,
        cost_basis_usd: null,
        allocation_pct: null
      }
    ])
  })

  it('maps net-worth-details holdings from net_assets and time from resolved_timestamp (live shape)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          wallet_address: 'Wallet111',
          currency: 'usd',
          net_worth: 603348551.6047337,
          requested_timestamp: '2026-07-24T04:39:58.292814582Z',
          resolved_timestamp: '2026-07-24T04:39:58.323647815Z',
          net_assets: [
            {
              symbol: 'WBTC',
              token_address: '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh',
              decimal: 8,
              balance: '177806717958',
              price: 65241.11902264516,
              value: 116003092.49323775
            }
          ]
        }
      })
    )

    const result = await makeService().getWalletNetWorthDetails({
      wallet: 'Wallet111',
      interval: '1d',
      time: null,
      limit: 10,
      chain: 'solana'
    })

    expect(result.total_usd).toBe(603348551.6047337)
    expect(result.time).toBe('2026-07-24T04:39:58.323647815Z')
    expect(result.tokens).toEqual([
      {
        address: '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh',
        symbol: 'WBTC',
        ui_amount: 177806717958 / 10 ** 8,
        price_usd: 65241.11902264516,
        value_usd: 116003092.49323775,
        cost_basis_usd: null,
        allocation_pct: null
      }
    ])
  })

  it('maps net-worth chart points from history with ISO timestamps and net_worth (live shape)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          currency: 'usd',
          current_timestamp: '2026-07-24T04:41:25Z',
          past_timestamp: '2026-07-17T04:41:25Z',
          history: [
            {
              timestamp: '2026-07-24T04:41:25Z',
              net_worth: 603131023.71,
              net_worth_change: -7894503.12,
              net_worth_change_percent: -1.29
            }
          ]
        }
      })
    )

    const result = await makeService().getWalletNetWorthChart({
      wallet: 'Wallet111',
      interval: '1d',
      count: 7,
      chain: 'solana'
    })

    expect(result.points).toEqual([
      { unix_time: Math.floor(Date.parse('2026-07-24T04:41:25Z') / 1000), value_usd: 603131023.71 }
    ])
  })

  it('maps balance-change numeric type codes to labels via token_info and block_unix_time (live shape)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          items: [
            {
              time: '2026-07-24T04:41:18Z',
              block_number: 434854201,
              block_unix_time: 1784868078,
              address: 'Wallet111',
              token_account: 'WzWUoCmtVv7eqAbU3BfKPU3fhLP6CXR8NCJH78UK9VS',
              tx_hash: '2yu1wHpG8y4W8sBVA8b9SsPAUJencBCCcwCdnWM9jCeW',
              pre_balance: '133095783585491',
              post_balance: '133095813334702',
              amount: '29749211',
              token_info: {
                address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                decimals: 6,
                symbol: 'USDC',
                name: 'USD Coin'
              },
              type: 2,
              type_text: 'SPL',
              change_type: 1,
              change_type_text: 'INCR'
            }
          ]
        }
      })
    )

    const result = await makeService().getWalletBalanceChanges({
      wallet: 'Wallet111',
      from: null,
      to: null,
      limit: 20,
      chain: 'solana'
    })

    expect(result.changes).toEqual([
      {
        block_unix_time: 1784868078,
        address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        symbol: 'USDC',
        amount: 29749211 / 10 ** 6,
        value_usd: null,
        change_type: 'INCR'
      }
    ])
  })

  it('maps transfer-total count from the live `total` field', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ success: true, data: { total: 39218869 } })
    )

    const result = await makeService().getWalletTransferTotal({
      wallet: 'Wallet111',
      chain: 'solana'
    })

    expect(result).toEqual({
      source: 'birdeye',
      chain: 'solana',
      wallet: 'Wallet111',
      transfer_count: 39218869
    })
  })

  it('throws the unavailable message without calling fetch when the key is unset', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    await expect(
      makeService('').getOverview({ address: SOL_ADDRESS, chain: 'solana' })
    ).rejects.toThrow(
      'BIRDEYE_API_KEY is not set — the `token-data` group and the BirdEye-backed `wallet-data` commands are unavailable on this box'
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
