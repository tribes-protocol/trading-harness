import { z } from 'zod'

import { ChainIdSchema } from '@/types/ChainId'
import { TokenIdSchema } from '@/types/CrossChain'
import { HyperliquidCoinSchema } from '@/types/Hyperliquid'
import { StockTickerSchema } from '@/types/StockTicker'

export const AssetIdentityKindSchema = z.enum(['token', 'perp', 'stock'])
export type AssetIdentityKind = z.infer<typeof AssetIdentityKindSchema>

export const TokenAssetIdentitySchema = z.object({
  kind: z.literal(AssetIdentityKindSchema.enum.token),
  chainId: ChainIdSchema,
  tokenId: TokenIdSchema
})
export type TokenAssetIdentity = z.infer<typeof TokenAssetIdentitySchema>

export const PerpAssetIdentitySchema = z.object({
  kind: z.literal(AssetIdentityKindSchema.enum.perp),
  coin: HyperliquidCoinSchema
})
export type PerpAssetIdentity = z.infer<typeof PerpAssetIdentitySchema>

export const StockAssetIdentitySchema = z.object({
  kind: z.literal(AssetIdentityKindSchema.enum.stock),
  ticker: StockTickerSchema
})
export type StockAssetIdentity = z.infer<typeof StockAssetIdentitySchema>

export const AssetIdentitySchema = z.discriminatedUnion('kind', [
  TokenAssetIdentitySchema,
  PerpAssetIdentitySchema,
  StockAssetIdentitySchema
])
export type AssetIdentity = z.infer<typeof AssetIdentitySchema>
