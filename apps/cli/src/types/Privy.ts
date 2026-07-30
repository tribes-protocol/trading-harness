import { z } from 'zod'

import { EthAddressSchema } from '@/types/Eth'
import { SolAddressSchema } from '@/types/Solana'

export const AgentWalletSnapshotSchema = z.object({
  evmWalletId: z.string().trim().min(1),
  evmWalletAddress: EthAddressSchema,
  solWalletId: z.string().trim().min(1),
  solWalletAddress: SolAddressSchema
})
export type AgentWalletSnapshot = z.infer<typeof AgentWalletSnapshotSchema>
