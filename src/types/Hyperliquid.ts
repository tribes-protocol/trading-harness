import BigNumber from 'bignumber.js'
import { z } from 'zod'

import { type TransactionService } from '@/services/TransactionService'
import { type EthAddress, EthAddressSchema } from '@/types/Eth'
import { BigintSchema, BigNumberSchema, type HexString, HexStringSchema } from '@/types/Lang'
import { type EthSignTypedData } from '@/types/Tx'
import { isNullish } from '@/utils/Lang'

export const HyperliquidSignerOptionsSchema = z.object({
  walletId: z.string().trim().min(1),
  privateKeyPem: z.string().min(1)
})
export type HyperliquidSignerOptions = z.infer<typeof HyperliquidSignerOptionsSchema>

export const HyperliquidDepositCommandOptionsSchema = z.object({
  amount: BigNumberSchema,
  from: EthAddressSchema,
  walletId: z.string().trim().min(1),
  out: z.string().nullish()
})
export type HyperliquidDepositCommandOptions = z.infer<
  typeof HyperliquidDepositCommandOptionsSchema
>

export const HyperliquidWithdrawCommandOptionsSchema = z.object({
  amount: BigNumberSchema,
  from: EthAddressSchema,
  destination: EthAddressSchema,
  walletId: z.string().trim().min(1),
  out: z.string().nullish()
})
export type HyperliquidWithdrawCommandOptions = z.infer<
  typeof HyperliquidWithdrawCommandOptionsSchema
>

export const HyperliquidUsdClassDirectionSchema = z.enum(['spot-to-perp', 'perp-to-spot'])
export type HyperliquidUsdClassDirection = z.infer<typeof HyperliquidUsdClassDirectionSchema>

export const HyperliquidUsdClassTransferCommandOptionsSchema = z.object({
  amount: BigNumberSchema,
  from: EthAddressSchema,
  direction: HyperliquidUsdClassDirectionSchema,
  walletId: z.string().trim().min(1),
  out: z.string().nullish()
})
export type HyperliquidUsdClassTransferCommandOptions = z.infer<
  typeof HyperliquidUsdClassTransferCommandOptionsSchema
>

export const HyperliquidDexCashTransferCommandOptionsSchema = z.object({
  amount: BigNumberSchema,
  from: EthAddressSchema,
  sourceDex: z.string().trim().min(1, 'sourceDex is required'),
  destinationDex: z.string().trim().min(1, 'destinationDex is required'),
  token: z.string().trim().min(1).default('USDC'),
  walletId: z.string().trim().min(1),
  out: z.string().nullish()
})
export type HyperliquidDexCashTransferCommandOptions = z.infer<
  typeof HyperliquidDexCashTransferCommandOptionsSchema
>

export const HyperliquidUsdTransferCommandOptionsSchema = z.object({
  amount: BigNumberSchema,
  from: EthAddressSchema,
  destination: EthAddressSchema,
  walletId: z.string().trim().min(1),
  out: z.string().nullish()
})
export type HyperliquidUsdTransferCommandOptions = z.infer<
  typeof HyperliquidUsdTransferCommandOptionsSchema
>

export const HyperliquidSpotTransferCommandOptionsSchema = z.object({
  amount: BigNumberSchema,
  from: EthAddressSchema,
  destination: EthAddressSchema,
  token: z.string().trim().min(1),
  walletId: z.string().trim().min(1),
  out: z.string().nullish()
})
export type HyperliquidSpotTransferCommandOptions = z.infer<
  typeof HyperliquidSpotTransferCommandOptionsSchema
>

export const HyperliquidMarketKindSchema = z.enum(['perp', 'spot'])
export type HyperliquidMarketKind = z.infer<typeof HyperliquidMarketKindSchema>

export const HyperliquidListAssetsCommandOptionsSchema = z.object({
  dex: z.string().trim().min(1).nullish(),
  market: HyperliquidMarketKindSchema.default('perp'),
  out: z.string().nullish()
})
export type HyperliquidListAssetsCommandOptions = z.infer<
  typeof HyperliquidListAssetsCommandOptionsSchema
>

export const HyperliquidListExchangesCommandOptionsSchema = z.object({
  out: z.string().nullish()
})
export type HyperliquidListExchangesCommandOptions = z.infer<
  typeof HyperliquidListExchangesCommandOptionsSchema
>

export const HyperliquidListBalancesCommandOptionsSchema = z.object({
  address: EthAddressSchema,
  dex: z.string().trim().min(1).nullish(),
  out: z.string().nullish()
})
export type HyperliquidListBalancesCommandOptions = z.infer<
  typeof HyperliquidListBalancesCommandOptionsSchema
>

export const HyperliquidSpotBalanceSchema = z.object({
  coin: z.string(),
  token: z.number().int(),
  total: z.string(),
  hold: z.string(),
  available: z.string()
})
export type HyperliquidSpotBalance = z.infer<typeof HyperliquidSpotBalanceSchema>

export const HyperliquidPerpBalanceSummarySchema = z.object({
  accountValue: z.string(),
  withdrawable: z.string(),
  totalMarginUsed: z.string(),
  totalNtlPos: z.string()
})
export type HyperliquidPerpBalanceSummary = z.infer<typeof HyperliquidPerpBalanceSummarySchema>

export const HyperliquidBalancesResultSchema = z.object({
  address: EthAddressSchema,
  dex: z.string(),
  perp: HyperliquidPerpBalanceSummarySchema,
  spot: z.array(HyperliquidSpotBalanceSchema)
})
export type HyperliquidBalancesResult = z.infer<typeof HyperliquidBalancesResultSchema>

export const HyperliquidExchangeSchema = z.object({
  name: z.string(),
  fullName: z.string(),
  isMain: z.boolean()
})
export type HyperliquidExchange = z.infer<typeof HyperliquidExchangeSchema>

export const HyperliquidPerpAssetSchema = z.object({
  name: z.string(),
  szDecimals: z.number().int(),
  maxLeverage: z.number().int(),
  markPx: z.string().nullish()
})
export type HyperliquidPerpAsset = z.infer<typeof HyperliquidPerpAssetSchema>

export const HyperliquidPerpAssetsResultSchema = z.object({
  market: z.literal('perp'),
  dex: z.string(),
  assets: z.array(HyperliquidPerpAssetSchema)
})
export type HyperliquidPerpAssetsResult = z.infer<typeof HyperliquidPerpAssetsResultSchema>

export const HyperliquidSpotAssetSchema = z.object({
  pair: z.string(),
  szDecimals: z.number().int(),
  markPx: z.string().nullish()
})
export type HyperliquidSpotAsset = z.infer<typeof HyperliquidSpotAssetSchema>

export const HyperliquidSpotAssetsResultSchema = z.object({
  market: z.literal('spot'),
  assets: z.array(HyperliquidSpotAssetSchema)
})
export type HyperliquidSpotAssetsResult = z.infer<typeof HyperliquidSpotAssetsResultSchema>

export const HyperliquidPlanSchema = z.object({
  chainId: z.literal(42161),
  bridgeAddress: EthAddressSchema,
  usdcAddress: EthAddressSchema,
  amountUsdc: BigNumberSchema,
  amountRaw: BigintSchema,
  to: EthAddressSchema,
  data: HexStringSchema
})
export type HyperliquidPlan = z.infer<typeof HyperliquidPlanSchema>

export const HyperliquidDepositResultSchema = z.object({
  type: z.literal('hyperliquid-deposit-broadcast'),
  from: EthAddressSchema,
  txHash: HexStringSchema,
  plan: HyperliquidPlanSchema
})
export type HyperliquidDepositResult = z.infer<typeof HyperliquidDepositResultSchema>

export interface HyperliquidPrivyWallet {
  readonly address: EthAddress
  signTypedData(params: EthSignTypedData, options?: unknown): Promise<HexString>
}

export const HyperliquidPerpSideSchema = z.enum(['long', 'short'])
export type HyperliquidPerpSide = z.infer<typeof HyperliquidPerpSideSchema>

export const HyperliquidPerpOrderTypeSchema = z.enum([
  'market',
  'limit',
  'stop_market',
  'stop_limit',
  'take_market',
  'take_limit'
])
export type HyperliquidPerpOrderType = z.infer<typeof HyperliquidPerpOrderTypeSchema>

export const HyperliquidSpotOrderTypeSchema = z.enum(['market', 'limit'])
export type HyperliquidSpotOrderType = z.infer<typeof HyperliquidSpotOrderTypeSchema>

export const HyperliquidTpSlSchema = z.enum(['tp', 'sl'])
export type HyperliquidTpSl = z.infer<typeof HyperliquidTpSlSchema>

export const HYPERLIQUID_TRIGGER_LIMIT_ORDER_TYPES: readonly HyperliquidPerpOrderType[] = [
  'limit',
  'stop_limit',
  'take_limit'
]

export const HYPERLIQUID_TRIGGER_PX_ORDER_TYPES: readonly HyperliquidPerpOrderType[] = [
  'stop_market',
  'stop_limit',
  'take_market',
  'take_limit'
]

export const HyperliquidPerpTifSchema = z.enum(['Gtc', 'Ioc', 'Alo'])
export type HyperliquidPerpTif = z.infer<typeof HyperliquidPerpTifSchema>

export const HyperliquidPerpMarginModeSchema = z.enum(['cross', 'isolated'])
export type HyperliquidPerpMarginMode = z.infer<typeof HyperliquidPerpMarginModeSchema>

export const HyperliquidMarketTypeSchema = z.enum(['perp', 'spot'])
export type HyperliquidMarketType = z.infer<typeof HyperliquidMarketTypeSchema>

export const HyperliquidSpotSideSchema = z.enum(['buy', 'sell'])
export type HyperliquidSpotSide = z.infer<typeof HyperliquidSpotSideSchema>

export const HyperliquidPerpTradeCommandOptionsSchema = z
  .object({
    from: EthAddressSchema,
    coin: z.string().trim().min(1),
    amount: BigNumberSchema,
    side: HyperliquidPerpSideSchema,
    type: HyperliquidPerpOrderTypeSchema.default('market'),
    price: BigNumberSchema.nullish(),
    triggerPx: BigNumberSchema.nullish(),
    tpPx: BigNumberSchema.nullish(),
    slPx: BigNumberSchema.nullish(),
    tpLimitPx: BigNumberSchema.nullish(),
    slLimitPx: BigNumberSchema.nullish(),
    tif: HyperliquidPerpTifSchema.default('Gtc'),
    reduceOnly: z.boolean().default(false),
    marginMode: HyperliquidPerpMarginModeSchema.default('cross'),
    leverage: z.coerce.number().int().positive().nullish(),
    dex: z.string().trim().nullish(),
    walletId: z.string().trim().min(1),
    out: z.string().nullish()
  })
  .superRefine((value, ctx) => {
    const isPositive = (price: typeof value.price): boolean =>
      !isNullish(price) && !price.isNaN() && price.isGreaterThan(0)

    const hasTp = !isNullish(value.tpPx)
    const hasSl = !isNullish(value.slPx)
    const isBracket = hasTp || hasSl

    if (!isNullish(value.tpLimitPx) && !hasTp) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tpLimitPx'],
        message: 'tpLimitPx requires tpPx'
      })
    }
    if (!isNullish(value.slLimitPx) && !hasSl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['slLimitPx'],
        message: 'slLimitPx requires slPx'
      })
    }
    if (!isNullish(value.tpPx) && !isPositive(value.tpPx)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tpPx'],
        message: 'tpPx must be greater than 0'
      })
    }
    if (!isNullish(value.slPx) && !isPositive(value.slPx)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['slPx'],
        message: 'slPx must be greater than 0'
      })
    }
    if (!isNullish(value.tpLimitPx) && !isPositive(value.tpLimitPx)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tpLimitPx'],
        message: 'tpLimitPx must be greater than 0'
      })
    }
    if (!isNullish(value.slLimitPx) && !isPositive(value.slLimitPx)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['slLimitPx'],
        message: 'slLimitPx must be greater than 0'
      })
    }

    if (isBracket) {
      if (value.type !== 'market' && value.type !== 'limit') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['type'],
          message:
            'tp/sl brackets require a market or limit entry (trigger entry types cannot carry a bracket)'
        })
      }
      if (value.reduceOnly) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['reduceOnly'],
          message: 'a bracket entry (with tpPx/slPx) cannot be reduce-only'
        })
      }
      if (value.type === 'limit' && !isPositive(value.price)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['price'],
          message: 'price must be greater than 0 for a limit entry'
        })
      }
      return
    }

    if (HYPERLIQUID_TRIGGER_LIMIT_ORDER_TYPES.includes(value.type) && !isPositive(value.price)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['price'],
        message: 'price must be greater than 0 for limit, stop_limit, and take_limit orders'
      })
    }
    if (HYPERLIQUID_TRIGGER_PX_ORDER_TYPES.includes(value.type) && !isPositive(value.triggerPx)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['triggerPx'],
        message:
          'triggerPx must be greater than 0 for stop_market, stop_limit, take_market, and take_limit orders'
      })
    }
  })
export type HyperliquidPerpTradeCommandOptions = z.infer<
  typeof HyperliquidPerpTradeCommandOptionsSchema
>

export const HyperliquidSpotTradeCommandOptionsSchema = z
  .object({
    from: EthAddressSchema,
    pair: z.string().trim().min(1),
    amount: BigNumberSchema,
    side: HyperliquidSpotSideSchema,
    type: HyperliquidSpotOrderTypeSchema.default('market'),
    price: BigNumberSchema.nullish(),
    tif: HyperliquidPerpTifSchema.default('Gtc'),
    walletId: z.string().trim().min(1),
    out: z.string().nullish()
  })
  .superRefine((value, ctx) => {
    if (
      value.type === 'limit' &&
      (isNullish(value.price) || value.price.isNaN() || !value.price.isGreaterThan(0))
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['price'],
        message: 'price must be greater than 0 for limit orders'
      })
    }
  })
export type HyperliquidSpotTradeCommandOptions = z.infer<
  typeof HyperliquidSpotTradeCommandOptionsSchema
>

export const HyperliquidTwapOrderCommandOptionsSchema = z.object({
  from: EthAddressSchema,
  coin: z.string().trim().min(1),
  amount: BigNumberSchema,
  side: HyperliquidPerpSideSchema,
  durationMinutes: z.coerce.number().int().min(5).max(1440),
  randomize: z.boolean().default(false),
  reduceOnly: z.boolean().default(false),
  marginMode: HyperliquidPerpMarginModeSchema.default('cross'),
  leverage: z.coerce.number().int().positive().nullish(),
  dex: z.string().trim().nullish(),
  walletId: z.string().trim().min(1),
  out: z.string().nullish()
})
export type HyperliquidTwapOrderCommandOptions = z.infer<
  typeof HyperliquidTwapOrderCommandOptionsSchema
>

export const HyperliquidTwapCancelCommandOptionsSchema = z.object({
  from: EthAddressSchema,
  coin: z.string().trim().min(1),
  twapId: z.coerce.number().int().nonnegative(),
  dex: z.string().trim().nullish(),
  walletId: z.string().trim().min(1),
  out: z.string().nullish()
})
export type HyperliquidTwapCancelCommandOptions = z.infer<
  typeof HyperliquidTwapCancelCommandOptionsSchema
>

export const HyperliquidListPositionsCommandOptionsSchema = z.object({
  address: EthAddressSchema,
  dex: z.string().trim().min(1).nullish(),
  allDexes: z.boolean().default(false),
  out: z.string().nullish()
})
export type HyperliquidListPositionsCommandOptions = z.infer<
  typeof HyperliquidListPositionsCommandOptionsSchema
>

export const HyperliquidPerpPositionSchema = z.object({
  dex: z.string(),
  coin: z.string(),
  side: HyperliquidPerpSideSchema,
  size: z.string(),
  signedSize: z.string(),
  entryPx: z.string(),
  positionValue: z.string(),
  unrealizedPnl: z.string(),
  returnOnEquity: z.string(),
  liquidationPx: z.string().nullish(),
  leverage: z.number(),
  leverageType: HyperliquidPerpMarginModeSchema,
  marginUsed: z.string(),
  maxLeverage: z.number()
})
export type HyperliquidPerpPosition = z.infer<typeof HyperliquidPerpPositionSchema>

export const HyperliquidPerpTwapOrderSchema = z.object({
  dex: z.string(),
  coin: z.string(),
  side: HyperliquidPerpSideSchema,
  size: z.string(),
  executedSize: z.string(),
  remainingSize: z.string(),
  executedNotional: z.string(),
  durationMinutes: z.number().int().positive(),
  randomize: z.boolean(),
  reduceOnly: z.boolean(),
  startedAt: z.number().int().nonnegative(),
  createdAtSeconds: z.number().int().nonnegative(),
  twapId: z.number().int().nonnegative().nullish()
})
export type HyperliquidPerpTwapOrder = z.infer<typeof HyperliquidPerpTwapOrderSchema>

export const HyperliquidPositionsResultSchema = z.object({
  address: EthAddressSchema,
  positions: z.array(HyperliquidPerpPositionSchema),
  twapOrders: z.array(HyperliquidPerpTwapOrderSchema)
})
export type HyperliquidPositionsResult = z.infer<typeof HyperliquidPositionsResultSchema>

export const ResolvePerpAssetParamsSchema = z.object({
  coin: z.string().trim().min(1),
  dex: z.string()
})
export type ResolvePerpAssetParams = z.infer<typeof ResolvePerpAssetParamsSchema>

export const ResolvedPerpAssetSchema = z.object({
  wireAsset: z.number().int().nonnegative(),
  referencePrice: BigNumberSchema,
  szDecimals: z.number().int().nonnegative()
})
export type ResolvedPerpAsset = z.infer<typeof ResolvedPerpAssetSchema>

export const ResolveOrderPriceParamsSchema = z.object({
  marketType: HyperliquidMarketTypeSchema,
  orderType: HyperliquidPerpOrderTypeSchema,
  limitPrice: BigNumberSchema.nullish(),
  triggerPx: BigNumberSchema.nullish(),
  szDecimals: z.number().int().nonnegative(),
  referencePrice: BigNumberSchema,
  isBuy: z.boolean()
})
export type ResolveOrderPriceParams = z.infer<typeof ResolveOrderPriceParamsSchema>

export const ResolvedSpotAssetSchema = z.object({
  assetId: z.number().int().nonnegative(),
  referencePrice: BigNumberSchema,
  szDecimals: z.number().int().nonnegative()
})
export type ResolvedSpotAsset = z.infer<typeof ResolvedSpotAssetSchema>

export const ResolveOrderTifParamsSchema = z.object({
  orderType: HyperliquidPerpOrderTypeSchema,
  tif: HyperliquidPerpTifSchema
})
export type ResolveOrderTifParams = z.infer<typeof ResolveOrderTifParamsSchema>

export const HyperliquidOrderTifSchema = z.enum(['Gtc', 'Ioc', 'Alo', 'FrontendMarket'])
export type HyperliquidOrderTif = z.infer<typeof HyperliquidOrderTifSchema>

export interface ResolveWirePerpAssetIdParams {
  readonly localAssetIndex: number
  readonly dex: string
}

export function normalizeHyperliquidCoin(raw: string): string {
  const decoded = decodeURIComponent(raw)
  const colonIdx = decoded.indexOf(':')
  if (colonIdx === -1) {
    return decoded.toUpperCase()
  }
  const dex = decoded.slice(0, colonIdx)
  const symbol = decoded.slice(colonIdx + 1).toUpperCase()
  return `${dex}:${symbol}`
}

export const HyperliquidCoinSchema = z.string().min(1).transform(normalizeHyperliquidCoin)
export type HyperliquidCoin = z.infer<typeof HyperliquidCoinSchema>

export interface HyperliquidServiceParams {
  readonly transaction: TransactionService
}

export interface HyperliquidDepositParams {
  readonly amount: BigNumber
  readonly from: EthAddress
  readonly walletId: string
}

export interface HyperliquidWithSignerParams<TRequest> {
  readonly request: TRequest
  readonly walletId: string
}

export interface HyperliquidListBalancesParams {
  readonly address: EthAddress
  readonly dex: string | null | undefined
}

export interface HyperliquidListPositionsParams {
  readonly address: EthAddress
  readonly dex: string | null | undefined
  readonly allDexes: boolean
}

export interface CreateExchangeClientParams {
  readonly address: EthAddress
  readonly walletId: string
}

export type PerpOrderTypeField =
  | { readonly limit: { readonly tif: HyperliquidOrderTif } }
  | {
      readonly trigger: {
        readonly isMarket: boolean
        readonly triggerPx: string
        readonly tpsl: HyperliquidTpSl
      }
    }

export interface PerpOrderWire {
  readonly a: number
  readonly b: boolean
  readonly p: string
  readonly s: string
  readonly r: boolean
  readonly t: PerpOrderTypeField
}

export interface BuildBracketExitLegParams {
  readonly orderType: HyperliquidPerpOrderType
  readonly triggerPx: BigNumber
  readonly limitPx: BigNumber | null | undefined
  readonly exitIsBuy: boolean
  readonly perpAsset: ResolvedPerpAsset
  readonly size: string
}

export interface ResolvePerpOrderTypeFieldParams {
  readonly orderType: HyperliquidPerpOrderType
  readonly tif: HyperliquidPerpTif
  readonly triggerPx: BigNumber | null | undefined
  readonly szDecimals: number
}
