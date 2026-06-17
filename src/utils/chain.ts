import type { Network } from '@/types/chain'
import type { ChainId } from '@/types/ChainId'

export function discernChain(chainId: ChainId): Network {
  switch (chainId) {
    case 'solana':
      return 'solana'
    case 1:
    case 10:
    case 56:
    case 8453:
    case 42161:
    case 137:
      return 'evm'
  }
}

export function getChainName(chainId: ChainId): string {
  switch (chainId) {
    case 1:
      return 'Ethereum'
    case 10:
      return 'Optimism'
    case 56:
      return 'BNB Chain'
    case 137:
      return 'Polygon'
    case 8453:
      return 'Base'
    case 42161:
      return 'Arbitrum'
    case 'solana':
      return 'Solana'
  }
}
