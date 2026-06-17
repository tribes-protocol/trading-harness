import {
  PUBLIC_ARB_RPC_URL,
  PUBLIC_BASE_RPC_URL,
  PUBLIC_BSC_RPC_URL,
  PUBLIC_MAINNET_RPC_URL,
  PUBLIC_OPTIMISM_RPC_URL,
  PUBLIC_POLYGON_POS_RPC_URL,
  PUBLIC_SOLANA_RPC_URL
} from '@shared/common/constants'
import { EvmRegistry } from '@shared/helpers/EvmRegistry'
import { Web3Client } from '@shared/helpers/Web3Client'
import { Connection } from '@solana/web3.js'
import { arbitrum, base, bsc, mainnet, optimism, polygon } from 'viem/chains'

export const EVM_REGISTRY = new EvmRegistry([
  [base, PUBLIC_BASE_RPC_URL],
  [mainnet, PUBLIC_MAINNET_RPC_URL],
  [bsc, PUBLIC_BSC_RPC_URL],
  [arbitrum, PUBLIC_ARB_RPC_URL],
  [optimism, PUBLIC_OPTIMISM_RPC_URL],
  [polygon, PUBLIC_POLYGON_POS_RPC_URL]
])

export const SOL_CONNECTION = new Connection(PUBLIC_SOLANA_RPC_URL, 'confirmed')

export const WEB3_CLIENT = new Web3Client(EVM_REGISTRY, SOL_CONNECTION)
