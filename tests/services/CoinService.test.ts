import { afterEach, describe, expect, it, vi } from 'vitest'

import { CoinService } from '@/services/CoinService'
import { ensureJsonTreeString } from '@/utils/Lang'

const TEST_API_KEY = 'test-coingecko-key'

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(ensureJsonTreeString(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

function makeService(apiKey = TEST_API_KEY): CoinService {
  return new CoinService({ apiKey })
}

describe('CoinService', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shapes the coin profile, trims the description, and sends the pro key header', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        id: 'bitcoin',
        symbol: 'btc',
        name: 'Bitcoin',
        market_cap_rank: 1,
        categories: ['Layer 1', null, 'Proof of Work'],
        description: { en: 'x'.repeat(2000) },
        links: {
          homepage: ['', 'https://bitcoin.org', null],
          twitter_screen_name: 'bitcoin',
          subreddit_url: 'https://www.reddit.com/r/Bitcoin/',
          repos_url: { github: ['https://github.com/bitcoin/bitcoin'] }
        },
        sentiment_votes_up_percentage: 84.2,
        sentiment_votes_down_percentage: 15.8,
        market_data: {
          current_price: { usd: 76975.12, eur: 70110.4 },
          market_cap: { usd: 1540000000000 },
          fully_diluted_valuation: { usd: 1610000000000 },
          total_volume: { usd: 31000000000 },
          high_24h: { usd: 78120.5 },
          low_24h: { usd: 75980.1 },
          price_change_percentage_24h: -1.41,
          price_change_percentage_7d: 3.52,
          price_change_percentage_30d: 8.11,
          ath: { usd: 108268 },
          ath_change_percentage: { usd: -28.9 },
          ath_date: { usd: '2025-01-20T09:11:54.494Z' },
          atl: { usd: 67.81 },
          atl_change_percentage: { usd: 113400.2 },
          atl_date: { usd: '2013-07-06T00:00:00.000Z' },
          circulating_supply: 19870000,
          total_supply: 21000000,
          max_supply: 21000000
        },
        community_data: { twitter_followers: 7100000, reddit_subscribers: 7500000 },
        developer_data: { stars: 81000, forks: 37000, commit_count_4_weeks: 212 }
      })
    )

    const result = await makeService().getProfile({ id: 'bitcoin' })

    expect(result).toEqual({
      source: 'coingecko',
      id: 'bitcoin',
      symbol: 'btc',
      name: 'Bitcoin',
      rank: 1,
      price_usd: 76975.12,
      market_cap_usd: 1540000000000,
      fdv_usd: 1610000000000,
      volume_24h_usd: 31000000000,
      high_24h_usd: 78120.5,
      low_24h_usd: 75980.1,
      change_24h_pct: -1.41,
      change_7d_pct: 3.52,
      change_30d_pct: 8.11,
      ath_usd: 108268,
      ath_change_pct: -28.9,
      ath_date: '2025-01-20T09:11:54.494Z',
      atl_usd: 67.81,
      atl_change_pct: 113400.2,
      atl_date: '2013-07-06T00:00:00.000Z',
      circulating_supply: 19870000,
      total_supply: 21000000,
      max_supply: 21000000,
      sentiment_up_pct: 84.2,
      sentiment_down_pct: 15.8,
      twitter_followers: 7100000,
      reddit_subscribers: 7500000,
      github_stars: 81000,
      github_forks: 37000,
      commits_4w: 212,
      categories: ['Layer 1', 'Proof of Work'],
      links: {
        homepage: 'https://bitcoin.org',
        twitter: 'bitcoin',
        subreddit: 'https://www.reddit.com/r/Bitcoin/',
        github: 'https://github.com/bitcoin/bitcoin'
      },
      description: 'x'.repeat(1200)
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.origin).toBe('https://pro-api.coingecko.com')
    expect(requestUrl.pathname).toBe('/api/v3/coins/bitcoin')
    expect(requestUrl.searchParams.get('market_data')).toBe('true')
    expect(requestUrl.searchParams.get('localization')).toBe('false')
    expect(requestUrl.searchParams.get('tickers')).toBe('false')
    expect(fetchSpy.mock.calls[0]?.[1]?.headers).toMatchObject({
      'x-cg-pro-api-key': TEST_API_KEY
    })
  })

  it('maps market chart tuples into timed points', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        prices: [
          [1784500000000, 76975.12],
          [1784586400000, 77410.3]
        ],
        market_caps: [[1784500000000, 1540000000000]],
        total_volumes: [[1784500000000, 31000000000]]
      })
    )

    const result = await makeService().getChart({ id: 'bitcoin', days: '30' })

    expect(result).toEqual({
      source: 'coingecko',
      id: 'bitcoin',
      days: '30',
      prices: [
        { t: 1784500000000, usd: 76975.12 },
        { t: 1784586400000, usd: 77410.3 }
      ],
      market_caps: [{ t: 1784500000000, usd: 1540000000000 }],
      volumes: [{ t: 1784500000000, usd: 31000000000 }]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v3/coins/bitcoin/market_chart')
    expect(requestUrl.searchParams.get('vs_currency')).toBe('usd')
    expect(requestUrl.searchParams.get('days')).toBe('30')
  })

  it('shapes ohlc rows into the shared candle contract with null volume', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse([
        [1784500000000, 76800, 77500, 76500, 77410.3],
        [1784586400000, 77410.3, 77900, 76900, 77120]
      ])
    )

    const result = await makeService().getOhlc({ id: 'bitcoin', days: '7' })

    expect(result).toEqual({
      source: 'coingecko',
      candles: [
        { t: 1784500000000, o: 76800, h: 77500, l: 76500, c: 77410.3, v: null },
        { t: 1784586400000, o: 77410.3, h: 77900, l: 76900, c: 77120, v: null }
      ]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v3/coins/bitcoin/ohlc')
    expect(requestUrl.searchParams.get('vs_currency')).toBe('usd')
    expect(requestUrl.searchParams.get('days')).toBe('7')
  })

  it('trims tickers client-side and builds the base/target pair', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        tickers: [
          {
            base: 'BTC',
            target: 'USDT',
            market: { name: 'Binance' },
            last: 76980.5,
            converted_last: { usd: 76981.2 },
            converted_volume: { usd: 5100000000 },
            trust_score: 'green'
          },
          {
            base: 'BTC',
            market: { name: 'NoPairEx' },
            converted_last: { usd: 76970.1 },
            trust_score: 'yellow'
          },
          {
            base: 'BTC',
            target: 'EUR',
            market: { name: 'Kraken' },
            converted_last: { usd: 76960 },
            converted_volume: { usd: 410000000 },
            trust_score: 'green'
          }
        ]
      })
    )

    const result = await makeService().getTickers({ id: 'bitcoin', limit: 2 })

    expect(result).toEqual({
      source: 'coingecko',
      id: 'bitcoin',
      tickers: [
        {
          market: 'Binance',
          pair: 'BTC/USDT',
          price_usd: 76981.2,
          volume_24h_usd: 5100000000,
          trust_score: 'green'
        },
        {
          market: 'NoPairEx',
          pair: null,
          price_usd: 76970.1,
          trust_score: 'yellow'
        }
      ]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v3/coins/bitcoin/tickers')
  })

  it('resolves a contract address to coin id and core market data', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        id: 'chainlink',
        symbol: 'link',
        name: 'Chainlink',
        market_cap_rank: 14,
        contract_address: '0x514910771af9ca656af840dff83e8264ecf986ca',
        market_data: {
          current_price: { usd: 17.42 },
          market_cap: { usd: 11400000000 },
          fully_diluted_valuation: { usd: 17400000000 },
          total_volume: { usd: 640000000 },
          price_change_percentage_24h: -2.15
        }
      })
    )

    const result = await makeService().getContract({
      platform: 'ethereum',
      address: '0x514910771AF9Ca656af840dff83E8264EcF986CA'
    })

    expect(result).toEqual({
      source: 'coingecko',
      id: 'chainlink',
      symbol: 'link',
      name: 'Chainlink',
      rank: 14,
      platform: 'ethereum',
      address: '0x514910771af9ca656af840dff83e8264ecf986ca',
      price_usd: 17.42,
      market_cap_usd: 11400000000,
      fdv_usd: 17400000000,
      volume_24h_usd: 640000000,
      change_24h_pct: -2.15
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe(
      '/api/v3/coins/ethereum/contract/0x514910771AF9Ca656af840dff83E8264EcF986CA'
    )
  })

  it('parses string-encoded circulating supply points into numbers', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        circulating_supply: [
          [1784500000000, '19869000.0'],
          [1784586400000, '19870125.5'],
          [1784672800000, 'not-a-number']
        ]
      })
    )

    const result = await makeService().getSupplyHistory({ id: 'bitcoin', days: '30' })

    expect(result).toEqual({
      source: 'coingecko',
      id: 'bitcoin',
      days: '30',
      supply: [
        { t: 1784500000000, supply: 19869000 },
        { t: 1784586400000, supply: 19870125.5 },
        { t: 1784672800000, supply: null }
      ]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v3/coins/bitcoin/circulating_supply_chart')
    expect(requestUrl.searchParams.get('days')).toBe('30')
  })

  it('flattens btc-relative exchange rates into rows', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        rates: {
          usd: { name: 'US Dollar', unit: '$', value: 76975.12, type: 'fiat' },
          eth: { name: 'Ether', unit: 'ETH', value: 25.77, type: 'crypto' }
        }
      })
    )

    const result = await makeService().getRates()

    expect(result).toEqual({
      source: 'coingecko',
      base: 'btc',
      rates: [
        { id: 'usd', name: 'US Dollar', unit: '$', value: 76975.12, type: 'fiat' },
        { id: 'eth', name: 'Ether', unit: 'ETH', value: 25.77, type: 'crypto' }
      ]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v3/exchange_rates')
  })

  it('throws the unavailable message without calling fetch when the key is unset', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    await expect(makeService('').getRates()).rejects.toThrow(
      'COIN_GECKO_PRO_API_KEY is not set — the `coin` command group is unavailable on this box'
    )
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('throws on provider errors with status and truncated body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"error":"coin not found"}', { status: 404, statusText: 'Not Found' })
    )

    const error = await makeService()
      .getProfile({ id: 'no-such-coin' })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(Error)
    if (error instanceof Error) {
      expect(error.message).toContain('CoinGecko /api/v3/coins/no-such-coin failed: 404 Not Found')
      expect(error.message).not.toContain(TEST_API_KEY)
    }
  })
})
