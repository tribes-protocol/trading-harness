import { EthAddressSchema } from '@shared/types/eth'
import { SolAddressSchema } from '@shared/types/solana'
import { z } from 'zod'

export const AgentWalletSnapshotSchema = z.object({
  evmWalletId: z.string().trim().min(1),
  evmWalletAddress: EthAddressSchema,
  solWalletId: z.string().trim().min(1),
  solWalletAddress: SolAddressSchema
})
export type AgentWalletSnapshot = z.infer<typeof AgentWalletSnapshotSchema>
