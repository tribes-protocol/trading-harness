import { EvmChainIdSchema } from '@shared/types/ChainId'
import { EthAddressSchema } from '@shared/types/eth'
import { BigintSchema, HexStringSchema } from '@shared/types/lang'
import { SolSignatureSchema } from '@shared/types/solana'
import { z } from 'zod'

export const Eip712TypeFieldSchema = z.object({
  name: z.string(),
  type: z.string()
})
export const Eip712TypesSchema = z.record(z.array(Eip712TypeFieldSchema))

export const EthSignTypedDataSchema = z.object({
  domain: z.object({
    name: z.string().nullish(),
    version: z.string().nullish(),
    chainId: z.number().int().nullish(),
    verifyingContract: EthAddressSchema.nullish(),
    salt: HexStringSchema.nullish()
  }),
  types: Eip712TypesSchema,
  primaryType: z.string(),
  message: z.record(z.unknown())
})
export type EthSignTypedData = z.infer<typeof EthSignTypedDataSchema>

export const TxSchema = z.object({
  chainId: EvmChainIdSchema,
  to: EthAddressSchema,
  data: HexStringSchema.default('0x'),
  value: BigintSchema.default(BigInt(0))
})

export type Tx = z.infer<typeof TxSchema>

export const TxIdSchema = z.union([HexStringSchema, SolSignatureSchema])
export type TxId = z.infer<typeof TxIdSchema>
