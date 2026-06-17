import { EvmChainId, EvmChainIdSchema } from '@shared/types/ChainId'
import type { IEvmRegistry } from '@shared/types/IEvmRegistry'
import { Chain, createPublicClient, http, PublicClient, Transport } from 'viem'

type ChainConfig = [Chain, string]

export class EvmRegistry implements IEvmRegistry {
  private readonly chainConfigs: Map<number, ChainConfig> = new Map()
  private readonly publicClients: Map<number, PublicClient> = new Map()
  private readonly transports: Record<number, Transport> = {}

  constructor(chainConfigs: ChainConfig[]) {
    // Ensure no duplicate chains
    const seenChainIds = new Set<number>()

    for (const [chain, rpcUrl] of chainConfigs) {
      if (seenChainIds.has(chain.id)) {
        throw new Error(`Duplicate chain id ${chain.id} found`)
      }

      seenChainIds.add(chain.id)
      this.chainConfigs.set(chain.id, [chain, rpcUrl])

      // Create transport with retry configuration
      const transport = http(rpcUrl, {
        retryCount: 3,
        retryDelay: 1000
      })

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
