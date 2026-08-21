import type { InfoClient } from '@nktkas/hyperliquid'
import BigNumber from 'bignumber.js'
import { z } from 'zod'

import { type EntryGateService } from '@/services/EntryGateService'
import { type SizingLockService } from '@/services/SizingLockService'
import { type TransactionService } from '@/services/TransactionService'
import { type EthAddress, EthAddressSchema } from '@/types/Eth'
import {
  BigintSchema,
  BigNumberSchema,
  CloidSchema,
  type HexString,
  HexStringSchema
} from '@/types/Lang'
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
  allDexes: z.boolean().default(false),
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
  isDelisted: z.boolean(),
  onlyIsolated: z.boolean(),
  marginMode: z.enum(['strictIsolated', 'noCross']).nullish(),
  requiresIsolatedMargin: z.boolean(),
  markPx: z.string().nullish(),
  referencePx: z.string().nullish(),
  midPx: z.string().nullish(),
  oraclePx: z.string().nullish(),
  prevDayPx: z.string().nullish(),
  dayNtlVlm: z.string().nullish(),
  dayBaseVlm: z.string().nullish(),
  funding: z.string().nullish(),
  openInterest: z.string().nullish(),
  premium: z.string().nullish(),
  impactPxs: z.array(z.string()).nullish()
})
export type HyperliquidPerpAsset = z.infer<typeof HyperliquidPerpAssetSchema>

export const HyperliquidPerpAssetsResultSchema = z.object({
  market: z.literal('perp'),
  dex: z.string(),
  assets: z.array(HyperliquidPerpAssetSchema)
})
export type HyperliquidPerpAssetsResult = z.infer<typeof HyperliquidPerpAssetsResultSchema>

export const HyperliquidAllPerpAssetsResultSchema = z.object({
  market: z.literal('perp'),
  dexes: z.array(HyperliquidPerpAssetsResultSchema)
})
export type HyperliquidAllPerpAssetsResult = z.infer<typeof HyperliquidAllPerpAssetsResultSchema>

export const HyperliquidSpotAssetSchema = z.object({
  pair: z.string(),
  szDecimals: z.number().int(),
  markPx: z.string().nullish(),
  referencePx: z.string().nullish(),
  midPx: z.string().nullish(),
  prevDayPx: z.string().nullish(),
  dayNtlVlm: z.string().nullish(),
  dayBaseVlm: z.string().nullish()
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

export const HyperliquidMarginAdjustmentDirectionSchema = z.enum(['add', 'remove'])
export type HyperliquidMarginAdjustmentDirection = z.infer<
  typeof HyperliquidMarginAdjustmentDirectionSchema
>

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
    cloid: CloidSchema.nullish(),
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

export const HyperliquidSetLeverageCommandOptionsSchema = z.object({
  from: EthAddressSchema,
  coin: z.string().trim().min(1),
  leverage: z.coerce.number().int().positive(),
  marginMode: HyperliquidPerpMarginModeSchema.default('cross'),
  dex: z.string().trim().nullish(),
  walletId: z.string().trim().min(1),
  out: z.string().nullish()
})
export type HyperliquidSetLeverageCommandOptions = z.infer<
  typeof HyperliquidSetLeverageCommandOptionsSchema
>

export const HyperliquidAdjustMarginCommandOptionsSchema = z.object({
  from: EthAddressSchema,
  coin: z.string().trim().min(1),
  amount: BigNumberSchema,
  direction: HyperliquidMarginAdjustmentDirectionSchema.default('add'),
  side: HyperliquidPerpSideSchema,
  dex: z.string().trim().nullish(),
  walletId: z.string().trim().min(1),
  out: z.string().nullish()
})
export type HyperliquidAdjustMarginCommandOptions = z.infer<
  typeof HyperliquidAdjustMarginCommandOptionsSchema
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
    cloid: CloidSchema.nullish(),
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

export const HyperliquidSpotTwapCancelCommandOptionsSchema = z.object({
  from: EthAddressSchema,
  pair: z.string().trim().min(1),
  twapId: z.coerce.number().int().nonnegative(),
  walletId: z.string().trim().min(1),
  out: z.string().nullish()
})
export type HyperliquidSpotTwapCancelCommandOptions = z.infer<
  typeof HyperliquidSpotTwapCancelCommandOptionsSchema
>

export const HyperliquidCancelOrderCommandOptionsSchema = z.object({
  from: EthAddressSchema,
  coin: z.string().trim().min(1),
  orderId: z.coerce.number().int().nonnegative(),
  dex: z.string().trim().nullish(),
  walletId: z.string().trim().min(1),
  out: z.string().nullish()
})
export type HyperliquidCancelOrderCommandOptions = z.infer<
  typeof HyperliquidCancelOrderCommandOptionsSchema
>

export const HyperliquidSpotCancelOrderCommandOptionsSchema = z.object({
  from: EthAddressSchema,
  pair: z.string().trim().min(1),
  orderId: z.coerce.number().int().nonnegative(),
  walletId: z.string().trim().min(1),
  out: z.string().nullish()
})
export type HyperliquidSpotCancelOrderCommandOptions = z.infer<
  typeof HyperliquidSpotCancelOrderCommandOptionsSchema
>

export const HyperliquidScaleOrderCommandOptionsSchema = z
  .object({
    from: EthAddressSchema,
    coin: z.string().trim().min(1),
    amount: BigNumberSchema,
    side: HyperliquidPerpSideSchema,
    startPx: BigNumberSchema,
    endPx: BigNumberSchema,
    orders: z.coerce.number().int().min(2).max(50),
    sizeSkew: z.coerce.number().positive().default(1),
    tif: HyperliquidPerpTifSchema.default('Gtc'),
    reduceOnly: z.boolean().default(false),
    marginMode: HyperliquidPerpMarginModeSchema.default('cross'),
    leverage: z.coerce.number().int().positive().nullish(),
    dex: z.string().trim().nullish(),
    walletId: z.string().trim().min(1),
    out: z.string().nullish()
  })
  .superRefine((value, ctx) => {
    const isPositive = (price: typeof value.startPx): boolean =>
      !price.isNaN() && price.isFinite() && price.isGreaterThan(0)

    if (!isPositive(value.startPx)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['startPx'],
        message: 'startPx must be greater than 0'
      })
    }
    if (!isPositive(value.endPx)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endPx'],
        message: 'endPx must be greater than 0'
      })
    }
    if (isPositive(value.startPx) && isPositive(value.endPx) && value.startPx.eq(value.endPx)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endPx'],
        message: 'startPx and endPx must differ'
      })
    }
  })
export type HyperliquidScaleOrderCommandOptions = z.infer<
  typeof HyperliquidScaleOrderCommandOptionsSchema
>

export const HyperliquidSpotScaleOrderCommandOptionsSchema = z
  .object({
    from: EthAddressSchema,
    pair: z.string().trim().min(1),
    amount: BigNumberSchema,
    side: HyperliquidSpotSideSchema,
    startPx: BigNumberSchema,
    endPx: BigNumberSchema,
    orders: z.coerce.number().int().min(2).max(50),
    sizeSkew: z.coerce.number().positive().default(1),
    tif: HyperliquidPerpTifSchema.default('Gtc'),
    walletId: z.string().trim().min(1),
    out: z.string().nullish()
  })
  .superRefine((value, ctx) => {
    const isPositive = (price: typeof value.startPx): boolean =>
      !price.isNaN() && price.isFinite() && price.isGreaterThan(0)

    if (!isPositive(value.startPx)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['startPx'],
        message: 'startPx must be greater than 0'
      })
    }
    if (!isPositive(value.endPx)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endPx'],
        message: 'endPx must be greater than 0'
      })
    }
    if (isPositive(value.startPx) && isPositive(value.endPx) && value.startPx.eq(value.endPx)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endPx'],
        message: 'startPx and endPx must differ'
      })
    }
  })
export type HyperliquidSpotScaleOrderCommandOptions = z.infer<
  typeof HyperliquidSpotScaleOrderCommandOptionsSchema
>

export const HyperliquidSpotTwapOrderCommandOptionsSchema = z.object({
  from: EthAddressSchema,
  pair: z.string().trim().min(1),
  amount: BigNumberSchema,
  side: HyperliquidSpotSideSchema,
  durationMinutes: z.coerce.number().int().min(5).max(1440),
  randomize: z.boolean().default(false),
  walletId: z.string().trim().min(1),
  out: z.string().nullish()
})
export type HyperliquidSpotTwapOrderCommandOptions = z.infer<
  typeof HyperliquidSpotTwapOrderCommandOptionsSchema
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

export const HyperliquidListOpenOrdersCommandOptionsSchema = z.object({
  address: EthAddressSchema,
  dex: z.string().trim().min(1).nullish(),
  allDexes: z.boolean().default(false),
  out: z.string().nullish()
})
export type HyperliquidListOpenOrdersCommandOptions = z.infer<
  typeof HyperliquidListOpenOrdersCommandOptionsSchema
>

export const HyperliquidOpenOrderSideSchema = z.enum(['buy', 'sell'])
export type HyperliquidOpenOrderSide = z.infer<typeof HyperliquidOpenOrderSideSchema>

export const HyperliquidOpenOrderTypeSchema = z.enum([
  'Market',
  'Limit',
  'Stop Market',
  'Stop Limit',
  'Take Profit Market',
  'Take Profit Limit'
])
export type HyperliquidOpenOrderType = z.infer<typeof HyperliquidOpenOrderTypeSchema>

export const HyperliquidOpenOrderSchema = z.object({
  dex: z.string(),
  coin: z.string(),
  market: HyperliquidMarketKindSchema,
  side: HyperliquidOpenOrderSideSchema,
  limitPx: z.string(),
  size: z.string(),
  origSize: z.string(),
  orderId: z.number().int().nonnegative(),
  timestamp: z.number().int().nonnegative(),
  orderType: HyperliquidOpenOrderTypeSchema,
  tif: z.enum(['Gtc', 'Ioc', 'Alo', 'FrontendMarket', 'LiquidationMarket']).nullish(),
  reduceOnly: z.boolean(),
  isTrigger: z.boolean(),
  triggerPx: z.string().nullish(),
  triggerCondition: z.string(),
  isPositionTpsl: z.boolean(),
  cloid: z.string().nullish()
})
export type HyperliquidOpenOrder = z.infer<typeof HyperliquidOpenOrderSchema>

export const HyperliquidOpenOrdersResultSchema = z.object({
  address: EthAddressSchema,
  orders: z.array(HyperliquidOpenOrderSchema)
})
export type HyperliquidOpenOrdersResult = z.infer<typeof HyperliquidOpenOrdersResultSchema>

export const HyperliquidListFillsCommandOptionsSchema = z
  .object({
    address: EthAddressSchema,
    startTime: z.coerce.number().int().nonnegative().nullish(),
    endTime: z.coerce.number().int().nonnegative().nullish(),
    aggregateByTime: z.boolean().default(false),
    reversed: z.boolean().default(false),
    pairDetect: z.boolean().default(false),
    pairWindowMs: z.coerce.number().int().positive().default(1000),
    out: z.string().nullish()
  })
  .superRefine((value, ctx) => {
    if (!isNullish(value.endTime) && isNullish(value.startTime)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endTime'],
        message: 'endTime requires startTime'
      })
    }
    if (
      !isNullish(value.startTime) &&
      !isNullish(value.endTime) &&
      value.endTime < value.startTime
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endTime'],
        message: 'endTime must be greater than or equal to startTime'
      })
    }
  })
export type HyperliquidListFillsCommandOptions = z.infer<
  typeof HyperliquidListFillsCommandOptionsSchema
>

export const HyperliquidVerifyFillCommandOptionsSchema = z.object({
  address: EthAddressSchema,
  coin: z.string().trim().min(1),
  dex: z.string().trim().nullish(),
  windowMs: z.coerce.number().int().positive().default(1000),
  out: z.string().nullish()
})
export type HyperliquidVerifyFillCommandOptions = z.infer<
  typeof HyperliquidVerifyFillCommandOptionsSchema
>

export const HyperliquidFillLiquidationSchema = z.object({
  liquidatedUser: EthAddressSchema,
  markPx: z.string(),
  method: z.enum(['market', 'backstop'])
})
export type HyperliquidFillLiquidation = z.infer<typeof HyperliquidFillLiquidationSchema>

export const HyperliquidFillSchema = z.object({
  dex: z.string(),
  coin: z.string(),
  market: HyperliquidMarketKindSchema,
  side: HyperliquidOpenOrderSideSchema,
  price: z.string(),
  size: z.string(),
  startPosition: z.string(),
  direction: z.string(),
  closedPnl: z.string(),
  fee: z.string(),
  feeToken: z.string(),
  builderFee: z.string().nullish(),
  hash: z.string(),
  orderId: z.number().int().nonnegative(),
  tradeId: z.number().int().nonnegative(),
  timestamp: z.number().int().nonnegative(),
  crossed: z.boolean(),
  twapId: z.number().int().nonnegative().nullish(),
  cloid: z.string().nullish(),
  liquidation: HyperliquidFillLiquidationSchema.nullish()
})
export type HyperliquidFill = z.infer<typeof HyperliquidFillSchema>

export const HyperliquidFillsResultSchema = z.object({
  address: EthAddressSchema,
  fills: z.array(HyperliquidFillSchema)
})
export type HyperliquidFillsResult = z.infer<typeof HyperliquidFillsResultSchema>

/**
 * One detected equal-size buy/sell round-trip pair: the fills feed honestly
 * reports both legs, but clearing nets them to a zero position — an
 * open+immediate-flatten that never leaves exposure. Surfaced so the desk
 * never re-fires into the class expecting a live position.
 */
export const HyperliquidFillPairSchema = z.object({
  coin: z.string(),
  dex: z.string(),
  size: z.string(),
  buyOrderId: z.number().int().nonnegative(),
  sellOrderId: z.number().int().nonnegative(),
  buyPx: z.string(),
  sellPx: z.string(),
  buyTimestamp: z.number().int().nonnegative(),
  sellTimestamp: z.number().int().nonnegative(),
  gapMs: z.number().int().nonnegative()
})
export type HyperliquidFillPair = z.infer<typeof HyperliquidFillPairSchema>

export const HyperliquidFillPairsResultSchema = z.object({
  address: EthAddressSchema,
  pairs: z.array(HyperliquidFillPairSchema)
})
export type HyperliquidFillPairsResult = z.infer<typeof HyperliquidFillPairsResultSchema>

export interface HyperliquidUserFillWire {
  readonly coin: string
  readonly px: string
  readonly sz: string
  readonly side: 'B' | 'A'
  readonly time: number
  readonly startPosition: string
  readonly dir: string
  readonly closedPnl: string
  readonly hash: string
  readonly oid: number
  readonly crossed: boolean
  readonly fee: string
  readonly builderFee?: string
  readonly tid: number
  readonly feeToken: string
  readonly twapId: number | null
  readonly cloid?: string
  readonly liquidation?: HyperliquidFillLiquidation
}

export interface HyperliquidFrontendOpenOrderWire {
  readonly coin: string
  readonly side: 'B' | 'A'
  readonly limitPx: string
  readonly sz: string
  readonly origSz: string
  readonly oid: number
  readonly timestamp: number
  readonly orderType: HyperliquidOpenOrderType
  readonly tif: 'Gtc' | 'Ioc' | 'Alo' | 'FrontendMarket' | 'LiquidationMarket' | null
  readonly reduceOnly: boolean
  readonly isTrigger: boolean
  readonly triggerPx: string
  readonly triggerCondition: string
  readonly isPositionTpsl: boolean
  readonly cloid: string | null
}

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

/**
 * Post-fill position read-guard verdict: a fill ack is not "live" until the
 * position actually exists (list-positions). `fillsWithoutPosition` carries the
 * paired-leg evidence so the desk sees a net-zero round-trip, not a dropped
 * fill. Read-only — the guard never cancels, never re-fires. Defined after
 * HyperliquidPerpPositionSchema (it references the position).
 */
export const HyperliquidPostFillGuardResultSchema = z.object({
  address: EthAddressSchema,
  coin: z.string(),
  dex: z.string(),
  verdict: z.enum(['position-exists', 'fills-without-position', 'no-recent-fills']),
  warning: z.string().nullish(),
  pairs: z.array(HyperliquidFillPairSchema).nullish(),
  position: HyperliquidPerpPositionSchema.nullish(),
  slReanchored: z.string().nullish()
})
export type HyperliquidPostFillGuardResult = z.infer<typeof HyperliquidPostFillGuardResultSchema>

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
  szDecimals: z.number().int().nonnegative(),
  isDelisted: z.boolean(),
  requiresIsolatedMargin: z.boolean()
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

export const HyperliquidCandleIntervalSchema = z.enum([
  '1m',
  '3m',
  '5m',
  '15m',
  '30m',
  '1h',
  '2h',
  '4h',
  '8h',
  '12h',
  '1d',
  '3d',
  '1w',
  '1M'
])
export type HyperliquidCandleInterval = z.infer<typeof HyperliquidCandleIntervalSchema>

export const HyperliquidCandleCommandOptionsSchema = z.object({
  coin: HyperliquidCoinSchema,
  interval: HyperliquidCandleIntervalSchema.default('1m'),
  startTime: z.coerce.number().int().nonnegative().nullish(),
  endTime: z.coerce.number().int().nonnegative().nullish(),
  dex: z.string().trim().min(1).nullish(),
  out: z.string().nullish()
})

// Instrumented single signing replay (diagnostic): signs the EXACT typed data a
// close-shaped perp order would sign (same wire build, same connectionId blob)
// and NEVER broadcasts. Used to surface the real cause behind the SDK's opaque
// "Failed to sign typed data with viem wallet" wrapper before any fund move.
export const HyperliquidSignReplayCommandOptionsSchema = z.object({
  from: EthAddressSchema,
  coin: z.string().trim().min(1),
  amount: BigNumberSchema,
  side: HyperliquidPerpSideSchema,
  type: HyperliquidPerpOrderTypeSchema.default('market'),
  reduceOnly: z.boolean().default(true),
  price: BigNumberSchema.nullish(),
  triggerPx: BigNumberSchema.nullish(),
  tif: HyperliquidPerpTifSchema.default('Gtc'),
  marginMode: HyperliquidPerpMarginModeSchema.default('cross'),
  leverage: z.coerce.number().int().positive().nullish(),
  dex: z.string().trim().nullish(),
  walletId: z.string().trim().min(1),
  out: z.string().nullish()
})
export type HyperliquidSignReplayCommandOptions = z.infer<
  typeof HyperliquidSignReplayCommandOptionsSchema
>

export const HyperliquidEntryGateStatusSchema = z.enum([
  'stand_by',
  'armed_awaiting',
  'trigger_fired'
])
export type HyperliquidEntryGateStatus = z.infer<typeof HyperliquidEntryGateStatusSchema>

// Durable per-coin gate state: what the trigger-watch writes and the entry
// enforcement reads. firedAt/ttlMs are epoch-ms; a trigger_fired state within
// its TTL is the only state that lets an entry through.
export const HyperliquidEntryGateStateSchema = z.object({
  dex: z.string(),
  coin: z.string(),
  status: HyperliquidEntryGateStatusSchema,
  firedAt: z.number().int().nonnegative().nullish(),
  ttlMs: z.number().int().positive().nullish(),
  updatedAt: z.number().int().nonnegative()
})
export type HyperliquidEntryGateState = z.infer<typeof HyperliquidEntryGateStateSchema>

export const HyperliquidEntryGateStatesResultSchema = z.object({
  states: z.array(HyperliquidEntryGateStateSchema)
})
export type HyperliquidEntryGateStatesResult = z.infer<
  typeof HyperliquidEntryGateStatesResultSchema
>

export const HyperliquidEntryGateStatusCommandOptionsSchema = z.object({
  coin: z.string().trim().min(1).nullish(),
  dex: z.string().trim().nullish(),
  stateDir: z.string().nullish(),
  out: z.string().nullish()
})
export type HyperliquidEntryGateStatusCommandOptions = z.infer<
  typeof HyperliquidEntryGateStatusCommandOptionsSchema
>

export const HyperliquidEntryGateOverrideCommandOptionsSchema = z.object({
  coin: z.string().trim().min(1),
  dex: z.string().trim().nullish(),
  actor: z.string().trim().min(1),
  reason: z.string().trim().min(1),
  ttlMs: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60 * 1000),
  stateDir: z.string().nullish(),
  out: z.string().nullish()
})
export type HyperliquidEntryGateOverrideCommandOptions = z.infer<
  typeof HyperliquidEntryGateOverrideCommandOptionsSchema
>

export const HyperliquidEntryGateOverrideResultSchema = z.object({
  granted: z.literal(true),
  dex: z.string(),
  coin: z.string(),
  actor: z.string(),
  reason: z.string(),
  ttlMs: z.number().int().positive(),
  firedAt: z.number().int().nonnegative(),
  stateDir: z.string(),
  statePath: z.string(),
  journalPath: z.string()
})
export type HyperliquidEntryGateOverrideResult = z.infer<
  typeof HyperliquidEntryGateOverrideResultSchema
>

export const HyperliquidEntryGateDecisionSchema = z.object({
  allowed: z.boolean(),
  state: HyperliquidEntryGateStateSchema,
  reason: z.string()
})
export type HyperliquidEntryGateDecision = z.infer<typeof HyperliquidEntryGateDecisionSchema>

// ---- Sizing-lock: operative-package manifest + entry-size validation ----

// One coin's locked entry sizing inside an operative package version.
export const HyperliquidSizingEntrySchema = z.object({
  coin: z.string(),
  dex: z.string().default('main'),
  notionalUsd: z.number().positive(),
  marginUsd: z.number().positive(),
  leverage: z.number().int().positive(),
  szDecimals: z.number().int().nonnegative()
})
export type HyperliquidSizingEntry = z.infer<typeof HyperliquidSizingEntrySchema>

// One versioned package record. supersededAt null = the operative version.
export const HyperliquidPackageManifestRecordSchema = z.object({
  packageId: z.string().trim().min(1),
  version: z.string().trim().min(1),
  supersededAt: z.number().int().nonnegative().nullish(),
  perCoin: z.array(HyperliquidSizingEntrySchema)
})
export type HyperliquidPackageManifestRecord = z.infer<
  typeof HyperliquidPackageManifestRecordSchema
>

// The operative-package manifest file: every package version the desk armed,
// with supersession recorded as a field so "operative at execution time" is a
// lookup, not a convention.
export const HyperliquidPackageManifestSchema = z.object({
  records: z.array(HyperliquidPackageManifestRecordSchema)
})
export type HyperliquidPackageManifest = z.infer<typeof HyperliquidPackageManifestSchema>

export const HyperliquidSizingLockDecisionSchema = z.object({
  allowed: z.boolean(),
  reason: z.string(),
  operative: HyperliquidPackageManifestRecordSchema.nullish(),
  entry: HyperliquidSizingEntrySchema.nullish(),
  actualNotionalUsd: z.number().nullish(),
  lockedNotionalUsd: z.number().nullish()
})
export type HyperliquidSizingLockDecision = z.infer<typeof HyperliquidSizingLockDecisionSchema>

export const HyperliquidSizingLockStatusCommandOptionsSchema = z.object({
  coin: z.string().trim().min(1).nullish(),
  dex: z.string().trim().nullish(),
  stateDir: z.string().nullish(),
  out: z.string().nullish()
})
export type HyperliquidSizingLockStatusCommandOptions = z.infer<
  typeof HyperliquidSizingLockStatusCommandOptionsSchema
>

export const HyperliquidSizingLockOverrideCommandOptionsSchema = z.object({
  coin: z.string().trim().min(1),
  dex: z.string().trim().nullish(),
  actor: z.string().trim().min(1),
  reason: z.string().trim().min(1),
  ttlMs: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60 * 1000),
  stateDir: z.string().nullish(),
  out: z.string().nullish()
})
export type HyperliquidSizingLockOverrideCommandOptions = z.infer<
  typeof HyperliquidSizingLockOverrideCommandOptionsSchema
>

export const HyperliquidSizingLockOverrideResultSchema = z.object({
  granted: z.literal(true),
  dex: z.string(),
  coin: z.string(),
  actor: z.string(),
  reason: z.string(),
  ttlMs: z.number().int().positive(),
  grantedAt: z.number().int().nonnegative(),
  stateDir: z.string(),
  statePath: z.string(),
  journalPath: z.string()
})
export type HyperliquidSizingLockOverrideResult = z.infer<
  typeof HyperliquidSizingLockOverrideResultSchema
>

export const HyperliquidSizingLockArmCommandOptionsSchema = z.object({
  packageId: z.string().trim().min(1),
  ver: z.string().trim().min(1),
  spec: z.preprocess(
    (value) => {
      if (typeof value !== 'string') return value
      return JSON.parse(value)
    },
    z.record(
      z.object({
        dex: z.string().trim().nullish(),
        notionalUsd: z.coerce.number().positive(),
        marginUsd: z.coerce.number().positive(),
        leverage: z.coerce.number().int().positive(),
        szDecimals: z.coerce.number().int().nonnegative()
      })
    )
  ),
  stateDir: z.string().nullish(),
  address: EthAddressSchema.nullish(),
  overrideActor: z.string().trim().nullish(),
  overrideReason: z.string().trim().nullish(),
  out: z.string().nullish()
})
export type HyperliquidSizingLockArmCommandOptions = z.infer<
  typeof HyperliquidSizingLockArmCommandOptionsSchema
>

export const HyperliquidSizingLockArmResultSchema = z.object({
  armed: z.literal(true),
  packageId: z.string(),
  version: z.string(),
  superseded: z.array(z.string()).nullish(),
  manifestPath: z.string()
})
export type HyperliquidSizingLockArmResult = z.infer<typeof HyperliquidSizingLockArmResultSchema>

/**
 * Arm-collision guard verdict (the COIN ghost-flatten class): a manifest re-arm
 * must not flatten a coin that currently has a LIVE position, an IN-FLIGHT fill,
 * or a resting entry. At-arm read via list-positions + list-open-orders +
 * list-fills. A re-arm for a held coin is refused unless a chief/desi override
 * (journaled deliberate close path) grants it.
 */
export const HyperliquidSizingLockArmCollisionSchema = z.object({
  livePosition: z.boolean(),
  inFlightFill: z.boolean(),
  restingEntry: z.boolean(),
  note: z.string().nullish()
})
export type HyperliquidSizingLockArmCollision = z.infer<
  typeof HyperliquidSizingLockArmCollisionSchema
>

export const HyperliquidSignReplayBaseSchema = z.object({
  kind: z.literal('sign-replay'),
  broadcast: z.literal(false),
  coin: z.string(),
  side: HyperliquidPerpSideSchema,
  nonce: z.number().int().nonnegative(),
  timestamp: z.number().int().nonnegative()
})
export type HyperliquidSignReplayBase = z.infer<typeof HyperliquidSignReplayBaseSchema>

export const HyperliquidSignReplayResultSchema = z.discriminatedUnion('ok', [
  HyperliquidSignReplayBaseSchema.extend({
    ok: z.literal(true),
    signature: z.object({
      r: HexStringSchema,
      s: HexStringSchema,
      v: z.number().int()
    })
  }),
  HyperliquidSignReplayBaseSchema.extend({
    ok: z.literal(false),
    error: z.string().trim().min(1)
  })
])
export type HyperliquidSignReplayResult = z.infer<typeof HyperliquidSignReplayResultSchema>

export type HyperliquidCandleCommandOptions = z.infer<typeof HyperliquidCandleCommandOptionsSchema>

// One perp candle: the shared OHLCV contract (t is epoch ms), matching
// TaCandleSchema in types/Ta.ts so the ta indicators compute layer is unchanged.
export const HyperliquidCandleSchema = z.object({
  t: z.number(),
  o: z.number(),
  h: z.number(),
  l: z.number(),
  c: z.number(),
  v: z.number().nullish()
})
export type HyperliquidCandle = z.infer<typeof HyperliquidCandleSchema>

export const HyperliquidCandlesSchema = z.object({
  source: z.literal('hyperliquid'),
  interval: HyperliquidCandleIntervalSchema,
  coin: z.string(),
  candles: z.array(HyperliquidCandleSchema)
})
export type HyperliquidCandlesResult = z.infer<typeof HyperliquidCandlesSchema>

export interface HyperliquidCandlesParams {
  readonly coin: string
  readonly interval: HyperliquidCandleInterval
  readonly startTime: number | null | undefined
  readonly endTime: number | null | undefined
  readonly dex: string | null | undefined
}

export interface HyperliquidServiceParams {
  readonly transaction: TransactionService
  readonly infoClient?: InfoClient
  readonly entryGate?: EntryGateService
  readonly sizingLock?: SizingLockService
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

export interface HyperliquidInfoUserDexParams {
  user: EthAddress
  dex?: string
}

export interface HyperliquidListPositionsParams {
  readonly address: EthAddress
  readonly dex: string | null | undefined
  readonly allDexes: boolean
}

export interface HyperliquidListOpenOrdersParams {
  readonly address: EthAddress
  readonly dex: string | null | undefined
  readonly allDexes: boolean
}

export interface HyperliquidListFillsParams {
  readonly address: EthAddress
  readonly startTime: number | null | undefined
  readonly endTime: number | null | undefined
  readonly aggregateByTime: boolean
  readonly reversed: boolean
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
  /** Client order id — the venue dedupes on it (a re-fire reusing the same cloid is ignored). */
  readonly c?: string
}

export interface BuildBracketExitLegParams {
  readonly orderType: HyperliquidPerpOrderType
  readonly triggerPx: BigNumber
  readonly limitPx: BigNumber | null | undefined
  readonly exitIsBuy: boolean
  readonly perpAsset: ResolvedPerpAsset
  readonly size: string
  readonly cloid?: string
}

export const ResolvedOrderAssetSchema = z.object({
  assetId: z.number().int().nonnegative(),
  referencePrice: BigNumberSchema,
  szDecimals: z.number().int().nonnegative()
})
export type ResolvedOrderAsset = z.infer<typeof ResolvedOrderAssetSchema>

export interface BuildScaleOrdersParams {
  readonly asset: ResolvedOrderAsset
  readonly marketType: HyperliquidMarketType
  readonly amount: BigNumber
  readonly isBuy: boolean
  readonly startPx: BigNumber
  readonly endPx: BigNumber
  readonly orders: number
  readonly sizeSkew: number
  readonly tif: HyperliquidPerpTif
  readonly reduceOnly: boolean
}

export interface ValidateTwapNotionalParams {
  readonly asset: ResolvedOrderAsset
  readonly amount: BigNumber
  readonly durationMinutes: number
}

export interface BuildTwapWireParams {
  readonly asset: ResolvedOrderAsset
  readonly amount: BigNumber
  readonly isBuy: boolean
  readonly durationMinutes: number
  readonly randomize: boolean
  readonly reduceOnly: boolean
}

export interface ResolvePerpOrderTypeFieldParams {
  readonly orderType: HyperliquidPerpOrderType
  readonly tif: HyperliquidPerpTif
  readonly triggerPx: BigNumber | null | undefined
  readonly szDecimals: number
}
