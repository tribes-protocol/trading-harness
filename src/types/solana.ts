import { BigNumberSchema } from '@shared/types/lang'
import { TokenVerificationStatusSchema } from '@shared/types/verification'
import {
  isSolanaPubKey,
  isSolanaWalletAddress,
  isValidSolanaInstruction,
  isValidSolanaTxSignature
} from '@shared/utils/solana'
import z from 'zod'

export const SolAddressSchema = z.custom<`${string}`>(
  (val): val is `${string}` => typeof val === 'string' && isSolanaWalletAddress(val)
)

export type SolAddress = z.infer<typeof SolAddressSchema>

export const SolPubKeySchema = z.custom<`${string}`>(
  (val): val is `${string}` => typeof val === 'string' && isSolanaPubKey(val)
)

export type SolPubKey = z.infer<typeof SolPubKeySchema>

export const NATIVE_MINT = SolPubKeySchema.parse('So11111111111111111111111111111111111111111')
export const WSOL_MINT_ADDRESS = SolPubKeySchema.parse(
  'So11111111111111111111111111111111111111112'
)

export const SPLTokenIdSchema = z.union([SolPubKeySchema, z.literal(NATIVE_MINT)])
export type SPLTokenId = z.infer<typeof SPLTokenIdSchema>

export interface SolanaNetworkConfig {
  name: string
  address: SolPubKey
  decimals: number
  symbol: string
  logo: string
  explorerUrl: string
}

export const SPLTokenSchema = z.object({
  kind: z.literal('spl').default('spl'),
  address: SPLTokenIdSchema,
  name: z.string(),
  symbol: z.string(),
  decimals: z.number(),
  logo: z.string().nullish(),
  chainId: z.literal('solana'),
  verified: TokenVerificationStatusSchema
})

export type SPLToken = z.infer<typeof SPLTokenSchema>

export const SPLBalanceSchema = SPLTokenSchema.extend({
  wallet: SolAddressSchema.nullish(),
  balance: BigNumberSchema,
  balanceUsd: BigNumberSchema,
  usdPrice: BigNumberSchema,
  usdPrice24hrPercentChange: BigNumberSchema.nullish()
})
export type SPLBalance = z.infer<typeof SPLBalanceSchema>

export const SolSignatureSchema = z.custom<`${string}`>(
  (val): val is `${string}` => typeof val === 'string' && isValidSolanaTxSignature(val)
)
export type SolSignature = z.infer<typeof SolSignatureSchema>

export const SolInstructionSchema = z.custom<`${string}`>(
  (val): val is `${string}` => typeof val === 'string' && isValidSolanaInstruction(val)
)
export type SolInstruction = z.infer<typeof SolInstructionSchema>
