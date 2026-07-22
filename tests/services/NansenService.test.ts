import type { MockInstance } from 'vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { NansenService } from '@/services/NansenService'
import { ensureJsonTreeString } from '@/utils/Lang'

const TEST_API_KEY = 'test-nansen-key'
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(ensureJsonTreeString(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

function makeService(apiKey = TEST_API_KEY): NansenService {
  return new NansenService({ apiKey })
}

function requestBody(fetchSpy: MockInstance): Record<string, unknown> {
  const parsed: unknown = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body))
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Expected request body to be a JSON object')
  }
  return parsed as Record<string, unknown>
}

describe('NansenService', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shapes netflow rows, converts string USD figures, and POSTs the key header', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        data: [
          {
            chain: 'solana',
            token_address: 'So11111111111111111111111111111111111111112',
            token_symbol: 'SOL',
            token_sectors: ['layer-1'],
            net_flow_1h_usd: '120000.5',
            net_flow_24h_usd: 3400000,
            net_flow_7d_usd: '-1250000.25',
            net_flow_30d_usd: 9000000,
            trader_count: 87,
            token_age_days: 1500,
            market_cap_usd: '98000000000'
          }
        ],
        pagination: { page: 1, per_page: 10, is_last_page: true }
      })
    )

    const result = await makeService().getNetflow({
      chain: 'solana',
      limit: 10,
      tokenAddress: 'So11111111111111111111111111111111111111112'
    })

    expect(result).toEqual({
      source: 'nansen',
      chain: 'solana',
      tokens: [
        {
          chain: 'solana',
          address: 'So11111111111111111111111111111111111111112',
          symbol: 'SOL',
          sectors: ['layer-1'],
          netflow_1h_usd: 120000.5,
          netflow_24h_usd: 3400000,
          netflow_7d_usd: -1250000.25,
          netflow_30d_usd: 9000000,
          trader_count: 87,
          token_age_days: 1500,
          market_cap_usd: 98000000000
        }
      ]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.origin).toBe('https://api.nansen.ai')
    expect(requestUrl.pathname).toBe('/api/v1/smart-money/netflow')
    expect(fetchSpy.mock.calls[0]?.[1]?.method).toBe('POST')
    expect(fetchSpy.mock.calls[0]?.[1]?.headers).toMatchObject({ apiKey: TEST_API_KEY })
    expect(requestBody(fetchSpy)).toMatchObject({
      chains: ['solana'],
      pagination: { page: 1, per_page: 10 },
      filters: { token_address: 'So11111111111111111111111111111111111111112' },
      order_by: [{ field: 'net_flow_24h_usd', direction: 'DESC' }]
    })
  })

  it('shapes holdings rows and omits filters when no token is given', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        data: [
          {
            chain: 'ethereum',
            token_address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
            token_symbol: 'WETH',
            token_sectors: [],
            value_usd: '512000000.75',
            balance_24h_percent_change: -2.1,
            holders_count: 412,
            share_of_holdings_percent: 18.4,
            token_age_days: 2900,
            market_cap_usd: 11000000000
          }
        ]
      })
    )

    const result = await makeService().getHoldings({ chain: 'all', limit: 20, tokenAddress: null })

    expect(result.holdings).toEqual([
      {
        chain: 'ethereum',
        address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
        symbol: 'WETH',
        sectors: [],
        value_usd: 512000000.75,
        balance_change_24h_pct: -2.1,
        holders_count: 412,
        share_of_holdings_pct: 18.4,
        token_age_days: 2900,
        market_cap_usd: 11000000000
      }
    ])

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v1/smart-money/holdings')
    const body = requestBody(fetchSpy)
    expect(body.chains).toEqual(['all'])
    expect(body.filters).toBeUndefined()
  })

  it('shapes dex trades and filters on the bought token address', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        data: [
          {
            chain: 'base',
            block_timestamp: '2026-07-21 14:03:11',
            transaction_hash: '0xabc',
            trader_address: '0x1111111111111111111111111111111111111111',
            trader_address_label: 'Smart Trader',
            token_bought_address: '0xaaa',
            token_sold_address: '0xbbb',
            token_bought_symbol: 'AERO',
            token_sold_symbol: 'USDC',
            token_bought_amount: 15000,
            token_sold_amount: 9000,
            trade_value_usd: '9000.12'
          }
        ]
      })
    )

    const result = await makeService().getDexTrades({
      chain: 'base',
      limit: 5,
      tokenAddress: '0xaaa'
    })

    expect(result.trades).toEqual([
      {
        chain: 'base',
        time: '2026-07-21 14:03:11',
        trader: '0x1111111111111111111111111111111111111111',
        trader_label: 'Smart Trader',
        bought_symbol: 'AERO',
        bought_address: '0xaaa',
        bought_amount: 15000,
        sold_symbol: 'USDC',
        sold_address: '0xbbb',
        sold_amount: 9000,
        value_usd: 9000.12
      }
    ])

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v1/smart-money/dex-trades')
    expect(requestBody(fetchSpy)).toMatchObject({
      filters: { token_bought_address: '0xaaa' },
      order_by: [{ field: 'block_timestamp', direction: 'DESC' }]
    })
  })

  it('shapes perp trades without a chains field in the request body', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        data: [
          {
            block_timestamp: '2026-07-21 09:00:00',
            trader_address: '0x2222222222222222222222222222222222222222',
            trader_address_label: 'Smart HL Perps Trader',
            token_symbol: 'BTC',
            side: 'Long',
            action: 'Buy - Open Long',
            type: 'Market',
            token_amount: 1.5,
            price_usd: '76950.4',
            value_usd: 115425.6
          }
        ]
      })
    )

    const result = await makeService().getPerpTrades({ limit: 20, tokenSymbol: 'BTC' })

    expect(result).toEqual({
      source: 'nansen',
      trades: [
        {
          time: '2026-07-21 09:00:00',
          trader: '0x2222222222222222222222222222222222222222',
          trader_label: 'Smart HL Perps Trader',
          symbol: 'BTC',
          side: 'Long',
          action: 'Buy - Open Long',
          type: 'Market',
          amount: 1.5,
          price_usd: 76950.4,
          value_usd: 115425.6
        }
      ]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v1/smart-money/perp-trades')
    const body = requestBody(fetchSpy)
    expect(body.chains).toBeUndefined()
    expect(body.filters).toEqual({ token_symbol: 'BTC' })
  })

  it('shapes DCA rows and filters on the output token symbol', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        data: [
          {
            dca_created_at: '2026-07-20 10:00:00',
            dca_updated_at: '2026-07-21 10:00:00',
            trader_address: 'Trader1111111111111111111111111111111111111',
            trader_address_label: 'Smart Trader',
            dca_status: 'active',
            input_token_symbol: 'USDC',
            output_token_symbol: 'JUP',
            deposit_token_amount: 50000,
            token_spent_amount: 12500,
            output_token_redeemed_amount: 30000,
            deposit_value_usd: '50000'
          }
        ]
      })
    )

    const result = await makeService().getDcas({ limit: 20, outputTokenSymbol: 'JUP' })

    expect(result.dcas[0]).toEqual({
      created_at: '2026-07-20 10:00:00',
      updated_at: '2026-07-21 10:00:00',
      trader: 'Trader1111111111111111111111111111111111111',
      trader_label: 'Smart Trader',
      status: 'active',
      input_symbol: 'USDC',
      output_symbol: 'JUP',
      deposit_amount: 50000,
      spent_amount: 12500,
      redeemed_amount: 30000,
      deposit_value_usd: 50000
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v1/smart-money/dcas')
    expect(requestBody(fetchSpy)).toMatchObject({
      filters: { output_token_symbol: 'JUP' },
      order_by: [{ field: 'dca_created_at', direction: 'DESC' }]
    })
  })

  it('runs the token screener with only_smart_money forced on', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        data: [
          {
            chain: 'ethereum',
            token_address: '0xccc',
            token_symbol: 'PEPE',
            token_age_days: 800,
            price_usd: '0.0000112',
            price_change: 14.2,
            market_cap_usd: '4700000000',
            liquidity: 210000000,
            volume: 98000000,
            buy_volume: 61000000,
            sell_volume: 37000000,
            netflow: 24000000,
            nof_traders: 412,
            nof_buyers: 300,
            nof_sellers: 190
          }
        ]
      })
    )

    const result = await makeService().getTokenList({
      chain: 'ethereum',
      limit: 20,
      timeframe: '24h'
    })

    expect(result).toEqual({
      source: 'nansen',
      chain: 'ethereum',
      timeframe: '24h',
      tokens: [
        {
          chain: 'ethereum',
          address: '0xccc',
          symbol: 'PEPE',
          price_usd: 0.0000112,
          price_change_pct: 14.2,
          market_cap_usd: 4700000000,
          liquidity_usd: 210000000,
          volume_usd: 98000000,
          buy_volume_usd: 61000000,
          sell_volume_usd: 37000000,
          netflow_usd: 24000000,
          traders: 412,
          buyers: 300,
          sellers: 190,
          token_age_days: 800
        }
      ]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v1/token-screener')
    expect(requestBody(fetchSpy)).toMatchObject({
      chains: ['ethereum'],
      timeframe: '24h',
      filters: { only_smart_money: true }
    })
  })

  it('shapes cohort flow intelligence for one token', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        data: [
          {
            smart_trader_net_flow_usd: '1250000.5',
            smart_trader_wallet_count: 41,
            whale_net_flow_usd: -800000,
            whale_wallet_count: 7,
            public_figure_net_flow_usd: 12000,
            public_figure_wallet_count: 2,
            top_pnl_net_flow_usd: '90000',
            top_pnl_wallet_count: 12,
            exchange_net_flow_usd: -2500000,
            exchange_wallet_count: 5,
            fresh_wallets_net_flow_usd: 400000,
            fresh_wallets_wallet_count: 230
          }
        ]
      })
    )

    const result = await makeService().getFlowIntelligence({
      chain: 'ethereum',
      tokenAddress: '0xddd',
      timeframe: '1d'
    })

    expect(result).toEqual({
      source: 'nansen',
      chain: 'ethereum',
      token: '0xddd',
      timeframe: '1d',
      flows: [
        {
          smart_trader_netflow_usd: 1250000.5,
          smart_trader_wallets: 41,
          whale_netflow_usd: -800000,
          whale_wallets: 7,
          public_figure_netflow_usd: 12000,
          public_figure_wallets: 2,
          top_pnl_netflow_usd: 90000,
          top_pnl_wallets: 12,
          exchange_netflow_usd: -2500000,
          exchange_wallets: 5,
          fresh_wallet_netflow_usd: 400000,
          fresh_wallet_wallets: 230
        }
      ]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v1/tgm/flow-intelligence')
    expect(requestBody(fetchSpy)).toEqual({
      chain: 'ethereum',
      token_address: '0xddd',
      timeframe: '1d'
    })
  })

  it('requests the token PnL leaderboard with a trailing date range', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        data: [
          {
            trader_address: '0x3333333333333333333333333333333333333333',
            trader_address_label: 'Fund',
            pnl_usd_realised: '410000.4',
            pnl_usd_unrealised: -10000,
            pnl_usd_total: '400000.4',
            roi_percent_total: 82.5,
            holding_usd: '95000',
            nof_trades: 34
          }
        ]
      })
    )

    const result = await makeService().getPnlLeaderboard({
      chain: 'ethereum',
      tokenAddress: '0xeee',
      limit: 10
    })

    expect(result.traders).toEqual([
      {
        address: '0x3333333333333333333333333333333333333333',
        label: 'Fund',
        pnl_total_usd: 400000.4,
        pnl_realized_usd: 410000.4,
        pnl_unrealized_usd: -10000,
        roi_total_pct: 82.5,
        holding_usd: 95000,
        trade_count: 34
      }
    ])

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v1/tgm/pnl-leaderboard')
    const body = requestBody(fetchSpy)
    expect(body).toMatchObject({
      chain: 'ethereum',
      token_address: '0xeee',
      order_by: [{ field: 'pnl_usd_total', direction: 'DESC' }]
    })
    const date = body.date as { from: string; to: string }
    expect(date.from).toMatch(DATE_ONLY_REGEX)
    expect(date.to).toMatch(DATE_ONLY_REGEX)
  })

  it('shapes wallet balances and hides spam tokens', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        data: [
          {
            chain: 'ethereum',
            address: '0x4444444444444444444444444444444444444444',
            token_address: '0xfff',
            token_symbol: 'LINK',
            token_name: 'Chainlink',
            token_amount: 1200,
            price_usd: '15.25',
            value_usd: '18300'
          }
        ]
      })
    )

    const result = await makeService().getBalances({
      wallet: '0x4444444444444444444444444444444444444444',
      chain: 'all'
    })

    expect(result).toEqual({
      source: 'nansen',
      wallet: '0x4444444444444444444444444444444444444444',
      chain: 'all',
      balances: [
        {
          chain: 'ethereum',
          token_address: '0xfff',
          symbol: 'LINK',
          amount: 1200,
          price_usd: 15.25,
          value_usd: 18300
        }
      ]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v1/profiler/address/current-balance')
    expect(requestBody(fetchSpy)).toMatchObject({
      address: '0x4444444444444444444444444444444444444444',
      chain: 'all',
      hide_spam_token: true
    })
  })

  it('shapes wallet labels', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        data: [
          { label: 'Smart Trader', category: 'smart_money' },
          { label: 'Whale', category: null }
        ]
      })
    )

    const result = await makeService().getLabels({ wallet: '0xabc', chain: 'all' })

    expect(result.labels).toEqual([
      { label: 'Smart Trader', category: 'smart_money' },
      { label: 'Whale', category: null }
    ])

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v1/profiler/address/labels')
  })

  it('shapes counterparties and defaults missing label arrays', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        data: [
          {
            counterparty_address: '0x5555555555555555555555555555555555555555',
            counterparty_address_label: null,
            interaction_count: 18,
            total_volume_usd: '240000.5',
            volume_in_usd: 140000.5,
            volume_out_usd: '100000',
            tokens_info: [
              { token_address: '0x1', token_symbol: 'X', token_name: 'X', num_transfer: '3' }
            ]
          }
        ]
      })
    )

    const result = await makeService().getCounterparties({
      wallet: '0xabc',
      chain: 'ethereum',
      limit: 20
    })

    expect(result.counterparties).toEqual([
      {
        address: '0x5555555555555555555555555555555555555555',
        labels: [],
        interaction_count: 18,
        volume_usd: 240000.5,
        volume_in_usd: 140000.5,
        volume_out_usd: 100000
      }
    ])

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v1/profiler/address/counterparties')
    const body = requestBody(fetchSpy)
    const date = body.date as { from: string; to: string }
    expect(date.from).toMatch(DATE_ONLY_REGEX)
    expect(body.order_by).toEqual([{ field: 'total_volume_usd', direction: 'DESC' }])
  })

  it('shapes transactions with trimmed sent/received token legs', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        data: [
          {
            chain: 'ethereum',
            method: 'swap',
            block_timestamp: '2026-07-21 08:12:00',
            transaction_hash: '0xdef',
            source_type: 'dex',
            volume_usd: '5000.5',
            tokens_sent: [
              {
                token_symbol: 'USDC',
                token_amount: 5000,
                value_usd: '5000.5',
                token_address: '0x9',
                chain: 'ethereum',
                from_address: '0xabc',
                to_address: '0xrouter'
              }
            ],
            tokens_received: [{ token_symbol: 'WETH', token_amount: 1.6, value_usd: 4995 }]
          }
        ]
      })
    )

    const result = await makeService().getTransactions({
      wallet: '0xabc',
      chain: 'ethereum',
      limit: 20
    })

    expect(result.transactions).toEqual([
      {
        chain: 'ethereum',
        time: '2026-07-21 08:12:00',
        tx_hash: '0xdef',
        method: 'swap',
        volume_usd: 5000.5,
        sent: [{ symbol: 'USDC', amount: 5000, value_usd: 5000.5 }],
        received: [{ symbol: 'WETH', amount: 1.6, value_usd: 4995 }]
      }
    ])

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v1/profiler/address/transactions')
    expect(requestBody(fetchSpy)).toMatchObject({
      address: '0xabc',
      chain: 'ethereum',
      hide_spam_token: true,
      pagination: { page: 1, per_page: 20 }
    })
  })

  it('shapes related wallets down to address, label, and relation', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        data: [
          {
            address: '0x6666666666666666666666666666666666666666',
            address_label: 'Binance Deposit',
            relation: 'First sender of funds',
            transaction_hash: '0x123',
            block_timestamp: '2025-01-01 00:00:00',
            order: 1,
            chain: 'ethereum'
          }
        ]
      })
    )

    const result = await makeService().getRelatedWallets({ wallet: '0xabc', chain: 'ethereum' })

    expect(result.wallets).toEqual([
      {
        address: '0x6666666666666666666666666666666666666666',
        label: 'Binance Deposit',
        relation: 'First sender of funds'
      }
    ])

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v1/profiler/address/related-wallets')
  })

  it('shapes the wallet PnL summary with its top tokens', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        pagination: { page: 1, per_page: 100, is_last_page: true },
        realized_pnl_usd: '182000.5',
        realized_pnl_percent: 41.2,
        win_rate: 0.63,
        traded_token_count: 28,
        traded_times: 145,
        top5_tokens: [
          {
            realized_pnl: '90000',
            realized_roi: 120.5,
            token_address: '0x777',
            token_symbol: 'ARB',
            chain: 'arbitrum'
          }
        ]
      })
    )

    const result = await makeService().getPnlSummary({ wallet: '0xabc', chain: 'all' })

    expect(result).toEqual({
      source: 'nansen',
      wallet: '0xabc',
      chain: 'all',
      realized_pnl_usd: 182000.5,
      realized_pnl_pct: 41.2,
      win_rate: 0.63,
      traded_token_count: 28,
      trade_count: 145,
      top_tokens: [
        {
          chain: 'arbitrum',
          address: '0x777',
          symbol: 'ARB',
          realized_pnl_usd: 90000,
          realized_roi_pct: 120.5
        }
      ]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v1/profiler/address/pnl-summary')
    const body = requestBody(fetchSpy)
    const date = body.date as { from: string; to: string }
    expect(date.from).toMatch(DATE_ONLY_REGEX)
    expect(date.to).toMatch(DATE_ONLY_REGEX)
  })

  it('throws the unavailable message without calling fetch when the key is unset', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    await expect(
      makeService('').getNetflow({ chain: 'all', limit: 20, tokenAddress: null })
    ).rejects.toThrow(
      'NANSEN_API_KEY is not set — the `smart-money` and `wallet-data` command groups are unavailable on this box'
    )
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('throws on provider errors with status and truncated body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"error":"unauthorized"}', { status: 401, statusText: 'Unauthorized' })
    )

    const error = await makeService()
      .getBalances({ wallet: '0xabc', chain: 'all' })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(Error)
    if (error instanceof Error) {
      expect(error.message).toContain(
        'Nansen /api/v1/profiler/address/current-balance failed: 401 Unauthorized'
      )
      expect(error.message).not.toContain(TEST_API_KEY)
    }
  })
})
