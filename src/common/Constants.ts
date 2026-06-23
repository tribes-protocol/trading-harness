import { arbitrum, base, bsc, mainnet, optimism, polygon } from 'viem/chains'

import { API_BASE_URL, API_BEARER_TOKEN } from '@/common/Env'
import { type ChainId } from '@/types/ChainId'

function buildRpcUrl(chainId: ChainId): string {
  return new URL(`/agent/rpc/${chainId}/${API_BEARER_TOKEN}`, API_BASE_URL).toString()
}

export const PUBLIC_BASE_RPC_URL = buildRpcUrl(base.id)

export const PUBLIC_MAINNET_RPC_URL = buildRpcUrl(mainnet.id)

export const PUBLIC_BSC_RPC_URL = buildRpcUrl(bsc.id)

export const PUBLIC_ARB_RPC_URL = buildRpcUrl(arbitrum.id)

export const PUBLIC_OPTIMISM_RPC_URL = buildRpcUrl(optimism.id)

export const PUBLIC_POLYGON_POS_RPC_URL = buildRpcUrl(polygon.id)

export const PUBLIC_SOLANA_RPC_URL = buildRpcUrl('solana')

export const SAFE_CONFIRMATIONS: Readonly<Record<ChainId, bigint>> = {
  [base.id]: BigInt(6),
  [mainnet.id]: BigInt(6),
  [bsc.id]: BigInt(7),
  [arbitrum.id]: BigInt(10),
  [optimism.id]: BigInt(6),
  [polygon.id]: BigInt(25),
  solana: BigInt(2)
}
