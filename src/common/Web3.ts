import { Connection } from '@solana/web3.js'
import { arbitrum, base, bsc, mainnet, optimism, polygon } from 'viem/chains'

import {
  PUBLIC_ARB_RPC_URL,
  PUBLIC_BASE_RPC_URL,
  PUBLIC_BSC_RPC_URL,
  PUBLIC_MAINNET_RPC_URL,
  PUBLIC_OPTIMISM_RPC_URL,
  PUBLIC_POLYGON_POS_RPC_URL,
  PUBLIC_SOLANA_RPC_URL
} from '@/common/Constants'
import { ALCHEMY_API_KEY, API_BEARER_TOKEN, HELIUS_API_KEY } from '@/common/Env'
import { EvmRegistry } from '@/helpers/EvmRegistry'
import { ALCHEMY_NETWORK_SLUGS } from '@/helpers/ProviderChains'
import { Web3Client } from '@/helpers/Web3Client'
import type { ChainId } from '@/types/ChainId'

// When ALCHEMY_API_KEY is set, each EVM chain gets an Alchemy fallback RPC so
// a Tribes-proxy outage degrades to a provider hop instead of a hard failure.
function alchemyFallbackUrls(chainId: ChainId): string[] {
  if (ALCHEMY_API_KEY.length === 0) {
    return []
  }
  return [`https://${ALCHEMY_NETWORK_SLUGS[chainId]}.g.alchemy.com/v2/${ALCHEMY_API_KEY}`]
}

export const EVM_REGISTRY = new EvmRegistry([
  [base, PUBLIC_BASE_RPC_URL, alchemyFallbackUrls(base.id)],
  [mainnet, PUBLIC_MAINNET_RPC_URL, alchemyFallbackUrls(mainnet.id)],
  [bsc, PUBLIC_BSC_RPC_URL, alchemyFallbackUrls(bsc.id)],
  [arbitrum, PUBLIC_ARB_RPC_URL, alchemyFallbackUrls(arbitrum.id)],
  [optimism, PUBLIC_OPTIMISM_RPC_URL, alchemyFallbackUrls(optimism.id)],
  [polygon, PUBLIC_POLYGON_POS_RPC_URL, alchemyFallbackUrls(polygon.id)]
])

// The Solana Connection accepts a single endpoint, so pick at construction:
// the Tribes proxy when a bearer token exists (the proxy URL embeds it),
// otherwise Helius when configured — a tokenless environment would get a
// guaranteed-broken proxy URL.
function solanaRpcUrl(): string {
  if (API_BEARER_TOKEN.length === 0 && HELIUS_API_KEY.length > 0) {
    return `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
  }
  return PUBLIC_SOLANA_RPC_URL
}

export const SOL_CONNECTION = new Connection(solanaRpcUrl(), 'confirmed')

export const WEB3_CLIENT = new Web3Client(EVM_REGISTRY, SOL_CONNECTION)
