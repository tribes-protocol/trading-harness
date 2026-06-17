import type { EvmChainId } from '@shared/types/ChainId'
import type { Chain, PublicClient, Transport } from 'viem'

export interface IEvmRegistry {
  getPublicClient(chainId: EvmChainId): PublicClient
  getTransports(): Record<number, Transport>
  getChainConfig(chainId: EvmChainId): Chain
  getRpcUrl(chainId: EvmChainId): string
  getSupportedChainIds(): EvmChainId[]
  getSupportedChains(): readonly [Chain, ...Chain[]]
  hasChain(chainId: number): boolean
  getChainName(chainId: EvmChainId): string
}
