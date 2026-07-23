import { readFile } from 'node:fs/promises'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { BirdeyeService } from '@/services/BirdeyeService'
import { CoinService } from '@/services/CoinService'
import { ExchangesService } from '@/services/ExchangesService'
import { MarketService } from '@/services/MarketService'
import { NansenService } from '@/services/NansenService'
import { OnchainService } from '@/services/OnchainService'
import { StocksService } from '@/services/StocksService'

type CredentialPlacement =
  | { readonly kind: 'header'; readonly name: string }
  | { readonly kind: 'query'; readonly name: string }

type EgressProbe = {
  readonly label: string
  readonly envName: string
  readonly origin: string
  readonly credential: CredentialPlacement
  readonly invoke: (apiKey: string) => Promise<unknown>
}

const PROVIDER_ENV_NAMES = [
  'BIRDEYE_API_KEY',
  'COIN_GECKO_PRO_API_KEY',
  'MARKETSTACK_API_KEY',
  'NANSEN_API_KEY'
] as const

const EGRESS_PROBES: readonly EgressProbe[] = [
  {
    label: 'CoinGecko coin',
    envName: 'COIN_GECKO_PRO_API_KEY',
    origin: 'https://pro-api.coingecko.com',
    credential: { kind: 'header', name: 'x-cg-pro-api-key' },
    invoke: (apiKey) => new CoinService({ apiKey }).getRates()
  },
  {
    label: 'CoinGecko market',
    envName: 'COIN_GECKO_PRO_API_KEY',
    origin: 'https://pro-api.coingecko.com',
    credential: { kind: 'header', name: 'x-cg-pro-api-key' },
    invoke: (apiKey) => new MarketService({ apiKey }).getGlobal()
  },
  {
    label: 'CoinGecko onchain',
    envName: 'COIN_GECKO_PRO_API_KEY',
    origin: 'https://pro-api.coingecko.com',
    credential: { kind: 'header', name: 'x-cg-pro-api-key' },
    invoke: (apiKey) => new OnchainService({ apiKey }).getNetworks({ limit: 50 })
  },
  {
    label: 'CoinGecko exchanges',
    envName: 'COIN_GECKO_PRO_API_KEY',
    origin: 'https://pro-api.coingecko.com',
    credential: { kind: 'header', name: 'x-cg-pro-api-key' },
    invoke: (apiKey) => new ExchangesService({ apiKey }).list({ limit: 10 })
  },
  {
    label: 'BirdEye',
    envName: 'BIRDEYE_API_KEY',
    origin: 'https://public-api.birdeye.so',
    credential: { kind: 'header', name: 'X-API-KEY' },
    invoke: (apiKey) =>
      new BirdeyeService({ apiKey }).getOverview({
        address: 'So11111111111111111111111111111111111111112',
        chain: 'solana'
      })
  },
  {
    label: 'Nansen',
    envName: 'NANSEN_API_KEY',
    origin: 'https://api.nansen.ai',
    credential: { kind: 'header', name: 'apiKey' },
    invoke: (apiKey) => new NansenService({ apiKey }).getBalances({ wallet: '0xabc', chain: 'all' })
  },
  {
    label: 'Marketstack',
    envName: 'MARKETSTACK_API_KEY',
    origin: 'https://api.marketstack.com',
    credential: { kind: 'query', name: 'access_key' },
    invoke: (apiKey) =>
      new StocksService({ apiKey }).getCandles({
        symbol: 'AAPL',
        from: null,
        to: null,
        limit: 100
      })
  }
]

describe('billed provider egress contract', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('binds the exact four catalog environment names', async () => {
    const envSource = await readFile(new URL('../../src/common/Env.ts', import.meta.url), 'utf8')
    const declarations = [
      ...envSource.matchAll(
        /export const ([A-Z0-9_]+_API_KEY) = process\.env\.([A-Z0-9_]+_API_KEY) \?\? ''/g
      )
    ]

    expect(declarations).toHaveLength(PROVIDER_ENV_NAMES.length)
    for (const name of PROVIDER_ENV_NAMES) {
      expect(envSource).toContain(`export const ${name} = process.env.${name} ?? ''`)
    }
  })

  it('keeps every keyed service on its catalog origin and redacts echoed credentials', async () => {
    const apiKey = 'ZIPBOX_MUTATION_SENTINEL_KEY'
    const responseBody = `provider echoed credential ${apiKey}`
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(responseBody, { status: 502, statusText: 'Bad Gateway' }))

    for (const [index, probe] of EGRESS_PROBES.entries()) {
      const error = await probe.invoke(apiKey).catch((caught: unknown) => caught)

      expect(error, probe.label).toBeInstanceOf(Error)
      if (error instanceof Error) {
        expect(error.message, probe.label).toContain('failed: 502 Bad Gateway')
        expect(error.message, probe.label).not.toContain(apiKey)
        expect(error.message, probe.label).not.toContain(responseBody)
      }

      const [input, init] = fetchSpy.mock.calls[index] ?? []
      const requestUrl = new URL(String(input), 'https://invalid.example')
      expect(requestUrl.origin, probe.label).toBe(probe.origin)

      if (probe.credential.kind === 'header') {
        expect(new Headers(init?.headers).get(probe.credential.name), probe.label).toBe(apiKey)
      } else {
        expect(requestUrl.searchParams.get(probe.credential.name), probe.label).toBe(apiKey)
      }
    }
  })

  it('fails every keyed service closed before fetch when its placeholder is absent', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    for (const probe of EGRESS_PROBES) {
      await expect(probe.invoke(''), probe.label).rejects.toThrow(`${probe.envName} is not set`)
    }

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('rejects the retired zero-rated and PR 2573 branch assumptions', async () => {
    const migrationPlan = await readFile(
      new URL('../../plans/lucy-sunset-two-pr-migration.md', import.meta.url),
      'utf8'
    )

    expect(migrationPlan).toContain(
      'Transparent MITM and explicit HTTP-proxy egress both enter the same tollbooth billing path.'
    )
    expect(migrationPlan).toContain('Neither transport is zero-rated.')
    expect(migrationPlan).toContain(
      'Historical PR #2573 is evidence for that accepted behavior, not a branch or merge'
    )
    expect(migrationPlan).not.toMatch(/forced-mitm and are zero-rated/i)
    expect(migrationPlan).not.toMatch(/keyless direct egress.*is unmetered/i)
  })
})
