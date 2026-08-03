import { afterEach, describe, expect, it, vi } from 'vitest'

import { EnsService } from '@/services/EnsService'
import { ensureJsonTreeString } from '@/utils/Lang'

const TEST_ADDRESS = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'
const SUBGRAPH_URL = 'https://api.thegraph.com/subgraphs/name/ensdomains/ens'

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(ensureJsonTreeString(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

type MockClientParams = {
  readonly address: string | null
  readonly avatar: string | null
  readonly texts: Record<string, string | null>
  readonly primaryName: string | null
}

function makeClient(params: MockClientParams) {
  return {
    getEnsAddress: vi.fn(async (_args: { name: string }) => params.address),
    getEnsAvatar: vi.fn(async (_args: { name: string }) => params.avatar),
    getEnsText: vi.fn(
      async (args: { name: string; key: string }) => params.texts[args.key] ?? null
    ),
    getEnsName: vi.fn(async (_args: { address: `0x${string}` }) => params.primaryName)
  }
}

const EMPTY_CLIENT_PARAMS: MockClientParams = {
  address: null,
  avatar: null,
  texts: {},
  primaryName: null
}

describe('EnsService', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('resolves a name to address, avatar, and records with the normalized name', async () => {
    const client = makeClient({
      address: TEST_ADDRESS,
      avatar: 'https://euc.li/vitalik.eth',
      texts: {
        url: 'https://vitalik.ca',
        'com.twitter': 'VitalikButerin',
        'com.github': 'vbuterin'
      },
      primaryName: null
    })

    const result = await new EnsService({ client }).resolve({ name: 'Vitalik.eth' })

    expect(result).toEqual({
      source: 'ens',
      name: 'vitalik.eth',
      address: TEST_ADDRESS,
      avatar: 'https://euc.li/vitalik.eth',
      records: {
        url: 'https://vitalik.ca',
        twitter: 'VitalikButerin',
        github: 'vbuterin'
      }
    })

    expect(client.getEnsAddress).toHaveBeenCalledWith({ name: 'vitalik.eth' })
    expect(client.getEnsAvatar).toHaveBeenCalledWith({ name: 'vitalik.eth' })
    expect(client.getEnsText.mock.calls.map((call) => call[0]?.key)).toEqual([
      'url',
      'com.twitter',
      'com.github'
    ])
  })

  it('returns nulls and skips record lookups when the name does not resolve', async () => {
    const client = makeClient(EMPTY_CLIENT_PARAMS)

    const result = await new EnsService({ client }).resolve({ name: 'no-such-name.eth' })

    expect(result).toEqual({
      source: 'ens',
      name: 'no-such-name.eth',
      address: null,
      avatar: null,
      records: { url: null, twitter: null, github: null }
    })
    expect(client.getEnsAvatar).not.toHaveBeenCalled()
    expect(client.getEnsText).not.toHaveBeenCalled()
  })

  it('reverses an address into the primary name and owned domains from the subgraph', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        data: {
          domains: [
            { name: 'leo.eth', registration: { expiryDate: '1800000000' } },
            { name: 'vault.leo.eth', registration: null },
            { name: null, registration: { expiryDate: '1900000000' } }
          ]
        }
      })
    )
    const client = makeClient({ ...EMPTY_CLIENT_PARAMS, primaryName: 'leo.eth' })

    const result = await new EnsService({ client }).reverse({ address: TEST_ADDRESS })

    expect(result).toEqual({
      source: 'ens',
      address: TEST_ADDRESS,
      primary_name: 'leo.eth',
      owned: [
        { name: 'leo.eth', expiry: 1800000000000 },
        { name: 'vault.leo.eth', expiry: null }
      ]
    })

    expect(client.getEnsName).toHaveBeenCalledWith({ address: TEST_ADDRESS })
    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe(SUBGRAPH_URL)
    expect(fetchSpy.mock.calls[0]?.[1]?.method).toBe('POST')
    const body = String(fetchSpy.mock.calls[0]?.[1]?.body)
    expect(body).toContain(TEST_ADDRESS.toLowerCase())
    expect(body).toContain('domains(where: { owner: $owner }, first: $first)')
  })

  it('throws when the subgraph responds with GraphQL errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ errors: [{ message: 'indexing has failed' }] })
    )
    const client = makeClient(EMPTY_CLIENT_PARAMS)

    await expect(new EnsService({ client }).reverse({ address: TEST_ADDRESS })).rejects.toThrow(
      'ENS subgraph returned errors: indexing has failed'
    )
  })

  it('throws on subgraph HTTP errors with status and truncated body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('server exploded', { status: 502, statusText: 'Bad Gateway' })
    )
    const client = makeClient(EMPTY_CLIENT_PARAMS)

    const error = await new EnsService({ client })
      .reverse({ address: TEST_ADDRESS })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(Error)
    if (error instanceof Error) {
      expect(error.message).toContain('ENS subgraph failed: 502 Bad Gateway server exploded')
    }
  })
})
