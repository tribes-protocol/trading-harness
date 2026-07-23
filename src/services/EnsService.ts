import { normalize } from 'viem/ens'

import type { EnsResolution, EnsReverseLookup } from '@/types/Ens'
import {
  EnsResolutionSchema,
  EnsReverseLookupSchema,
  EnsSubgraphDomainsResponseSchema
} from '@/types/Ens'
import type { HexString } from '@/types/Lang'
import { compactMap, ensureJsonTreeString, isNullish } from '@/utils/Lang'

// The minimal surface of a viem mainnet PublicClient the ENS commands need.
// The CLI injects EVM_REGISTRY.getPublicClient(mainnet.id), which already
// routes through the /agent/rpc control-plane proxy.
type EnsClient = {
  getEnsAddress(args: { name: string }): Promise<string | null>
  getEnsAvatar(args: { name: string }): Promise<string | null>
  getEnsText(args: { name: string; key: string }): Promise<string | null>
  getEnsName(args: { address: HexString }): Promise<string | null>
}

type EnsServiceParams = {
  readonly client: EnsClient
}

type ResolveParams = {
  readonly name: string
}

type ReverseParams = {
  readonly address: HexString
}

const ENS_SUBGRAPH_URL = 'https://api.thegraph.com/subgraphs/name/ensdomains/ens'
const OWNED_DOMAINS_LIMIT = 50
const ERROR_BODY_MAX_CHARS = 300

// Query shaped from the public ENS subgraph docs (https://docs.ens.domains/web/subgraph):
// Domain.name plus the derived Registration.expiryDate (unix seconds).
const OWNED_DOMAINS_QUERY = `query OwnedDomains($owner: String!, $first: Int!) {
  domains(where: { owner: $owner }, first: $first) {
    name
    registration { expiryDate }
  }
}`

export class EnsService {
  private readonly client: EnsClient

  constructor(params: EnsServiceParams) {
    this.client = params.client
  }

  async resolve(params: ResolveParams): Promise<EnsResolution> {
    const name = normalize(params.name)
    const address = await this.client.getEnsAddress({ name })
    if (isNullish(address)) {
      return EnsResolutionSchema.parse({
        source: 'ens',
        name,
        address: null,
        avatar: null,
        records: { url: null, twitter: null, github: null }
      })
    }
    const [avatar, url, twitter, github] = await Promise.all([
      this.client.getEnsAvatar({ name }),
      this.client.getEnsText({ name, key: 'url' }),
      this.client.getEnsText({ name, key: 'com.twitter' }),
      this.client.getEnsText({ name, key: 'com.github' })
    ])
    return EnsResolutionSchema.parse({
      source: 'ens',
      name,
      address,
      avatar,
      records: { url, twitter, github }
    })
  }

  async reverse(params: ReverseParams): Promise<EnsReverseLookup> {
    const [primaryName, raw] = await Promise.all([
      this.client.getEnsName({ address: params.address }),
      this.fetchOwnedDomains(params.address)
    ])
    const parsed = EnsSubgraphDomainsResponseSchema.parse(raw)
    if (!isNullish(parsed.errors) && parsed.errors.length > 0) {
      const messages = compactMap(parsed.errors.map((error) => error.message))
      throw new Error(`ENS subgraph returned errors: ${messages.join('; ')}`)
    }
    const owned = compactMap(
      (parsed.data?.domains ?? []).map((domain) => {
        if (isNullish(domain.name)) {
          return null
        }
        return {
          name: domain.name,
          expiry: this.asEpochMs(domain.registration?.expiryDate)
        }
      })
    )
    return EnsReverseLookupSchema.parse({
      source: 'ens',
      address: params.address,
      primary_name: primaryName,
      owned
    })
  }

  private async fetchOwnedDomains(address: HexString): Promise<unknown> {
    const response = await fetch(ENS_SUBGRAPH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: ensureJsonTreeString({
        query: OWNED_DOMAINS_QUERY,
        variables: { owner: address.toLowerCase(), first: OWNED_DOMAINS_LIMIT }
      })
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(
        `ENS subgraph failed: ${response.status} ${response.statusText} ${body.slice(0, ERROR_BODY_MAX_CHARS)}`
      )
    }
    const data: unknown = await response.json()
    return data
  }

  // The subgraph encodes expiryDate as unix seconds in a decimal string;
  // anything non-finite collapses to null. Output is epoch ms.
  private asEpochMs(value: unknown): number | null {
    if (typeof value === 'string' && value.trim() !== '') {
      const seconds = Number(value)
      return Number.isFinite(seconds) ? seconds * 1000 : null
    }
    return null
  }
}
