import { afterEach, describe, expect, it, vi } from 'vitest'

import { ExchangesService } from '@/services/ExchangesService'
import { ensureJsonTreeString } from '@/utils/Lang'

const TEST_API_KEY = 'test-coingecko-key'

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(ensureJsonTreeString(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

function makeService(apiKey = TEST_API_KEY): ExchangesService {
  return new ExchangesService({ apiKey })
}

describe('ExchangesService', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shapes the exchange list and sends the pro key header', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse([
        {
          id: 'binance',
          name: 'Binance',
          country: 'Cayman Islands',
          year_established: 2017,
          trust_score: 10,
          trust_score_rank: 1,
          trade_volume_24h_btc: 251712.35,
          trade_volume_24h_btc_normalized: 190456.11
        }
      ])
    )

    const result = await makeService().list({ limit: 25 })

    expect(result).toEqual({
      source: 'coingecko',
      exchanges: [
        {
          id: 'binance',
          name: 'Binance',
          trust_score: 10,
          trust_rank: 1,
          volume_24h_btc: 251712.35
        }
      ]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.origin).toBe('https://pro-api.coingecko.com')
    expect(requestUrl.pathname).toBe('/api/v3/exchanges')
    expect(requestUrl.searchParams.get('per_page')).toBe('25')
    expect(requestUrl.searchParams.get('page')).toBe('1')
    expect(fetchSpy.mock.calls[0]?.[1]?.headers).toMatchObject({
      'x-cg-pro-api-key': TEST_API_KEY
    })
  })

  it('trims the exchange detail to trust, volume, and top tickers', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        name: 'Binance',
        country: 'Cayman Islands',
        year_established: 2017,
        trust_score: 10,
        trust_score_rank: 1,
        trade_volume_24h_btc: 251712.35,
        tickers: [
          {
            base: 'BTC',
            target: 'USDT',
            last: 76975.12,
            converted_last: { usd: 76980.4 },
            converted_volume: { usd: 3100000000 },
            trust_score: 'green',
            bid_ask_spread_percentage: 0.01
          }
        ]
      })
    )

    const result = await makeService().detail({ id: 'binance' })

    expect(result).toEqual({
      source: 'coingecko',
      id: 'binance',
      name: 'Binance',
      country: 'Cayman Islands',
      year_established: 2017,
      trust_score: 10,
      trust_rank: 1,
      volume_24h_btc: 251712.35,
      top_tickers: [
        {
          pair: 'BTC/USDT',
          price_usd: 76980.4,
          volume_24h_usd: 3100000000,
          spread_pct: 0.01,
          trust_score: 'green'
        }
      ]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v3/exchanges/binance')
  })

  it('slices exchange tickers client-side to the requested limit', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        name: 'Binance',
        tickers: [
          {
            base: 'BTC',
            target: 'USDT',
            converted_last: { usd: 76980.4 },
            converted_volume: { usd: 3100000000 },
            trust_score: 'green',
            bid_ask_spread_percentage: 0.01
          },
          {
            base: 'ETH',
            target: 'USDT',
            converted_last: { usd: 2987.4 },
            converted_volume: { usd: 1200000000 },
            trust_score: 'green',
            bid_ask_spread_percentage: 0.02
          }
        ]
      })
    )

    const result = await makeService().tickers({ id: 'binance', limit: 1 })

    expect(result.tickers).toEqual([
      {
        pair: 'BTC/USDT',
        price_usd: 76980.4,
        volume_24h_usd: 3100000000,
        spread_pct: 0.01,
        trust_score: 'green'
      }
    ])

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v3/exchanges/binance/tickers')
  })

  it('maps volume chart tuples with string-encoded BTC volumes into timed points', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse([
        [1784500000000, '306800.0517941023777005'],
        [1784586400000, '312450.5']
      ])
    )

    const result = await makeService().volumeChart({ id: 'binance', days: '30' })

    expect(result).toEqual({
      source: 'coingecko',
      id: 'binance',
      days: '30',
      points: [
        { t: 1784500000000, volume_btc: 306800.0517941023777005 },
        { t: 1784586400000, volume_btc: 312450.5 }
      ]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v3/exchanges/binance/volume_chart')
    expect(requestUrl.searchParams.get('days')).toBe('30')
  })

  it('shapes derivatives tickers, parsing the string-encoded price', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse([
        {
          market: 'Binance (Futures)',
          symbol: 'BTCUSDT',
          index_id: 'BTC',
          price: '76975.9',
          price_percentage_change_24h: 1.85,
          contract_type: 'perpetual',
          spread: 0.01,
          funding_rate: 0.008,
          open_interest: 7690212057.6,
          volume_24h: 24613546475.5
        },
        {
          market: 'Bybit (Futures)',
          symbol: 'ETHUSDT',
          price: '2987.1',
          contract_type: 'perpetual'
        }
      ])
    )

    const result = await makeService().derivatives({ limit: 1 })

    expect(result.tickers).toEqual([
      {
        market: 'Binance (Futures)',
        symbol: 'BTCUSDT',
        contract_type: 'perpetual',
        price_usd: 76975.9,
        change_24h_pct: 1.85,
        open_interest_usd: 7690212057.6,
        volume_24h_usd: 24613546475.5,
        funding_rate_pct: 0.008,
        spread_pct: 0.01
      }
    ])

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v3/derivatives')
  })

  it('shapes derivatives exchanges ranked by open interest', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse([
        {
          id: 'binance_futures',
          name: 'Binance (Futures)',
          open_interest_btc: 279958.61,
          trade_volume_24h_btc: '574366.94',
          number_of_perpetual_pairs: 330,
          number_of_futures_pairs: 44,
          year_established: 2019,
          country: null
        }
      ])
    )

    const result = await makeService().derivativesExchanges({ limit: 10 })

    expect(result).toEqual({
      source: 'coingecko',
      exchanges: [
        {
          id: 'binance_futures',
          name: 'Binance (Futures)',
          open_interest_btc: 279958.61,
          volume_24h_btc: 574366.94,
          perpetual_pairs: 330,
          futures_pairs: 44
        }
      ]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v3/derivatives/exchanges')
    expect(requestUrl.searchParams.get('order')).toBe('open_interest_btc_desc')
    expect(requestUrl.searchParams.get('per_page')).toBe('10')
  })

  it('shapes the public treasury holdings for a coin', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        total_holdings: 750324,
        total_value_usd: 50151721790.3,
        market_cap_dominance: 3.57,
        companies: [
          {
            name: 'MicroStrategy Inc.',
            symbol: 'NASDAQ:MSTR',
            country: 'US',
            total_holdings: 214400,
            total_entry_value_usd: 7530000000,
            total_current_value_usd: 14330398800,
            percentage_of_total_supply: 1.021
          }
        ]
      })
    )

    const result = await makeService().treasury({ coin: 'bitcoin' })

    expect(result).toEqual({
      source: 'coingecko',
      coin: 'bitcoin',
      total_holdings: 750324,
      total_value_usd: 50151721790.3,
      market_cap_dominance_pct: 3.57,
      companies: [
        {
          name: 'MicroStrategy Inc.',
          symbol: 'NASDAQ:MSTR',
          country: 'US',
          total_holdings: 214400,
          entry_value_usd: 7530000000,
          current_value_usd: 14330398800,
          pct_of_total_supply: 1.021
        }
      ]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v3/companies/public_treasury/bitcoin')
  })

  it('lists treasury entities through /entities/list with per_page paging', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse([
        { id: 'microstrategy', name: 'Strategy', symbol: 'NASDAQ:MSTR', country: 'US' },
        { id: 'tesla', name: 'Tesla, Inc.', symbol: 'NASDAQ:TSLA' }
      ])
    )

    const result = await makeService().treasuryEntities({ limit: 25 })

    expect(result).toEqual({
      source: 'coingecko',
      entities: [
        { id: 'microstrategy', name: 'Strategy', symbol: 'NASDAQ:MSTR', country: 'US' },
        { id: 'tesla', name: 'Tesla, Inc.', symbol: 'NASDAQ:TSLA' }
      ]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v3/entities/list')
    expect(requestUrl.searchParams.get('per_page')).toBe('25')
    expect(requestUrl.searchParams.get('page')).toBe('1')
  })

  it('shapes entity treasury holdings', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        id: 'microstrategy',
        name: 'Strategy',
        type: 'company',
        symbol: 'NASDAQ:MSTR',
        country: 'US',
        total_treasury_value_usd: 14330398800,
        unrealized_pnl: 6800398800,
        holdings: [
          {
            coin_id: 'bitcoin',
            amount: 214400,
            current_value_usd: 14330398800,
            total_entry_value_usd: 7530000000,
            average_entry_value_usd: 35123.5,
            percentage_of_total_supply: 1.021,
            unrealized_pnl: 6800398800
          }
        ]
      })
    )

    const result = await makeService().treasuryEntity({ entity: 'microstrategy', coin: null })

    expect(result).toEqual({
      source: 'coingecko',
      entity: 'microstrategy',
      name: 'Strategy',
      type: 'company',
      symbol: 'NASDAQ:MSTR',
      country: 'US',
      total_value_usd: 14330398800,
      unrealized_pnl_usd: 6800398800,
      holdings: [
        {
          coin_id: 'bitcoin',
          amount: 214400,
          current_value_usd: 14330398800,
          entry_value_usd: 7530000000,
          avg_entry_value_usd: 35123.5,
          pct_of_total_supply: 1.021,
          unrealized_pnl_usd: 6800398800
        }
      ]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v3/public_treasury/microstrategy')
  })

  it('narrows entity holdings client-side when a coin is given', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        id: 'tesla',
        name: 'Tesla, Inc.',
        holdings: [
          { coin_id: 'bitcoin', amount: 9720 },
          { coin_id: 'ethereum', amount: 100 }
        ]
      })
    )

    const result = await makeService().treasuryEntity({ entity: 'tesla', coin: 'ethereum' })

    expect(result.holdings).toEqual([
      {
        coin_id: 'ethereum',
        amount: 100
      }
    ])
  })

  it('shapes the treasury holding chart with amount and usd series', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        holdings: [
          [1712793600000, 214000],
          [1712880000000, 214400]
        ],
        holding_value_in_usd: [
          [1712793600000, 14100000000],
          [1712880000000, 14330398800]
        ]
      })
    )

    const result = await makeService().treasuryChart({
      entity: 'microstrategy',
      coin: 'bitcoin',
      days: '90'
    })

    expect(result).toEqual({
      source: 'coingecko',
      entity: 'microstrategy',
      coin: 'bitcoin',
      days: '90',
      holdings: [
        { t: 1712793600000, amount: 214000 },
        { t: 1712880000000, amount: 214400 }
      ],
      value_usd: [
        { t: 1712793600000, usd: 14100000000 },
        { t: 1712880000000, usd: 14330398800 }
      ]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v3/public_treasury/microstrategy/bitcoin/holding_chart')
    expect(requestUrl.searchParams.get('days')).toBe('90')
  })

  it('shapes treasury transaction history with per_page paging', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        transactions: [
          {
            date: 1712793600,
            coin_id: 'bitcoin',
            type: 'buy',
            holding_net_change: 12000,
            transaction_value_usd: 821700000,
            holding_balance: 214400,
            average_entry_value_usd: 68475,
            source_url: 'https://example.com/8-k'
          }
        ]
      })
    )

    const result = await makeService().treasuryHistory({ entity: 'microstrategy', limit: 25 })

    expect(result).toEqual({
      source: 'coingecko',
      entity: 'microstrategy',
      transactions: [
        {
          date: 1712793600,
          coin_id: 'bitcoin',
          type: 'buy',
          net_change: 12000,
          value_usd: 821700000,
          balance: 214400,
          avg_entry_value_usd: 68475
        }
      ]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v3/public_treasury/microstrategy/transaction_history')
    expect(requestUrl.searchParams.get('per_page')).toBe('25')
    expect(requestUrl.searchParams.get('page')).toBe('1')
  })

  it('throws the unavailable message without calling fetch when the key is unset', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    await expect(makeService('').list({ limit: 10 })).rejects.toThrow(
      'COIN_GECKO_PRO_API_KEY is not set — the `exchanges` command group is unavailable on this box'
    )
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('throws on provider errors with status and truncated body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"error":"rate limited"}', { status: 429, statusText: 'Too Many Requests' })
    )

    const error = await makeService()
      .list({ limit: 10 })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(Error)
    if (error instanceof Error) {
      expect(error.message).toContain('CoinGecko /api/v3/exchanges failed: 429 Too Many Requests')
      expect(error.message).not.toContain(TEST_API_KEY)
    }
  })
})
