import { ChainIdSchema, EvmChainIdSchema } from '@shared/types/ChainId'
import { EthAddressSchema } from '@shared/types/eth'
import { BigintSchema, HexStringSchema } from '@shared/types/lang'
import { SolInstructionSchema } from '@shared/types/solana'
import { EthSignTypedDataSchema, TxIdSchema, TxSchema } from '@shared/types/transaction'
import { z } from 'zod'

export const EthTransactionSchema = z.object({
  chainId: EvmChainIdSchema,
  data: HexStringSchema.default('0x'),
  from: EthAddressSchema.nullish(),
  to: EthAddressSchema,
  value: BigintSchema
})
export type EthTransaction = z.infer<typeof EthTransactionSchema>

export const EthTransactionCommandOptionsSchema = EthTransactionSchema.extend({
  walletId: z.string().trim().min(1),
  privateKeyPem: z.string().min(1),
  out: z.string().nullish()
})
export type EthTransactionCommandOptions = z.infer<typeof EthTransactionCommandOptionsSchema>

export const EthCallSchema = z.object({
  to: EthAddressSchema,
  data: HexStringSchema.default('0x'),
  value: BigintSchema
})
export type EthCall = z.infer<typeof EthCallSchema>

export const EthCallsSchema = z.array(TxSchema).min(1)

export const EthCallsCommandOptionsSchema = z.object({
  chainId: EvmChainIdSchema,
  calls: z
    .string()
    .transform((raw, ctx) => {
      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: '--calls must be a JSON array of { to, value, data? }'
        })
        return z.NEVER
      }
      return parsed
    })
    .pipe(z.array(EthCallSchema).min(1)),
  walletId: z.string().trim().min(1),
  privateKeyPem: z.string().min(1),
  out: z.string().nullish()
})
export type EthCallsCommandOptions = z.infer<typeof EthCallsCommandOptionsSchema>

export const SolTransactionCommandOptionsSchema = z.object({
  transaction: SolInstructionSchema,
  walletId: z.string().trim().min(1),
  privateKeyPem: z.string().min(1),
  out: z.string().nullish()
})
export type SolTransactionCommandOptions = z.infer<typeof SolTransactionCommandOptionsSchema>

export const TransactionStatusCommandOptionsSchema = z.object({
  chainId: ChainIdSchema,
  hash: TxIdSchema,
  timestamp: z.coerce.number().int().positive().nullish(),
  checkSafeConfirmations: z.boolean().nullish(),
  out: z.string().nullish()
})
export type TransactionStatusCommandOptions = z.infer<typeof TransactionStatusCommandOptionsSchema>

export const SendEthTransactionApiRequestSchema = z.object({
  txData: TxSchema,
  walletId: z.string().trim().min(1),
  signature: z.string().trim().min(1)
})
export type SendEthTransactionApiRequest = z.infer<typeof SendEthTransactionApiRequestSchema>

export const SendEthCallsApiRequestSchema = z.object({
  calls: EthCallsSchema,
  walletId: z.string().trim().min(1),
  signature: z.string().trim().min(1)
})
export type SendEthCallsApiRequest = z.infer<typeof SendEthCallsApiRequestSchema>

export const SendSolTransactionApiRequestSchema = z.object({
  transaction: SolInstructionSchema,
  walletId: z.string().trim().min(1),
  signature: z.string().trim().min(1)
})
export type SendSolTransactionApiRequest = z.infer<typeof SendSolTransactionApiRequestSchema>

export const SignEthTypedDataV4ApiRequestSchema = z.object({
  typedData: EthSignTypedDataSchema,
  walletId: z.string().trim().min(1),
  signature: z.string().trim().min(1)
})
export type SignEthTypedDataV4ApiRequest = z.infer<typeof SignEthTypedDataV4ApiRequestSchema>
