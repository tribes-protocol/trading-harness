import { z } from 'zod'

import { type EvmChainId, EvmChainIdSchema } from '@/types/ChainId'
import { type WalletAddress, WalletAddressSchema } from '@/types/wallet'

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
