import { describe, expect, test, vi } from 'vitest'

import { SwapBridgeService } from '@/services/SwapBridgeService'

function createQuoteResponseBody(): string {
  return '{"kind":"evm","fromToken":"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","fromChain":1,"fromAmount":"1000000","toToken":"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","toChain":42161,"toAmountMin":"990000","transactionRequests":[{"to":"0x1111111111111111111111111111111111111111","value":"0","data":"0x"}]}'
}

describe('SwapBridgeService', () => {
  test('parses successful quote response', async () => {
    const fetchSpy = vi.fn(
      async (_input: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
        expect(init?.method).toBe('POST')
        return new Response(createQuoteResponseBody(), {
          status: 200,
          headers: {
            'content-type': 'application/json'
          }
        })
      }
    )
    vi.stubGlobal('fetch', fetchSpy)

    const service = new SwapBridgeService({ apiBaseUrl: 'https://api.example.com' })
    const response = await service.quote({
      fromChain: 1,
      toChain: 42161,
      fromToken: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      toToken: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      fromAmount: 1000000n,
      fromAddress: '0x1111111111111111111111111111111111111111',
      toAddress: '0x1111111111111111111111111111111111111111',
      slippage: null
    })

    expect(response.kind).toBe('evm')
    expect(response.transactionRequests).toHaveLength(1)
  })

  test('throws quote error from API error body', async () => {
    const fetchSpy = vi.fn(async (): Promise<Response> => {
      return new Response('{"error":"route unavailable"}', {
        status: 400,
        headers: {
          'content-type': 'application/json'
        }
      })
    })
    vi.stubGlobal('fetch', fetchSpy)

    const service = new SwapBridgeService({ apiBaseUrl: 'https://api.example.com' })
    await expect(
      service.quote({
        fromChain: 1,
        toChain: 42161,
        fromToken: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        toToken: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        fromAmount: 1000000n,
        fromAddress: '0x1111111111111111111111111111111111111111',
        toAddress: '0x1111111111111111111111111111111111111111',
        slippage: null
      })
    ).rejects.toThrow('route unavailable')
  })

  test('throws fallback error when API error body is not JSON', async () => {
    const fetchSpy = vi.fn(async (): Promise<Response> => {
      return new Response('gateway timeout', {
        status: 504,
        statusText: 'Gateway Timeout',
        headers: {
          'content-type': 'text/plain'
        }
      })
    })
    vi.stubGlobal('fetch', fetchSpy)

    const service = new SwapBridgeService({ apiBaseUrl: 'https://api.example.com' })
    await expect(
      service.quote({
        fromChain: 1,
        toChain: 42161,
        fromToken: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        toToken: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        fromAmount: 1000000n,
        fromAddress: '0x1111111111111111111111111111111111111111',
        toAddress: '0x1111111111111111111111111111111111111111',
        slippage: null
      })
    ).rejects.toThrow('Failed to fetch quote: 504 Gateway Timeout')
  })
})
