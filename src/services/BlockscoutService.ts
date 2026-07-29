import {
  type BlockscoutAddress,
  BlockscoutAddressSchema,
  type BlockscoutContract,
  BlockscoutContractSchema,
  type BlockscoutHolders,
  BlockscoutHoldersSchema,
  type BlockscoutToken,
  BlockscoutTokenSchema,
  type BlockscoutTransactions,
  BlockscoutTransactionsSchema
} from '@/types/Blockscout'

const BLOCKSCOUT_BASE_URL = 'https://api.blockscout.com'

type BlockscoutServiceParams = {
  readonly apiKey: string
}

type AddressParams = {
  readonly chainId: number
  readonly address: string
}

type PagedAddressParams = {
  readonly chainId: number
  readonly address: string
  readonly limit: number | null
}

// Blockscout's multichain explorer gateway, scoped to contract vetting.
//
// Five reads, each answering a question the risk desk asks before sizing an EVM
// position: who is this address, is the contract verified and is it a proxy,
// what is the token, how concentrated is it, and what has the deployer done.
export class BlockscoutService {
  private readonly apiKey: string

  constructor(params: BlockscoutServiceParams) {
    this.apiKey = params.apiKey
  }

  // Identity for any address: contract or EOA, verified, scam-flagged, its
  // creator, and whether it is a proxy.
  async getAddress(params: AddressParams): Promise<BlockscoutAddress> {
    const json = await this.get(params.chainId, `addresses/${params.address}`, null)
    return BlockscoutAddressSchema.parse(json)
  }

  // Verification depth and proxy status. `is_verified` alone only means source
  // was published, which is why the fuller shape is surfaced.
  async getContract(params: AddressParams): Promise<BlockscoutContract> {
    const json = await this.get(params.chainId, `smart-contracts/${params.address}`, null)
    return BlockscoutContractSchema.parse(json)
  }

  async getToken(params: AddressParams): Promise<BlockscoutToken> {
    const json = await this.get(params.chainId, `tokens/${params.address}`, null)
    return BlockscoutTokenSchema.parse(json)
  }

  // Holder distribution — the concentration read. Balances are raw base units.
  async getTokenHolders(params: PagedAddressParams): Promise<BlockscoutHolders> {
    const json = await this.get(params.chainId, `tokens/${params.address}/holders`, params.limit)
    return BlockscoutHoldersSchema.parse(json)
  }

  // Transaction history. On a deployer address this is the "what else have they
  // shipped" trail that a single-token view cannot show.
  async getAddressTransactions(params: PagedAddressParams): Promise<BlockscoutTransactions> {
    const json = await this.get(
      params.chainId,
      `addresses/${params.address}/transactions`,
      params.limit
    )
    return BlockscoutTransactionsSchema.parse(json)
  }

  // --- transport -----------------------------------------------------------

  private async get(chainId: number, path: string, limit: number | null): Promise<unknown> {
    if (this.apiKey === '') {
      throw new Error(
        'BLOCKSCOUT_API_KEY is not set — the `onchain-evm` command group is unavailable on this box'
      )
    }
    const url = new URL(`/${chainId}/api/v2/${path}`, BLOCKSCOUT_BASE_URL)
    if (limit !== null) {
      url.searchParams.set('items_count', String(limit))
    }
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        // A BARE value, no `Bearer` scheme — Blockscout is the odd one out among
        // the bearer providers this harness talks to.
        Authorization: this.apiKey
      }
    })
    if (!response.ok) {
      throw new Error(this.transportError({ path, chainId, status: response.status, response }))
    }
    const json: unknown = await response.json()
    return json
  }

  // 402 and 404 are both worth translating, because the raw codes point the
  // wrong way. This host is x402-gated, so a request that arrives WITHOUT a key
  // is asked to pay rather than rejected as unauthorized — 402 means the
  // credential never made it, not that a balance ran out. And because the chain
  // id is validated as the first path segment, a 404 usually means an unknown
  // chain rather than a missing address.
  private transportError(params: {
    readonly path: string
    readonly chainId: number
    readonly status: number
    readonly response: Response
  }): string {
    const base = `Blockscout ${params.path} failed: ${params.status} ${params.response.statusText}`
    if (params.status === 402) {
      return `${base} — the request reached Blockscout without a key; this is a provider misconfiguration, not a spent balance`
    }
    if (params.status === 404) {
      return `${base} — chain id ${params.chainId} may not be supported, or the address does not exist on it`
    }
    return base
  }
}
