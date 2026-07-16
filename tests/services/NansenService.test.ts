import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { NansenService } from '@/services/NansenService'
import { ChainIdSchema } from '@/types/ChainId'
import { ensureJsonTreeString } from '@/utils/Lang'

const API_KEY = 'test-key'
const ALL_CHAIN_SLUGS = ['arbitrum', 'base', 'bnb', 'ethereum', 'optimism', 'polygon', 'solana']

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(ensureJsonTreeString(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

function requestBody(init: RequestInit | undefined): unknown {
  const body = init?.body
  if (typeof body !== 'string') {
    throw new Error('expected a string request body')
  }
  return JSON.parse(body)
}

function buildService(apiKey = API_KEY): NansenService {
  return new NansenService({ apiKey })
}

describe('NansenService', () => {
  beforeEach(async () => {
    process.env.TRIBES_PROVIDER_CACHE_BASE = await mkdtemp(join(tmpdir(), 'cache-'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.TRIBES_PROVIDER_CACHE_BASE
  })

  it('fetches netflows with translated chain slugs, POST body and apikey header', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        data: [
          {
            chain: 'bnb',
            token_address: '0xtoken',
            token_symbol: 'TKN',
            net_flow_1h_usd: 1000,
            net_flow_24h_usd: '2500.5',
            net_flow_7d_usd: 90000,
            net_flow_30d_usd: null,
            token_sectors: ['DeFi'],
            trader_count: 42,
            token_age_days: 365,
            market_cap_usd: 12345678
          }
        ],
        pagination: { page: 1, per_page: 25, is_last_page: true }
      })
    )

    const service = buildService()
    // '56' must translate to Nansen's 'bnb' slug (never the raw chain id).
    const result = await service.getNetflows({
      chains: [ChainIdSchema.parse('56'), ChainIdSchema.parse('solana')],
      timeframe: '7d',
      limit: 25
    })

    expect(result).toEqual({
      source: 'nansen',
      chains: ['bnb', 'solana'],
      timeframe: '7d',
      rows: [
        {
          chain: 'bnb',
          token_address: '0xtoken',
          symbol: 'TKN',
          net_flow_1h_usd: 1000,
          net_flow_24h_usd: 2500.5,
          net_flow_7d_usd: 90000,
          net_flow_30d_usd: null,
          trader_count: 42,
          token_sectors: ['DeFi'],
          token_age_days: 365,
          market_cap_usd: 12345678
        }
      ]
    })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [requestUrl, requestInit] = fetchSpy.mock.calls[0] ?? []
    expect(String(requestUrl)).toBe('https://api.nansen.ai/api/v1/smart-money/netflow')
    expect(requestInit?.method).toBe('POST')
    expect(requestInit?.headers).toMatchObject({
      apikey: API_KEY,
      'Content-Type': 'application/json'
    })
    expect(requestBody(requestInit)).toEqual({
      chains: ['bnb', 'solana'],
      pagination: { page: 1, per_page: 25 },
      order_by: [{ field: 'net_flow_7d_usd', direction: 'DESC' }]
    })

    // Identical request within the TTL is served from the file cache.
    const cached = await service.getNetflows({
      chains: [ChainIdSchema.parse('56'), ChainIdSchema.parse('solana')],
      timeframe: '7d',
      limit: 25
    })
    expect(cached).toEqual(result)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('defaults holdings to all supported chains and normalizes share fields', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        data: [
          {
            chain: 'ethereum',
            token_address: '0xabc',
            token_symbol: 'ABC',
            token_sectors: null,
            value_usd: '1000000.25',
            balance_24h_percent_change: -1.5,
            holders_count: 77,
            share_of_holdings_percent: 3.2,
            token_age_days: 12,
            market_cap_usd: null
          }
        ],
        pagination: { page: 1, per_page: 10, is_last_page: true }
      })
    )

    const result = await buildService().getHoldings({ limit: 10 })

    expect(result).toEqual({
      source: 'nansen',
      chains: ALL_CHAIN_SLUGS,
      rows: [
        {
          chain: 'ethereum',
          token_address: '0xabc',
          symbol: 'ABC',
          balance_usd: 1000000.25,
          balance_24h_percent_change: -1.5,
          holders_count: 77,
          share_of_holdings_pct: 3.2,
          token_sectors: [],
          token_age_days: 12,
          market_cap_usd: null
        }
      ]
    })

    const [requestUrl, requestInit] = fetchSpy.mock.calls[0] ?? []
    expect(String(requestUrl)).toBe('https://api.nansen.ai/api/v1/smart-money/holdings')
    expect(requestBody(requestInit)).toEqual({
      chains: ALL_CHAIN_SLUGS,
      pagination: { page: 1, per_page: 10 },
      order_by: [{ field: 'value_usd', direction: 'DESC' }]
    })
  })

  it('normalizes dex trades with nullable wallet labels', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        data: [
          {
            chain: 'ethereum',
            block_timestamp: '2026-07-16T11:58:00Z',
            transaction_hash: '0xhash',
            trader_address: '0xwallet',
            trader_address_label: null,
            token_bought_address: '0xbought',
            token_sold_address: '0xsold',
            token_bought_symbol: 'UP',
            token_sold_symbol: 'USDC',
            token_bought_amount: 123.45,
            token_sold_amount: '678.9',
            trade_value_usd: 679
          }
        ],
        pagination: { page: 1, per_page: 25, is_last_page: true }
      })
    )

    const result = await buildService().getDexTrades({
      chains: [ChainIdSchema.parse(1)],
      limit: 25
    })

    expect(result).toEqual({
      source: 'nansen',
      chains: ['ethereum'],
      rows: [
        {
          chain: 'ethereum',
          tx_hash: '0xhash',
          timestamp: '2026-07-16T11:58:00Z',
          wallet_address: '0xwallet',
          wallet_label: null,
          token_bought: { address: '0xbought', symbol: 'UP', amount: 123.45 },
          token_sold: { address: '0xsold', symbol: 'USDC', amount: 678.9 },
          value_usd: 679
        }
      ]
    })

    const [requestUrl, requestInit] = fetchSpy.mock.calls[0] ?? []
    expect(String(requestUrl)).toBe('https://api.nansen.ai/api/v1/smart-money/dex-trades')
    expect(requestBody(requestInit)).toEqual({
      chains: ['ethereum'],
      pagination: { page: 1, per_page: 25 },
      order_by: [{ field: 'block_timestamp', direction: 'DESC' }]
    })
  })

  it('requests token flows with the smart_money label and a Date.now()-based range', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-07-16T12:00:00Z').getTime())
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        data: [
          {
            date: '2026-07-15',
            price_usd: 1.23,
            token_amount: '1000',
            value_usd: 1230,
            holders_count: 55,
            total_inflows_count: 7,
            total_outflows_count: 3,
            total_inflows_dex: null,
            total_outflows_dex: null,
            total_inflows_cex: 2,
            total_outflows_cex: 1
          }
        ],
        pagination: { page: 1, per_page: 30, is_last_page: true }
      })
    )

    const result = await buildService().getTokenFlows({
      tokenAddress: '0xtoken',
      chain: ChainIdSchema.parse(8453),
      days: 30
    })

    expect(result).toEqual({
      source: 'nansen',
      chain: 'base',
      token_address: '0xtoken',
      label: 'smart_money',
      date_from: '2026-06-16',
      date_to: '2026-07-16',
      granularity: 'daily',
      rows: [
        {
          date: '2026-07-15',
          price_usd: 1.23,
          token_amount: 1000,
          value_usd: 1230,
          holders_count: 55,
          total_inflows_count: 7,
          total_outflows_count: 3,
          total_inflows_dex: null,
          total_outflows_dex: null,
          total_inflows_cex: 2,
          total_outflows_cex: 1
        }
      ]
    })

    const [requestUrl, requestInit] = fetchSpy.mock.calls[0] ?? []
    expect(String(requestUrl)).toBe('https://api.nansen.ai/api/v1/tgm/flows')
    expect(requestBody(requestInit)).toEqual({
      chain: 'base',
      token_address: '0xtoken',
      date: { from: '2026-06-16', to: '2026-07-16' },
      label: 'smart_money',
      pagination: { page: 1, per_page: 32 },
      order_by: [{ field: 'date', direction: 'DESC' }]
    })
  })

  it('paginates token flows across hourly pages and reports hourly granularity', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-07-16T12:00:00Z').getTime())
    const hourlyRow = (hour: number): Record<string, unknown> => ({
      date: `2026-07-16T${String(hour).padStart(2, '0')}:00:00`,
      price_usd: 1,
      token_amount: 1,
      value_usd: 1,
      holders_count: 1,
      total_inflows_count: 0,
      total_outflows_count: 0,
      total_inflows_dex: 0,
      total_outflows_dex: 0,
      total_inflows_cex: 0,
      total_outflows_cex: 0
    })
    // 7-day window -> hourly -> 170 rows needed; page size 100: full first
    // page, short second page (loop must follow up and then stop).
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({ data: Array.from({ length: 100 }, (_, i) => hourlyRow(i % 24)) })
      )
      .mockResolvedValueOnce(
        jsonResponse({ data: Array.from({ length: 70 }, (_, i) => hourlyRow(i % 24)) })
      )

    const result = await buildService().getTokenFlows({
      tokenAddress: '0xtoken',
      chain: ChainIdSchema.parse(8453),
      days: 7
    })

    expect(result.granularity).toBe('hourly')
    expect(result.rows).toHaveLength(170)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(requestBody(fetchSpy.mock.calls[0]?.[1]).pagination).toEqual({ page: 1, per_page: 100 })
    expect(requestBody(fetchSpy.mock.calls[1]?.[1]).pagination).toEqual({ page: 2, per_page: 100 })
  })

  it('normalizes the wallet PnL summary including string-numbers', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        pagination: { page: 1, per_page: 100, is_last_page: true },
        top5_tokens: [
          {
            realized_pnl: '1500.5',
            realized_roi: 0.42,
            token_address: '0xwin',
            token_symbol: 'WIN',
            chain: 'ethereum'
          }
        ],
        traded_token_count: 9,
        traded_times: '42',
        realized_pnl_usd: 12345.67,
        realized_pnl_percent: 88.1,
        win_rate: 61.5
      })
    )

    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-07-16T12:00:00Z').getTime())
    const result = await buildService().getWalletPnl({
      address: '0xwallet',
      chain: ChainIdSchema.parse(1),
      days: 30
    })

    expect(result).toEqual({
      source: 'nansen',
      address: '0xwallet',
      chain: 'ethereum',
      realized_pnl_usd: 12345.67,
      realized_pnl_percent: 88.1,
      unrealized_pnl_usd: null,
      win_rate_pct: 61.5,
      traded_token_count: 9,
      traded_times: 42,
      top_tokens: [
        {
          chain: 'ethereum',
          token_address: '0xwin',
          symbol: 'WIN',
          realized_pnl_usd: 1500.5,
          realized_roi: 0.42
        }
      ]
    })

    const [requestUrl, requestInit] = fetchSpy.mock.calls[0] ?? []
    expect(String(requestUrl)).toBe('https://api.nansen.ai/api/v1/profiler/address/pnl-summary')
    expect(requestBody(requestInit)).toEqual({
      address: '0xwallet',
      chain: 'ethereum',
      date: { from: '2026-06-16', to: '2026-07-16' }
    })
  })

  it('surfaces plan-gate 403 errors with the API key redacted', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(`{"detail":"API key ${API_KEY} is not authorized for this endpoint"}`, {
        status: 403,
        statusText: 'Forbidden'
      })
    )

    let caught: unknown = null
    try {
      await buildService().getWalletPnl({
        address: '0xwallet',
        chain: ChainIdSchema.parse(1),
        days: 30
      })
    } catch (error: unknown) {
      caught = error
    }

    expect(caught).toBeInstanceOf(Error)
    const message = caught instanceof Error ? caught.message : ''
    expect(message).toContain('403')
    expect(message).toContain('not authorized')
    expect(message).not.toContain(API_KEY)
    // 403 is not retryable — exactly one request.
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('throws the env-var message without calling fetch when unconfigured', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    await expect(buildService('').getNetflows({ timeframe: '7d', limit: 25 })).rejects.toThrow(
      'NANSEN_API_KEY is not set; Nansen smart-money lookups are disabled'
    )
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
