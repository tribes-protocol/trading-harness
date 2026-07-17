import z from 'zod'

import {
  ERC20BalanceSchema,
  ERC20TokenSchema,
  type EthAddress,
  EthAddressSchema
} from '@/types/Eth'
import { BigNumberSchema } from '@/types/Lang'
import {
  type SolAddress,
  SolAddressSchema,
  SolPubKeySchema,
  SPLBalanceSchema,
  SPLTokenSchema
} from '@/types/Solana'

export const WalletAddressSchema = z.union([EthAddressSchema, SolAddressSchema])
export type WalletAddress = z.infer<typeof WalletAddressSchema>

export interface ResolvedWallets {
  smartWallet: EthAddress
  ethSuperWallet: EthAddress
  solSuperWallet: SolAddress
  userWallet: WalletAddress
}

export const TokenOwnerAddressSchema = z.union([
  EthAddressSchema,
  SolAddressSchema,
  SolPubKeySchema
])
export type TokenOwnerAddress = z.infer<typeof TokenOwnerAddressSchema>

export const AssetTokenSchema = z.discriminatedUnion('kind', [ERC20TokenSchema, SPLTokenSchema])
export type AssetToken = z.infer<typeof AssetTokenSchema>

export const AssetBalanceSchema = z.discriminatedUnion('kind', [
  ERC20BalanceSchema,
  SPLBalanceSchema
])

export type AssetBalance = z.infer<typeof AssetBalanceSchema>

const WalletPnlMetricsSchema = z.object({
  realized_profit_usd: BigNumberSchema,
  realized_profit_percent: BigNumberSchema,
  unrealized_usd: BigNumberSchema,
  unrealized_percent: BigNumberSchema.nullish(),
  total_usd: BigNumberSchema,
  total_percent: BigNumberSchema.nullish(),
  avg_profit_per_trade_usd: BigNumberSchema
})

const WalletPnlTokenSchema = z.object({
  address: z.string().trim().min(1),
  pnl: WalletPnlMetricsSchema
})

export const AssetBalanceWithPnlSchema = z.intersection(
  AssetBalanceSchema,
  z.object({
    pnl: z.union([WalletPnlTokenSchema, z.null()])
  })
)
export type AssetBalanceWithPnl = z.infer<typeof AssetBalanceWithPnlSchema>
