import type { InfoClient } from '@nktkas/hyperliquid'
import BigNumber from 'bignumber.js'
import { z } from 'zod'

import { type TransactionService } from '@/services/TransactionService'
import { type EthAddress, EthAddressSchema } from '@/types/Eth'
import { BigintSchema, BigNumberSchema, type HexString, HexStringSchema } from '@/types/Lang'
import { type EthSignTypedData } from '@/types/Tx'
import { isNullish, prepend0x } from '@/utils/Lang'

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

// Client Order ID: 0x followed by 32 hex characters (16 bytes), normalized to lowercase.
export const HyperliquidCloidSchema = z
  .string()
  .trim()
  .regex(/^0x[0-9a-fA-F]{32}$/, 'cloid must be 0x followed by 32 hex characters')
  .transform((value) => prepend0x(value.toLowerCase()))
export type HyperliquidCloid = z.infer<typeof HyperliquidCloidSchema>

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
    cloid: HyperliquidCloidSchema.nullish(),
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
    cloid: HyperliquidCloidSchema.nullish(),
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

export const HyperliquidCancelOrderCommandOptionsSchema = z
  .object({
    from: EthAddressSchema,
    coin: z.string().trim().min(1),
    orderId: z.coerce.number().int().nonnegative().nullish(),
    cloid: HyperliquidCloidSchema.nullish(),
    dex: z.string().trim().nullish(),
    walletId: z.string().trim().min(1),
    out: z.string().nullish()
  })
  .superRefine((value, ctx) => {
    if (isNullish(value.orderId) === isNullish(value.cloid)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['orderId'],
        message: 'provide exactly one of --order-id or --cloid'
      })
    }
  })
export type HyperliquidCancelOrderCommandOptions = z.infer<
  typeof HyperliquidCancelOrderCommandOptionsSchema
>

export const HyperliquidSpotCancelOrderCommandOptionsSchema = z
  .object({
    from: EthAddressSchema,
    pair: z.string().trim().min(1),
    orderId: z.coerce.number().int().nonnegative().nullish(),
    cloid: HyperliquidCloidSchema.nullish(),
    walletId: z.string().trim().min(1),
    out: z.string().nullish()
  })
  .superRefine((value, ctx) => {
    if (isNullish(value.orderId) === isNullish(value.cloid)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['orderId'],
        message: 'provide exactly one of --order-id or --cloid'
      })
    }
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

export const HyperliquidOrderStatusCommandOptionsSchema = z
  .object({
    address: EthAddressSchema,
    oid: z.coerce.number().int().nonnegative().nullish(),
    cloid: HyperliquidCloidSchema.nullish(),
    out: z.string().nullish()
  })
  .superRefine((value, ctx) => {
    if (isNullish(value.oid) === isNullish(value.cloid)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['oid'],
        message: 'provide exactly one of --oid or --cloid'
      })
    }
  })
export type HyperliquidOrderStatusCommandOptions = z.infer<
  typeof HyperliquidOrderStatusCommandOptionsSchema
>

export const HyperliquidOrderStatusOrderSchema = z.object({
  coin: z.string(),
  side: HyperliquidOpenOrderSideSchema,
  size: z.string(),
  orig_size: z.string(),
  limit_px: z.string(),
  oid: z.number().int().nonnegative(),
  cloid: z.string().nullish(),
  timestamp: z.number().int().nonnegative()
})
export type HyperliquidOrderStatusOrder = z.infer<typeof HyperliquidOrderStatusOrderSchema>

export const HyperliquidOrderStatusResultSchema = z.object({
  status: z.string(),
  status_timestamp: z.number().int().nonnegative().nullish(),
  order: HyperliquidOrderStatusOrderSchema.nullish()
})
export type HyperliquidOrderStatusResult = z.infer<typeof HyperliquidOrderStatusResultSchema>

export const HyperliquidFundingHistoryCommandOptionsSchema = z
  .object({
    coin: z.string().trim().min(1),
    startTime: z.coerce.number().int().nonnegative(),
    endTime: z.coerce.number().int().nonnegative().nullish(),
    dex: z.string().trim().min(1).nullish(),
    out: z.string().nullish()
  })
  .superRefine((value, ctx) => {
    if (!isNullish(value.endTime) && value.endTime < value.startTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endTime'],
        message: 'endTime must be greater than or equal to startTime'
      })
    }
  })
export type HyperliquidFundingHistoryCommandOptions = z.infer<
  typeof HyperliquidFundingHistoryCommandOptionsSchema
>

export const HyperliquidFundingHistoryEntrySchema = z.object({
  coin: z.string(),
  funding_rate: z.string(),
  premium: z.string(),
  time: z.number().int().nonnegative()
})
export type HyperliquidFundingHistoryEntry = z.infer<typeof HyperliquidFundingHistoryEntrySchema>

export const HyperliquidPredictedFundingsCommandOptionsSchema = z.object({
  out: z.string().nullish()
})
export type HyperliquidPredictedFundingsCommandOptions = z.infer<
  typeof HyperliquidPredictedFundingsCommandOptionsSchema
>

export const HyperliquidPredictedFundingVenueSchema = z.object({
  venue: z.string(),
  funding_rate: z.string().nullish(),
  next_funding_time: z.number().int().nonnegative().nullish(),
  funding_interval_hours: z.number().nullish()
})
export type HyperliquidPredictedFundingVenue = z.infer<
  typeof HyperliquidPredictedFundingVenueSchema
>

export const HyperliquidPredictedFundingSchema = z.object({
  coin: z.string(),
  venues: z.array(HyperliquidPredictedFundingVenueSchema)
})
export type HyperliquidPredictedFunding = z.infer<typeof HyperliquidPredictedFundingSchema>

// Mirrors the SDK's candleSnapshot interval picklist exactly.
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

export const HyperliquidCandlesCommandOptionsSchema = z
  .object({
    coin: z.string().trim().min(1),
    interval: HyperliquidCandleIntervalSchema,
    startTime: z.coerce.number().int().nonnegative(),
    endTime: z.coerce.number().int().nonnegative().nullish(),
    dex: z.string().trim().min(1).nullish(),
    out: z.string().nullish()
  })
  .superRefine((value, ctx) => {
    if (!isNullish(value.endTime) && value.endTime < value.startTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endTime'],
        message: 'endTime must be greater than or equal to startTime'
      })
    }
  })
export type HyperliquidCandlesCommandOptions = z.infer<
  typeof HyperliquidCandlesCommandOptionsSchema
>

export const HyperliquidCandleSchema = z.object({
  open_time: z.number().int().nonnegative(),
  close_time: z.number().int().nonnegative(),
  open: z.string(),
  high: z.string(),
  low: z.string(),
  close: z.string(),
  volume: z.string(),
  num_trades: z.number().int().nonnegative()
})
export type HyperliquidCandle = z.infer<typeof HyperliquidCandleSchema>

export const HyperliquidPortfolioCommandOptionsSchema = z.object({
  address: EthAddressSchema,
  out: z.string().nullish()
})
export type HyperliquidPortfolioCommandOptions = z.infer<
  typeof HyperliquidPortfolioCommandOptionsSchema
>

export const HyperliquidPortfolioBucketSchema = z.object({
  period: z.string(),
  account_value_history: z.array(z.tuple([z.number(), z.string()])),
  pnl_history: z.array(z.tuple([z.number(), z.string()])),
  vlm: z.string()
})
export type HyperliquidPortfolioBucket = z.infer<typeof HyperliquidPortfolioBucketSchema>

export const HyperliquidPortfolioResultSchema = z.object({
  address: EthAddressSchema,
  periods: z.array(HyperliquidPortfolioBucketSchema)
})
export type HyperliquidPortfolioResult = z.infer<typeof HyperliquidPortfolioResultSchema>

export const HyperliquidLedgerCommandOptionsSchema = z
  .object({
    address: EthAddressSchema,
    startTime: z.coerce.number().int().nonnegative().nullish(),
    endTime: z.coerce.number().int().nonnegative().nullish(),
    out: z.string().nullish()
  })
  .superRefine((value, ctx) => {
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
export type HyperliquidLedgerCommandOptions = z.infer<typeof HyperliquidLedgerCommandOptionsSchema>

// Non-funding ledger updates carry a per-kind payload; the discriminated union
// is flattened into {time, hash, kind, ...snake_case fields}.
export const HyperliquidLedgerEntrySchema = z
  .object({
    time: z.number().int().nonnegative(),
    hash: z.string(),
    kind: z.string()
  })
  .catchall(z.unknown())
export type HyperliquidLedgerEntry = z.infer<typeof HyperliquidLedgerEntrySchema>

export const HyperliquidLedgerResultSchema = z.object({
  address: EthAddressSchema,
  updates: z.array(HyperliquidLedgerEntrySchema)
})
export type HyperliquidLedgerResult = z.infer<typeof HyperliquidLedgerResultSchema>

export const HyperliquidUserFeesCommandOptionsSchema = z.object({
  address: EthAddressSchema,
  out: z.string().nullish()
})
export type HyperliquidUserFeesCommandOptions = z.infer<
  typeof HyperliquidUserFeesCommandOptionsSchema
>

export const HyperliquidUserFeesDailyVolumeSchema = z.object({
  date: z.string(),
  user_cross: z.string(),
  user_add: z.string(),
  exchange: z.string()
})
export type HyperliquidUserFeesDailyVolume = z.infer<typeof HyperliquidUserFeesDailyVolumeSchema>

export const HyperliquidUserFeesResultSchema = z.object({
  address: EthAddressSchema,
  user_cross_rate: z.string(),
  user_add_rate: z.string(),
  user_spot_cross_rate: z.string(),
  user_spot_add_rate: z.string(),
  active_referral_discount: z.string(),
  daily_user_vlm: z.array(HyperliquidUserFeesDailyVolumeSchema)
})
export type HyperliquidUserFeesResult = z.infer<typeof HyperliquidUserFeesResultSchema>

export const HyperliquidRateLimitCommandOptionsSchema = z.object({
  address: EthAddressSchema,
  out: z.string().nullish()
})
export type HyperliquidRateLimitCommandOptions = z.infer<
  typeof HyperliquidRateLimitCommandOptionsSchema
>

export const HyperliquidRateLimitResultSchema = z.object({
  address: EthAddressSchema,
  cum_vlm: z.string(),
  n_requests_used: z.number().int().nonnegative(),
  n_requests_cap: z.number().int().nonnegative(),
  n_requests_surplus: z.number().int().nonnegative()
})
export type HyperliquidRateLimitResult = z.infer<typeof HyperliquidRateLimitResultSchema>

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

export interface HyperliquidServiceParams {
  readonly transaction: TransactionService
  readonly infoClient?: InfoClient
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

export interface HyperliquidOrderStatusParams {
  readonly address: EthAddress
  readonly oid: number | null | undefined
  readonly cloid: string | null | undefined
}

export interface HyperliquidFundingHistoryParams {
  readonly coin: string
  readonly startTime: number
  readonly endTime: number | null | undefined
  readonly dex: string | null | undefined
}

export interface HyperliquidCandlesParams {
  readonly coin: string
  readonly interval: HyperliquidCandleInterval
  readonly startTime: number
  readonly endTime: number | null | undefined
  readonly dex: string | null | undefined
}

export interface HyperliquidPortfolioParams {
  readonly address: EthAddress
}

export interface HyperliquidUserFeesParams {
  readonly address: EthAddress
}

export interface HyperliquidRateLimitParams {
  readonly address: EthAddress
}

export interface HyperliquidLedgerParams {
  readonly address: EthAddress
  readonly startTime: number | null | undefined
  readonly endTime: number | null | undefined
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
  readonly c?: string
}

export interface BuildBracketExitLegParams {
  readonly orderType: HyperliquidPerpOrderType
  readonly triggerPx: BigNumber
  readonly limitPx: BigNumber | null | undefined
  readonly exitIsBuy: boolean
  readonly perpAsset: ResolvedPerpAsset
  readonly size: string
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
