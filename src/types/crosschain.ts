import { ChainIdSchema } from '@shared/types/ChainId'
import { EthTokenIdSchema } from '@shared/types/eth'
import { BigNumberSchema, HexStringSchema } from '@shared/types/lang'
import { SolInstructionSchema, SolPubKeySchema, SPLTokenIdSchema } from '@shared/types/solana'
import { AssetTokenSchema } from '@shared/types/wallet'
import z from 'zod'

export const TokenIdSchema = z

  .union([EthTokenIdSchema, SPLTokenIdSchema])
  .describe('Token contract address on EVM, mint address on Solana, or "network" for native assets')
export type TokenId = z.infer<typeof TokenIdSchema>

export const TxDataSchema = z.union([HexStringSchema, SolInstructionSchema])

export const PoolIdSchema = z.union([HexStringSchema, SolPubKeySchema])
export type PoolId = z.infer<typeof PoolIdSchema>

export const TokenOrPoolIdSchema = z.union([TokenIdSchema, PoolIdSchema])
export type TokenOrPoolId = z.infer<typeof TokenOrPoolIdSchema>

export const ItemKindSchema = z.enum(['token', 'pool'])
export type ItemKind = z.infer<typeof ItemKindSchema>
export const BaseItemMetricsSchema = z.object({
  id: z.string(),
  chainId: ChainIdSchema,
  marketCapUsd: BigNumberSchema,
  liquidityUsd: BigNumberSchema,
  volume24hUsd: BigNumberSchema,
  priceChange24hPercent: BigNumberSchema,
  priceUsd: BigNumberSchema.nullish(),
  fdvUsd: BigNumberSchema
})

export const BaseTokenItemSchema = BaseItemMetricsSchema.extend({
  kind: z.literal('token'),
  asset: AssetTokenSchema,
  address: TokenIdSchema
})

export type BaseTokenItem = z.infer<typeof BaseTokenItemSchema>

export const BasePoolItemSchema = BaseItemMetricsSchema.extend({
  kind: z.literal('pool'),
  asset: AssetTokenSchema,
  quoteAsset: AssetTokenSchema,
  address: PoolIdSchema
})

export type BasePoolItem = z.infer<typeof BasePoolItemSchema>

export const BaseItemSchema = z.discriminatedUnion('kind', [
  BaseTokenItemSchema,
  BasePoolItemSchema
])
export type BaseItem = z.infer<typeof BaseItemSchema>
