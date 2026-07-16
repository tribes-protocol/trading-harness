import { Chain, createPublicClient, fallback, http, PublicClient, Transport } from 'viem'

import { EvmChainId, EvmChainIdSchema } from '@/types/ChainId'
import type { IEvmRegistry } from '@/types/IEvmRegistry'

// [chain, primary RPC URL, optional ordered fallback RPC URLs]
type ChainConfig = [Chain, string, string[]?]

export class EvmRegistry implements IEvmRegistry {
  private readonly chainConfigs: Map<number, ChainConfig> = new Map()
  private readonly publicClients: Map<number, PublicClient> = new Map()
  private readonly transports: Record<number, Transport> = {}

  constructor(chainConfigs: ChainConfig[]) {
    // Ensure no duplicate chains
    const seenChainIds = new Set<number>()

    for (const [chain, rpcUrl, fallbackRpcUrls] of chainConfigs) {
      if (seenChainIds.has(chain.id)) {
        throw new Error(`Duplicate chain id ${chain.id} found`)
      }

      seenChainIds.add(chain.id)
      this.chainConfigs.set(chain.id, [chain, rpcUrl, fallbackRpcUrls])

      // Create transport with retry configuration; when fallback RPC URLs are
      // configured (e.g. Alchemy), viem rotates to them on primary failure.
      // Inner transports inside fallback() MUST NOT set their own retryCount:
      // an explicit inner value overrides the 0 that fallback() injects, and
      // combined with the outer transport's own retries it multiplies every
      // failing call by 8x (4 inner attempts x 4 rotations x 2 transports).
      // Single-URL chains keep the retry config on the http transport itself.
      const allRpcUrls = [rpcUrl, ...(fallbackRpcUrls ?? [])]
      const transport =
        allRpcUrls.length === 1
          ? http(rpcUrl, {
              retryCount: 3,
              retryDelay: 1000
            })
          : fallback(
              allRpcUrls.map((url) => http(url)),
              { retryCount: 3, retryDelay: 1000 }
            )

      this.transports[chain.id] = transport

      // Create and cache public client immediately
      const publicClient = createPublicClient({
        chain,
        transport
      })

      this.publicClients.set(chain.id, publicClient)
    }
  }

  getPublicClient(chainId: EvmChainId): PublicClient {
    const client = this.publicClients.get(chainId)
    if (!client) {
      throw new Error(`No public client found for chain id ${chainId}`)
    }
    return client
  }

  getTransports(): Record<number, Transport> {
    return this.transports
  }

  getChainConfig(chainId: EvmChainId): Chain {
    const config = this.chainConfigs.get(chainId)
    if (!config) {
      throw new Error(`No chain config found for chain id ${chainId}`)
    }
    return config[0]
  }

  getRpcUrl(chainId: EvmChainId): string {
    const config = this.chainConfigs.get(chainId)
    if (!config) {
      throw new Error(`No chain config found for chain id ${chainId}`)
    }
    return config[1]
  }

  getSupportedChainIds(): EvmChainId[] {
    return Array.from(this.chainConfigs.keys()).map((id) => EvmChainIdSchema.parse(id))
  }

  getSupportedChains(): readonly [Chain, ...Chain[]] {
    const chains = Array.from(this.chainConfigs.values()).map(([chain]) => chain)
    if (chains.length === 0) {
      throw new Error('No chains configured')
    }
    /* eslint-disable @typescript-eslint/consistent-type-assertions */
    // TypeScript cannot narrow a dynamic array to a non-empty
    // readonly tuple; the length > 0 guard above guarantees
    // the cast is safe at runtime.
    return chains as unknown as readonly [Chain, ...Chain[]]
    /* eslint-enable @typescript-eslint/consistent-type-assertions */
  }

  hasChain(chainId: number): boolean {
    return this.chainConfigs.has(chainId)
  }

  getChainName(chainId: EvmChainId): string {
    return this.getChainConfig(chainId).name
  }
}
