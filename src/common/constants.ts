import { type ChainId } from '@shared/types/ChainId'
import { arbitrum, base, bsc, mainnet, optimism, polygon } from 'viem/chains'

// RPC provider keys are injected via the environment — never hardcode them.
// Set ALCHEMY_API_KEY and HELIUS_API_KEY in the sandbox/runtime env.
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY ?? ''
const HELIUS_API_KEY = process.env.HELIUS_API_KEY ?? ''

export const PUBLIC_BASE_RPC_URL = `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`

export const PUBLIC_MAINNET_RPC_URL = `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`

export const PUBLIC_BSC_RPC_URL = `https://bnb-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`

export const PUBLIC_ARB_RPC_URL = `https://arb-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`

export const PUBLIC_OPTIMISM_RPC_URL = `https://opt-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`

export const PUBLIC_POLYGON_POS_RPC_URL = `https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`

export const PUBLIC_SOLANA_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`

export const SAFE_CONFIRMATIONS: Readonly<Record<ChainId, bigint>> = {
  [base.id]: BigInt(6),
  [mainnet.id]: BigInt(6),
  [bsc.id]: BigInt(7),
  [arbitrum.id]: BigInt(10),
  [optimism.id]: BigInt(6),
  [polygon.id]: BigInt(25),
  solana: BigInt(2)
}
