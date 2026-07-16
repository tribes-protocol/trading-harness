import { arbitrum, base, bsc, mainnet, optimism, polygon } from 'viem/chains'

import type { ChainId, EvmChainId } from '@/types/ChainId'

// Per-provider network identifiers for the harness's supported chains.
// Each provider names the same chains differently (Birdeye 'ethereum',
// Moralis 'eth', Alchemy 'eth-mainnet', CoinGecko onchain 'eth', Nansen
// 'ethereum'); keeping the maps in one place stops per-service drift.
// All slugs confirmed against provider docs (July 2026).

export const BIRDEYE_CHAIN_SLUGS: Readonly<Record<ChainId, string>> = {
  [mainnet.id]: 'ethereum',
  [base.id]: 'base',
  [bsc.id]: 'bsc',
  [arbitrum.id]: 'arbitrum',
  [optimism.id]: 'optimism',
  [polygon.id]: 'polygon',
  solana: 'solana'
}

export const MORALIS_EVM_CHAIN_SLUGS: Readonly<Record<EvmChainId, string>> = {
  [mainnet.id]: 'eth',
  [base.id]: 'base',
  [bsc.id]: 'bsc',
  [arbitrum.id]: 'arbitrum',
  [optimism.id]: 'optimism',
  [polygon.id]: 'polygon'
}

export const ALCHEMY_NETWORK_SLUGS: Readonly<Record<ChainId, string>> = {
  [mainnet.id]: 'eth-mainnet',
  [base.id]: 'base-mainnet',
  [bsc.id]: 'bnb-mainnet',
  [arbitrum.id]: 'arb-mainnet',
  [optimism.id]: 'opt-mainnet',
  [polygon.id]: 'polygon-mainnet',
  solana: 'solana-mainnet'
}

// alchemy_getAssetTransfers is documented on these mainnets only (notably NOT
// BNB); callers must fall back to another provider elsewhere.
export const ALCHEMY_TRANSFERS_CHAIN_IDS: readonly EvmChainId[] = [
  mainnet.id,
  base.id,
  arbitrum.id,
  optimism.id,
  polygon.id
]

export const COINGECKO_ONCHAIN_NETWORK_SLUGS: Readonly<Record<ChainId, string>> = {
  [mainnet.id]: 'eth',
  [base.id]: 'base',
  [bsc.id]: 'bsc',
  [arbitrum.id]: 'arbitrum',
  [optimism.id]: 'optimism',
  [polygon.id]: 'polygon_pos',
  solana: 'solana'
}

export const NANSEN_CHAIN_SLUGS: Readonly<Record<ChainId, string>> = {
  [mainnet.id]: 'ethereum',
  [base.id]: 'base',
  [bsc.id]: 'bnb',
  [arbitrum.id]: 'arbitrum',
  [optimism.id]: 'optimism',
  [polygon.id]: 'polygon',
  solana: 'solana'
}
