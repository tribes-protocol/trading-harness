import { isAddress } from 'viem'
import { z } from 'zod'

import { EvmChainIdSchema } from '@/types/ChainId'
import { BigintSchema, BigNumberSchema } from '@/types/lang'
import { TokenVerificationStatusSchema } from '@/types/verification'

export const EthAddressSchema = z
  .custom<`0x${string}`>((val): val is `0x${string}` => typeof val === 'string' && isAddress(val))
  /* eslint-disable @typescript-eslint/consistent-type-assertions */
  // Zod .transform() must cast back to the branded `0x${string}`
  // template literal after lowercasing; TypeScript cannot infer
  // that toLowerCase() preserves the `0x` prefix.
  .transform((arg) => arg.toLowerCase() as `0x${string}`)
/* eslint-enable @typescript-eslint/consistent-type-assertions */

export type EthAddress = z.infer<typeof EthAddressSchema>

export const EthTokenIdSchema = z.union([EthAddressSchema, z.literal('network')])
export type EthTokenId = z.infer<typeof EthTokenIdSchema>

export const ERC20TokenSchema = z.object({
  kind: z.literal('erc20').default('erc20'),
  address: EthTokenIdSchema,
  name: z.string(),
  symbol: z.string(),
  decimals: z.number(),
  chainId: EvmChainIdSchema,
  logo: z.string().nullish(),
  verified: TokenVerificationStatusSchema.default('unknown')
})

export type ERC20Token = z.infer<typeof ERC20TokenSchema>

export const ERC20BalanceSchema = ERC20TokenSchema.extend({
  wallet: EthAddressSchema.nullish(),
  balance: BigNumberSchema,
  balanceUsd: BigNumberSchema,
  usdPrice: BigNumberSchema,
  usdPrice24hrPercentChange: BigNumberSchema.nullish()
})

export type ERC20Balance = z.infer<typeof ERC20BalanceSchema>

export const ERC20CompactSchema = z.object({
  chainId: EvmChainIdSchema,
  address: EthTokenIdSchema,
  balance: BigNumberSchema,
  balanceUsd: BigNumberSchema,
  usdPrice: BigNumberSchema,
  usdPrice24hrPercentChange: BigNumberSchema.nullish(),
  wallet: EthAddressSchema.nullish()
})

export type ERC20Compact = z.infer<typeof ERC20CompactSchema>

export const EthGasMetadataSchema = z.object({
  maxFeePerGas: BigintSchema,
  maxPriorityFeePerGas: BigintSchema,
  gasEstimate: BigintSchema,
  gasCost: BigintSchema
})
export type GasMetadata = z.infer<typeof EthGasMetadataSchema>

export const GasERC20BalanceSchema = z.object({
  asset: ERC20BalanceSchema,
  gasMetadata: EthGasMetadataSchema.nullish()
})
export type GasERC20Balance = z.infer<typeof GasERC20BalanceSchema>
