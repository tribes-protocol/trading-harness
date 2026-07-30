import { z } from 'zod'

import { type EvmChainId, EvmChainIdSchema, SolanaChainIdSchema } from '@/types/ChainId'
import { type EthAddress, EthAddressSchema, type EthTokenId, EthTokenIdSchema } from '@/types/Eth'
import { BigintSchema } from '@/types/Lang'
import {
  type SolAddress,
  SolAddressSchema,
  type SPLTokenId,
  SPLTokenIdSchema
} from '@/types/Solana'
import { type WalletAddress, WalletAddressSchema } from '@/types/Wallet'

export const ListWalletsCommandOptionsSchema = z.object({
  out: z.string().nullish()
})
export type ListWalletsCommandOptions = z.infer<typeof ListWalletsCommandOptionsSchema>

export const ListWalletAssetsCommandOptionsSchema = z.object({
  out: z.string().nullish(),
  walletAddresses: WalletAddressSchema.array().nonempty({
    message: 'Provide at least one wallet address.'
  }),
  chainIds: z.array(EvmChainIdSchema).nullish()
})
export type ListWalletAssetsCommandOptions = z.infer<typeof ListWalletAssetsCommandOptionsSchema>

export type ListWalletAssetsParams = {
  readonly walletAddresses: WalletAddress[]
  readonly chainIds: EvmChainId[] | undefined
}

export const EthTransferCommandOptionsSchema = z.object({
  out: z.string().nullish(),
  chainId: EvmChainIdSchema,
  tokenId: EthTokenIdSchema,
  amount: BigintSchema,
  toAddress: EthAddressSchema
})
export type EthTransferCommandOptions = z.infer<typeof EthTransferCommandOptionsSchema>

export type BuildEthTransferParams = {
  readonly chainId: EvmChainId
  readonly tokenId: EthTokenId
  readonly amount: bigint
  readonly toAddress: EthAddress
}

export const SolTransferCommandOptionsSchema = z.object({
  out: z.string().nullish(),
  chainId: SolanaChainIdSchema,
  tokenId: SPLTokenIdSchema,
  amount: BigintSchema,
  toAddress: SolAddressSchema,
  fromAddress: SolAddressSchema
})
export type SolTransferCommandOptions = z.infer<typeof SolTransferCommandOptionsSchema>

export type BuildSolTransferParams = {
  readonly chainId: 'solana'
  readonly tokenId: SPLTokenId
  readonly amount: bigint
  readonly toAddress: SolAddress
  readonly fromAddress: SolAddress
}
