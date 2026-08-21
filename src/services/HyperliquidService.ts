import {
  type CancelSuccessResponse,
  ExchangeClient,
  HttpTransport,
  InfoClient,
  type MetaAndAssetCtxsParameters,
  type OrderParameters,
  type OrderSuccessResponse,
  type SendAssetSuccessResponse,
  type SpotSendSuccessResponse,
  type TwapCancelSuccessResponse,
  type TwapOrderSuccessResponse,
  type UpdateIsolatedMarginSuccessResponse,
  type UpdateLeverageSuccessResponse,
  type UsdClassTransferSuccessResponse,
  type UsdSendSuccessResponse,
  type Withdraw3SuccessResponse
} from '@nktkas/hyperliquid'
import { signL1Action } from '@nktkas/hyperliquid/signing'
import { formatPrice, formatSize } from '@nktkas/hyperliquid/utils'
import BigNumber from 'bignumber.js'
import { encodeFunctionData, erc20Abi, parseUnits } from 'viem'
import { z } from 'zod'

import { retryProviderAware } from '@/helpers/AsyncControl'
import { unwrapCause } from '@/helpers/Cause'
import { EntryGateService } from '@/services/EntryGateService'
import { SizingLockService } from '@/services/SizingLockService'
import { TransactionService } from '@/services/TransactionService'
import {
  type BuildBracketExitLegParams,
  type BuildScaleOrdersParams,
  type BuildTwapWireParams,
  type CreateExchangeClientParams,
  type HyperliquidAdjustMarginCommandOptions,
  type HyperliquidAllPerpAssetsResult,
  HyperliquidAllPerpAssetsResultSchema,
  type HyperliquidBalancesResult,
  HyperliquidBalancesResultSchema,
  type HyperliquidCancelOrderCommandOptions,
  type HyperliquidCandlesParams,
  type HyperliquidCandlesResult,
  HyperliquidCandlesSchema,
  HyperliquidCoinSchema,
  type HyperliquidDepositParams,
  type HyperliquidDepositResult,
  HyperliquidDepositResultSchema,
  type HyperliquidDexCashTransferCommandOptions,
  type HyperliquidExchange,
  HyperliquidExchangeSchema,
  type HyperliquidFill,
  type HyperliquidFillPairsResult,
  HyperliquidFillPairsResultSchema,
  HyperliquidFillSchema,
  type HyperliquidFillsResult,
  HyperliquidFillsResultSchema,
  type HyperliquidFrontendOpenOrderWire,
  type HyperliquidInfoUserDexParams,
  type HyperliquidListBalancesParams,
  type HyperliquidListFillsParams,
  type HyperliquidListOpenOrdersParams,
  type HyperliquidListPositionsParams,
  type HyperliquidOpenOrder,
  HyperliquidOpenOrderSchema,
  type HyperliquidOpenOrdersResult,
  HyperliquidOpenOrdersResultSchema,
  type HyperliquidOrderTif,
  HyperliquidPerpAssetSchema,
  type HyperliquidPerpAssetsResult,
  HyperliquidPerpAssetsResultSchema,
  type HyperliquidPerpPosition,
  HyperliquidPerpPositionSchema,
  type HyperliquidPerpTradeCommandOptions,
  type HyperliquidPerpTwapOrder,
  HyperliquidPerpTwapOrderSchema,
  type HyperliquidPositionsResult,
  HyperliquidPositionsResultSchema,
  type HyperliquidPostFillGuardResult,
  HyperliquidPostFillGuardResultSchema,
  type HyperliquidPrivyWallet,
  type HyperliquidScaleOrderCommandOptions,
  type HyperliquidServiceParams,
  type HyperliquidSetLeverageCommandOptions,
  type HyperliquidSignReplayCommandOptions,
  type HyperliquidSignReplayResult,
  HyperliquidSignReplayResultSchema,
  type HyperliquidSizingLockArmCollision,
  HyperliquidSizingLockArmCollisionSchema,
  type HyperliquidSpotAsset,
  HyperliquidSpotAssetSchema,
  type HyperliquidSpotAssetsResult,
  HyperliquidSpotAssetsResultSchema,
  HyperliquidSpotBalanceSchema,
  type HyperliquidSpotCancelOrderCommandOptions,
  type HyperliquidSpotScaleOrderCommandOptions,
  type HyperliquidSpotTradeCommandOptions,
  type HyperliquidSpotTransferCommandOptions,
  type HyperliquidSpotTwapCancelCommandOptions,
  type HyperliquidSpotTwapOrderCommandOptions,
  type HyperliquidTpSl,
  type HyperliquidTwapCancelCommandOptions,
  type HyperliquidTwapOrderCommandOptions,
  type HyperliquidUsdClassDirection,
  type HyperliquidUsdClassTransferCommandOptions,
  type HyperliquidUsdTransferCommandOptions,
  type HyperliquidUserFillWire,
  type HyperliquidWithdrawCommandOptions,
  type HyperliquidWithSignerParams,
  type PerpOrderTypeField,
  type PerpOrderWire,
  type ResolvedOrderAsset,
  type ResolvedPerpAsset,
  type ResolvedSpotAsset,
  type ResolveOrderPriceParams,
  type ResolveOrderTifParams,
  type ResolvePerpAssetParams,
  type ResolvePerpOrderTypeFieldParams,
  type ResolveWirePerpAssetIdParams,
  type ValidateTwapNotionalParams
} from '@/types/Hyperliquid'
import { type HexString } from '@/types/Lang'
import { type EthSignTypedData } from '@/types/Tx'
import { isNullish } from '@/utils/Lang'
import { findRoundTripPairs } from '@/utils/RoundTripPairs'

const ARBITRUM_USDC_DECIMALS = 6
const MIN_HYPERLIQUID_DEPOSIT_USDC = '5'
const HYPERLIQUID_ARBITRUM_CHAIN_ID = 42161
const HYPERLIQUID_BRIDGE_ADDRESS = '0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7'
const ARBITRUM_USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'
const HYPERLIQUID_MAINNET_SIGNATURE_CHAIN_ID = '0xa4b1'
const MIN_HYPERLIQUID_ORDER_NOTIONAL_USD = 10
const HYPERLIQUID_TWAP_INTERVAL_SECONDS = 30

/**
 * A bracket (tp/sl) order whose stop or target is inverted relative to the
 * SIDE and the RESOLVED entry price — e.g. a long with slPx >= entry, or a
 * short with slPx <= entry. The venue would accept this as-is (a long
 * stop above the entry only ever fires after a loss already exceeded), so
 * we refuse BEFORE sign + broadcast. Same guard family as the
 * entry-gate/sizing locks in the order path.
 */
export class BracketGuardError extends Error {
  constructor(side: 'long' | 'short', leg: 'slPx' | 'tpPx', entryPrice: string, legPx: string) {
    const isSl = leg === 'slPx'
    const expected = side === 'long' ? (isSl ? 'below' : 'above') : isSl ? 'above' : 'below'
    super(
      `UNSAFE_BRACKET: ${side} ${leg} ${legPx} is not ${expected} the resolved entry ${entryPrice} — ` +
        `an inverted bracket would ride the entry the venue fills. Refusing before sign/broadcast.`
    )
    this.name = 'BracketGuardError'
  }
}

// L2 order book snapshot via the info endpoint ({type: 'l2Book', coin}).
// https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint#l2-book-snapshot
export const HyperliquidOrderBookLevelSchema = z.object({
  px: z.string(),
  sz: z.string(),
  n: z.number().int()
})
export type HyperliquidOrderBookLevel = z.infer<typeof HyperliquidOrderBookLevelSchema>

export const HyperliquidOrderBookResultSchema = z.object({
  coin: z.string(),
  bids: z.array(HyperliquidOrderBookLevelSchema),
  asks: z.array(HyperliquidOrderBookLevelSchema)
})
export type HyperliquidOrderBookResult = z.infer<typeof HyperliquidOrderBookResultSchema>

export const HyperliquidOrderBookCommandOptionsSchema = z.object({
  coin: HyperliquidCoinSchema,
  depth: z.number().int().min(1).max(20).nullish(),
  dex: z.string().trim().min(1).nullish(),
  out: z.string().nullish()
})
export type HyperliquidOrderBookCommandOptions = z.infer<
  typeof HyperliquidOrderBookCommandOptionsSchema
>

export interface HyperliquidOrderBookParams {
  readonly coin: string
  readonly depth: number
  readonly dex: string | null | undefined
}

// When a candle call omits startTime, ask for this wide trailing window and let
// Hyperliquid return the most recent candle run (capped at a few thousand rows).
const HYPERLIQUID_CANDLE_DEFAULT_LOOKBACK_MS = 3650 * 24 * 60 * 60 * 1000

export class HyperliquidService {
  private readonly transaction: TransactionService

  private readonly infoClient: InfoClient

  private readonly entryGate: EntryGateService | null

  private readonly sizingLock: SizingLockService | null

  constructor(params: HyperliquidServiceParams) {
    this.infoClient = params.infoClient ?? new InfoClient({ transport: new HttpTransport() })
    this.transaction = params.transaction
    this.entryGate = params.entryGate ?? null
    this.sizingLock = params.sizingLock ?? null
  }

  async deposit(params: HyperliquidDepositParams): Promise<HyperliquidDepositResult> {
    const amountRaw = parseUnits(
      params.amount.toFixed(ARBITRUM_USDC_DECIMALS),
      ARBITRUM_USDC_DECIMALS
    )
    const minimumRaw = parseUnits(MIN_HYPERLIQUID_DEPOSIT_USDC, ARBITRUM_USDC_DECIMALS)
    if (amountRaw < minimumRaw) {
      throw new Error(
        `amount ${amountRaw} USDC is below Hyperliquid minimum of ` +
          `${MIN_HYPERLIQUID_DEPOSIT_USDC} USDC`
      )
    }

    const data = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [HYPERLIQUID_BRIDGE_ADDRESS, amountRaw]
    })
    const txHash = await this.transaction.sendEthTransaction({
      txData: {
        chainId: HYPERLIQUID_ARBITRUM_CHAIN_ID,
        to: ARBITRUM_USDC_ADDRESS,
        data,
        value: BigInt(0)
      },
      walletId: params.walletId
    })

    return HyperliquidDepositResultSchema.parse({
      type: 'hyperliquid-deposit-broadcast',
      from: params.from,
      txHash,
      plan: {
        chainId: HYPERLIQUID_ARBITRUM_CHAIN_ID,
        bridgeAddress: HYPERLIQUID_BRIDGE_ADDRESS,
        usdcAddress: ARBITRUM_USDC_ADDRESS,
        amountUsdc: params.amount,
        amountRaw,
        to: ARBITRUM_USDC_ADDRESS,
        data
      }
    })
  }

  async withdraw(
    params: HyperliquidWithSignerParams<HyperliquidWithdrawCommandOptions>
  ): Promise<Withdraw3SuccessResponse> {
    if (!params.request.amount.isGreaterThan(0)) {
      throw new Error('withdraw amount must be greater than 0')
    }

    const amount = params.request.amount.toFixed()
    const exchange = this.createExchangeClient({
      address: params.request.from,
      walletId: params.walletId
    })
    return await exchange.withdraw3({
      destination: params.request.destination,
      amount
    })
  }

  async transferUsdClass(
    params: HyperliquidWithSignerParams<HyperliquidUsdClassTransferCommandOptions>
  ): Promise<UsdClassTransferSuccessResponse> {
    if (!params.request.amount.isGreaterThan(0)) {
      throw new Error('transfer amount must be greater than 0')
    }

    const amount = params.request.amount.toFixed()
    const toPerp = this.directionToPerpFlag(params.request.direction)
    const exchange = this.createExchangeClient({
      address: params.request.from,
      walletId: params.walletId
    })
    return await exchange.usdClassTransfer({
      amount,
      toPerp
    })
  }

  async transferUsd(
    params: HyperliquidWithSignerParams<HyperliquidUsdTransferCommandOptions>
  ): Promise<UsdSendSuccessResponse> {
    if (!params.request.amount.isGreaterThan(0)) {
      throw new Error('transfer amount must be greater than 0')
    }
    if (params.request.from === params.request.destination) {
      throw new Error('destination must differ from sender')
    }

    const exchange = this.createExchangeClient({
      address: params.request.from,
      walletId: params.walletId
    })
    return await exchange.usdSend({
      destination: params.request.destination,
      amount: params.request.amount.toFixed()
    })
  }

  async transferSpot(
    params: HyperliquidWithSignerParams<HyperliquidSpotTransferCommandOptions>
  ): Promise<SpotSendSuccessResponse> {
    if (!params.request.amount.isGreaterThan(0)) {
      throw new Error('transfer amount must be greater than 0')
    }
    if (params.request.from === params.request.destination) {
      throw new Error('destination must differ from sender')
    }

    const exchange = this.createExchangeClient({
      address: params.request.from,
      walletId: params.walletId
    })
    return await exchange.spotSend({
      destination: params.request.destination,
      token: params.request.token,
      amount: params.request.amount.toFixed()
    })
  }

  async transferDexCash(
    params: HyperliquidWithSignerParams<HyperliquidDexCashTransferCommandOptions>
  ): Promise<SendAssetSuccessResponse> {
    if (!params.request.amount.isGreaterThan(0)) {
      throw new Error('transfer amount must be greater than 0')
    }

    const sourceDex = this.normalizeDex(params.request.sourceDex)
    const destinationDex = this.normalizeDex(params.request.destinationDex)
    if (sourceDex === destinationDex) {
      throw new Error('sourceDex and destinationDex must differ')
    }

    const exchange = this.createExchangeClient({
      address: params.request.from,
      walletId: params.walletId
    })
    return await exchange.sendAsset({
      destination: params.request.from,
      sourceDex,
      destinationDex,
      token: params.request.token,
      amount: params.request.amount.toFixed(),
      fromSubAccount: ''
    })
  }

  async setLeverage(
    params: HyperliquidWithSignerParams<HyperliquidSetLeverageCommandOptions>
  ): Promise<UpdateLeverageSuccessResponse> {
    const exchange = this.createExchangeClient({
      address: params.request.from,
      walletId: params.walletId
    })
    const dex = this.normalizeDex(params.request.dex)
    const perpAsset = await this.resolvePerpAsset({
      coin: params.request.coin,
      dex
    })
    const marginMode = this.resolveMarginMode({
      perpAsset,
      requestedMarginMode: params.request.marginMode
    })
    return await exchange.updateLeverage({
      asset: perpAsset.wireAsset,
      isCross: marginMode === 'cross',
      leverage: params.request.leverage
    })
  }

  async adjustMargin(
    params: HyperliquidWithSignerParams<HyperliquidAdjustMarginCommandOptions>
  ): Promise<UpdateIsolatedMarginSuccessResponse> {
    if (!params.request.amount.isGreaterThan(0)) {
      throw new Error('margin amount must be greater than 0')
    }

    const exchange = this.createExchangeClient({
      address: params.request.from,
      walletId: params.walletId
    })
    const dex = this.normalizeDex(params.request.dex)
    const perpAsset = await this.resolvePerpAsset({
      coin: params.request.coin,
      dex
    })
    const signedAmount =
      params.request.direction === 'remove'
        ? params.request.amount.negated()
        : params.request.amount
    const ntli = signedAmount.times(1_000_000).integerValue(BigNumber.ROUND_DOWN).toNumber()
    return await exchange.updateIsolatedMargin({
      asset: perpAsset.wireAsset,
      isBuy: params.request.side === 'long',
      ntli
    })
  }

  async tradePerp(
    params: HyperliquidWithSignerParams<HyperliquidPerpTradeCommandOptions>
  ): Promise<OrderSuccessResponse> {
    if (!params.request.amount.isGreaterThan(0)) {
      throw new Error('trade amount must be greater than 0')
    }

    const exchange = this.createExchangeClient({
      address: params.request.from,
      walletId: params.walletId
    })
    const dex = this.normalizeDex(params.request.dex)
    const perpAsset = await this.resolvePerpAsset({
      coin: params.request.coin,
      dex
    })
    this.assertPerpEntryAllowed({
      perpAsset,
      reduceOnly: params.request.reduceOnly
    })
    await this.assertEntryGateAllowed({
      dex,
      coin: params.request.coin,
      reduceOnly: params.request.reduceOnly
    })
    await this.assertSizingLockAllowed({
      dex,
      coin: params.request.coin,
      amount: params.request.amount,
      referencePrice: perpAsset.referencePrice,
      reduceOnly: params.request.reduceOnly
    })
    await this.assertNoUnauthorizedFlatten({
      address: params.request.from,
      dex,
      coin: params.request.coin,
      side: params.request.side,
      amount: params.request.amount,
      reduceOnly: params.request.reduceOnly
    })
    const marginMode = this.resolveMarginMode({
      perpAsset,
      requestedMarginMode: params.request.marginMode
    })

    if (!isNullish(params.request.leverage)) {
      await exchange
        .updateLeverage({
          asset: perpAsset.wireAsset,
          isCross: marginMode === 'cross',
          leverage: params.request.leverage
        })
        .catch((error: unknown) => {
          const msg = error instanceof Error ? error.message : String(error)
          if (!msg.includes('already') && !msg.includes('leverage')) throw error
        })
    }

    const orderParams = this.buildPerpOrderParams(params.request, perpAsset)
    return await exchange.order(orderParams)
  }

  /**
   * Instrumented single signing replay — NO broadcast, NO fund movement.
   *
   * Builds the exact perp order wire a close-shaped order would build (same
   * builder, same connectionId blob) and runs ONLY the signing half of the
   * shared path (SDK signL1Action → wallet.signTypedData →
   * TransactionService.signEthTypedDataV4 → terminal). On failure the FULL
   * unwrapped cause chain is returned so the real reason surfaces instead of
   * the SDK's opaque "Failed to sign typed data with viem wallet" wrapper.
   */
  async signReplay(
    params: HyperliquidWithSignerParams<HyperliquidSignReplayCommandOptions>
  ): Promise<HyperliquidSignReplayResult> {
    const wallet = this.createPrivyWallet({
      address: params.request.from,
      walletId: params.walletId
    })
    const nonce = Date.now()
    const timestamp = Date.now()

    try {
      const dex = this.normalizeDex(params.request.dex)
      const perpAsset = await this.resolvePerpAsset({
        coin: params.request.coin,
        dex
      })
      const orderParams = this.buildPerpOrderParams(params.request, perpAsset)
      const order = orderParams.orders[0]
      if (isNullish(order)) {
        throw new Error('sign-replay: no order leg produced to sign')
      }
      const signature = await signL1Action({ wallet, action: order, nonce })
      return HyperliquidSignReplayResultSchema.parse({
        kind: 'sign-replay',
        broadcast: false,
        coin: params.request.coin,
        side: params.request.side,
        nonce,
        timestamp,
        ok: true,
        signature
      })
    } catch (error) {
      return HyperliquidSignReplayResultSchema.parse({
        kind: 'sign-replay',
        broadcast: false,
        coin: params.request.coin,
        side: params.request.side,
        nonce,
        timestamp,
        ok: false,
        error: unwrapCause(error)
      })
    }
  }

  private buildPerpOrderParams(
    request: HyperliquidPerpTradeCommandOptions,
    perpAsset: ResolvedPerpAsset
  ): OrderParameters {
    const isBuy = request.side === 'long'
    const size = formatSize(request.amount.toFixed(), perpAsset.szDecimals)
    const isBracket = !isNullish(request.tpPx) || !isNullish(request.slPx)

    if (!isBracket) {
      const orderPrice = this.resolveOrderPrice({
        marketType: 'perp',
        orderType: request.type,
        limitPrice: request.price,
        triggerPx: request.triggerPx,
        szDecimals: perpAsset.szDecimals,
        referencePrice: perpAsset.referencePrice,
        isBuy
      })
      return {
        orders: [
          {
            a: perpAsset.wireAsset,
            b: isBuy,
            p: orderPrice,
            s: size,
            r: request.reduceOnly,
            t: this.resolvePerpOrderTypeField({
              orderType: request.type,
              tif: request.tif,
              triggerPx: request.triggerPx,
              szDecimals: perpAsset.szDecimals
            }),
            ...(isNullish(request.cloid) ? {} : { c: request.cloid })
          }
        ],
        grouping: 'na'
      }
    }

    const exitIsBuy = !isBuy
    const entryPrice = this.resolveOrderPrice({
      marketType: 'perp',
      orderType: request.type,
      limitPrice: request.price,
      triggerPx: null,
      szDecimals: perpAsset.szDecimals,
      referencePrice: perpAsset.referencePrice,
      isBuy
    })
    const orders: PerpOrderWire[] = [
      {
        a: perpAsset.wireAsset,
        b: isBuy,
        p: entryPrice,
        s: size,
        r: false,
        t: { limit: { tif: request.type === 'market' ? 'Ioc' : 'Gtc' } },
        ...(isNullish(request.cloid) ? {} : { c: request.cloid })
      }
    ]

    // Bracket side-guard: the stop/target must sit on the correct side of the
    // RESOLVED entry the entry leg rides (not the raw ticket number — kills the
    // stale-ref/slippage class too). Equality is not protection: refuse.
    if (!isNullish(request.slPx) && !isNullish(request.tpPx)) {
      this.assertSafeBracket(isBuy, entryPrice, request.slPx, 'slPx')
      this.assertSafeBracket(isBuy, entryPrice, request.tpPx, 'tpPx')
    } else if (!isNullish(request.slPx)) {
      this.assertSafeBracket(isBuy, entryPrice, request.slPx, 'slPx')
    } else if (!isNullish(request.tpPx)) {
      this.assertSafeBracket(isBuy, entryPrice, request.tpPx, 'tpPx')
    }

    if (!isNullish(request.tpPx)) {
      orders.push(
        this.buildBracketExitLeg({
          orderType: isNullish(request.tpLimitPx) ? 'take_market' : 'take_limit',
          triggerPx: request.tpPx,
          limitPx: request.tpLimitPx,
          exitIsBuy,
          perpAsset,
          size,
          cloid: request.cloid ?? undefined
        })
      )
    }

    if (!isNullish(request.slPx)) {
      orders.push(
        this.buildBracketExitLeg({
          orderType: isNullish(request.slLimitPx) ? 'stop_market' : 'stop_limit',
          triggerPx: request.slPx,
          limitPx: request.slLimitPx,
          exitIsBuy,
          perpAsset,
          size,
          cloid: request.cloid ?? undefined
        })
      )
    }

    return { orders, grouping: 'normalTpsl' }
  }

  /**
   * Bracket side-guard: refuse an inverted stop/target before it reaches the
   * venue. Long: sl < entry < tp. Short: sl > entry > tp. Equality is not
   * protection — equal-to-entry is rejected the same as inverted. The
   * comparison runs against the RESOLVED entry the entry leg rides, so a
   * stale/off-band slip reference is caught too.
   */
  private assertSafeBracket(
    isBuy: boolean,
    entryPrice: string,
    legPx: BigNumber,
    leg: 'slPx' | 'tpPx'
  ): void {
    const entry = new BigNumber(entryPrice)
    const px = legPx
    const isSl = leg === 'slPx'
    // Long: stop below entry, target above. Short: mirrored.
    const invalidForLong = isSl ? !px.isLessThan(entry) : !px.isGreaterThan(entry)
    const invalidForShort = isSl ? !px.isGreaterThan(entry) : !px.isLessThan(entry)
    const invalid = isBuy ? invalidForLong : invalidForShort
    if (invalid) {
      throw new BracketGuardError(isBuy ? 'long' : 'short', leg, entry.toFixed(), px.toFixed())
    }
  }

  /**
   * SL RE-ANCHOR TO ACTUAL FILL (Chief's fill-slip class).
   *
   * A limit entry can fill at a price different from the intended band (a long
   * limit fills at or below the band when the market moves through it). The SL
   * was anchored to the intended band, so a fill below the band can leave the
   * SL ABOVE the actual fill — inverted relative to the real position, and it
   * triggers instantly. This recomputes the SL relative to the ACTUAL fill:
   *
   * - long:  re-anchoredSL = actualFill - slDistance (preserves the risk
   *   distance from the intended band).
   * - short: re-anchoredSL = actualFill + slDistance.
   *
   * If the fill already gapped THROUGH the intended SL (long: fill <= slPx —
   * the stop line was crossed before/at the fill; short: fill >= slPx), no
   * safe re-anchor exists at the intended risk distance — the ticket must be
   * REJECTED + re-staged, never broadcast an inverted stop. Equality is also
   * not protection.
   *
   * Returns the re-anchored trigger (string) or throws BracketGuardError.
   * Pure computation — read-only, never broadcasts, never cancels.
   */
  reanchorBracketStop(params: {
    side: 'long' | 'short'
    entryRef: string
    slPx: BigNumber
    actualFillPx: BigNumber
  }): string {
    const entry = new BigNumber(params.entryRef)
    const sl = params.slPx
    const fill = params.actualFillPx
    if (!fill.isFinite() || !fill.isGreaterThan(0)) {
      throw new BracketGuardError(params.side, 'slPx', fill.toFixed(), 'invalid fill')
    }

    // The intended risk distance (band-to-stop), always positive. For a long
    // the SL sits below the intended band (entry - sl); for a short it sits
    // above (sl - entry).
    const distance = params.side === 'long' ? entry.minus(sl) : sl.minus(entry)
    if (distance.lte(0)) {
      // The direction guard should already have caught this; belt-and-braces.
      throw new BracketGuardError(params.side, 'slPx', entry.toFixed(), sl.toFixed())
    }

    if (params.side === 'long') {
      // Fill slipped BELOW the intended SL -> the SL would sit above the fill.
      if (fill.isLessThan(sl)) {
        throw new BracketGuardError(
          'long',
          'slPx',
          sl.toFixed(),
          `fill ${fill.toFixed()} slipped through the stop — reject + re-stage`
        )
      }
      return new BigNumber(fill).minus(distance).toFixed()
    }
    // short: fill gapped ABOVE the intended stop -> the SL would sit below fill.
    if (fill.isGreaterThan(sl)) {
      throw new BracketGuardError(
        'short',
        'slPx',
        sl.toFixed(),
        `fill ${fill.toFixed()} gapped through the stop — reject + re-stage`
      )
    }
    return new BigNumber(fill).plus(distance).toFixed()
  }

  private buildScaleOrderParams(params: BuildScaleOrdersParams): OrderParameters {
    const { asset, marketType } = params
    const legCount = params.orders
    const priceSpan = params.endPx.minus(params.startPx)
    const sizeSkew = new BigNumber(params.sizeSkew)
    const minNotional = new BigNumber(MIN_HYPERLIQUID_ORDER_NOTIONAL_USD)

    const weights: BigNumber[] = []
    for (let i = 0; i < legCount; i++) {
      const progress = new BigNumber(i).dividedBy(legCount - 1)
      weights.push(new BigNumber(1).plus(sizeSkew.minus(1).multipliedBy(progress)))
    }
    const weightSum = weights.reduce((sum, weight) => sum.plus(weight), new BigNumber(0))

    const orders: PerpOrderWire[] = []
    let smallestNotional: BigNumber | null = null
    let smallestLegIndex = 0

    for (let i = 0; i < legCount; i++) {
      const progress = new BigNumber(i).dividedBy(legCount - 1)
      const price = params.startPx.plus(priceSpan.multipliedBy(progress))
      const weight = weights[i]
      if (isNullish(weight)) {
        throw new Error(`missing scale weight for leg ${i + 1}`)
      }
      const size = params.amount.multipliedBy(weight).dividedBy(weightSum)
      const notional = size.multipliedBy(price)

      if (smallestNotional === null || notional.isLessThan(smallestNotional)) {
        smallestNotional = notional
        smallestLegIndex = i
      }

      orders.push({
        a: asset.assetId,
        b: params.isBuy,
        p: formatPrice(price.toFixed(), asset.szDecimals, marketType),
        s: formatSize(size.toFixed(), asset.szDecimals),
        r: params.reduceOnly,
        t: { limit: { tif: params.tif } }
      })
    }

    if (smallestNotional !== null && smallestNotional.isLessThan(minNotional)) {
      throw new Error(
        `scale leg ${smallestLegIndex + 1} notional ~$${smallestNotional.toFixed(2)} is below Hyperliquid's ` +
          `$${MIN_HYPERLIQUID_ORDER_NOTIONAL_USD} minimum per order. Increase --amount or reduce --orders.`
      )
    }

    return { orders, grouping: 'na' }
  }

  private validateTwapNotional(params: ValidateTwapNotionalParams): void {
    const sliceCount = (params.durationMinutes * 60) / HYPERLIQUID_TWAP_INTERVAL_SECONDS
    const sliceSize = params.amount.dividedBy(sliceCount)
    const sliceNotional = sliceSize.multipliedBy(params.asset.referencePrice)
    if (sliceNotional.isLessThan(MIN_HYPERLIQUID_ORDER_NOTIONAL_USD)) {
      const minTotalSize = params.asset.referencePrice.isGreaterThan(0)
        ? new BigNumber(MIN_HYPERLIQUID_ORDER_NOTIONAL_USD)
            .multipliedBy(sliceCount)
            .dividedBy(params.asset.referencePrice)
        : new BigNumber(0)
      throw new Error(
        `twap sub-order notional ~$${sliceNotional.toFixed(2)} is below Hyperliquid's ` +
          `$${MIN_HYPERLIQUID_ORDER_NOTIONAL_USD} minimum per order. A ${params.durationMinutes}-minute ` +
          `twap is split into ${sliceCount} sub-orders (one every ${HYPERLIQUID_TWAP_INTERVAL_SECONDS}s). ` +
          `Increase --amount to at least ${minTotalSize.toFixed(params.asset.szDecimals)} ` +
          `(~$${new BigNumber(MIN_HYPERLIQUID_ORDER_NOTIONAL_USD).multipliedBy(sliceCount).toFixed(2)} notional) ` +
          `or reduce --duration-minutes.`
      )
    }
  }

  private buildTwapWire(params: BuildTwapWireParams): {
    a: number
    b: boolean
    s: string
    r: boolean
    m: number
    t: boolean
  } {
    return {
      a: params.asset.assetId,
      b: params.isBuy,
      s: formatSize(params.amount.toFixed(), params.asset.szDecimals),
      r: params.reduceOnly,
      m: params.durationMinutes,
      t: params.randomize
    }
  }

  private toOrderAssetFromPerp(perpAsset: ResolvedPerpAsset): ResolvedOrderAsset {
    return {
      assetId: perpAsset.wireAsset,
      referencePrice: perpAsset.referencePrice,
      szDecimals: perpAsset.szDecimals
    }
  }

  private toOrderAssetFromSpot(spotAsset: ResolvedSpotAsset): ResolvedOrderAsset {
    return {
      assetId: spotAsset.assetId,
      referencePrice: spotAsset.referencePrice,
      szDecimals: spotAsset.szDecimals
    }
  }

  private async maybeUpdateLeverage(params: {
    exchange: ExchangeClient
    wireAsset: number
    marginMode: 'cross' | 'isolated'
    leverage: number | null | undefined
  }): Promise<void> {
    if (isNullish(params.leverage)) return

    await params.exchange
      .updateLeverage({
        asset: params.wireAsset,
        isCross: params.marginMode === 'cross',
        leverage: params.leverage
      })
      .catch((error: unknown) => {
        const msg = error instanceof Error ? error.message : String(error)
        if (!msg.includes('already') && !msg.includes('leverage')) throw error
      })
  }

  private assertPerpEntryAllowed(params: {
    perpAsset: ResolvedPerpAsset
    reduceOnly: boolean
  }): void {
    if (params.perpAsset.isDelisted && !params.reduceOnly) {
      throw new Error('cannot open or increase a delisted perpetual market')
    }
  }

  /**
   * Entry-trigger gate (the gate-guard): refuse ANY position-INCREASING order
   * for a coin whose gate is not trigger_fired within TTL, BEFORE any sign or
   * broadcast (no fill, no state change). Reduce-only exits and cancels are
   * never blocked. Missing gate state defaults to stand_by = refuse.
   */
  private async assertEntryGateAllowed(params: {
    dex: string
    coin: string
    reduceOnly: boolean
  }): Promise<void> {
    if (params.reduceOnly) return
    if (isNullish(this.entryGate)) return
    const decision = await this.entryGate.isEntryAllowed(params.dex, params.coin)
    if (!decision.allowed) {
      const dexName = params.dex.length > 0 ? params.dex : 'main'
      throw new Error(
        `entry trigger gate: ${decision.reason} for ${params.coin} on ${dexName} — ` +
          `position-increasing order refused before broadcast. Run ` +
          `hyperliquid entry-gate status --coin ${params.coin} to inspect.`
      )
    }
  }

  /**
   * Sizing-lock: refuse a position-INCREASING order whose notional is not
   * locked to the operative package manifest (no manifest, no coin entry,
   * off-lock beyond ±2%, or superseded manifest), BEFORE any sign/broadcast.
   */
  private async assertSizingLockAllowed(params: {
    dex: string
    coin: string
    amount: BigNumber
    referencePrice: BigNumber
    reduceOnly: boolean
  }): Promise<void> {
    if (params.reduceOnly) return
    if (isNullish(this.sizingLock)) return
    const decision = await this.sizingLock.isEntrySizeAllowed({
      dex: params.dex,
      coin: params.coin,
      amount: params.amount,
      referencePrice: params.referencePrice
    })
    if (!decision.allowed) {
      const dexName = params.dex.length > 0 ? params.dex : 'main'
      throw new Error(
        `sizing lock: ${decision.reason} for ${params.coin} on ${dexName} — ` +
          `position-increasing order refused before broadcast. Run ` +
          `hyperliquid sizing-lock status --coin ${params.coin} to inspect.`
      )
    }
  }

  /**
   * ORDER-PATH FLATTEN GUARD (the same arm-collision discipline on the
   * broadcast side): an armed-bracketed live position is not flattened /
   * re-placed without the user's explicit directive through Chief. Refuses a
   * position-DECREASING or reversing perp order (a reduce-only close, or an
   * opposite-side order that would net the position) when: (a) the coin has a
   * LIVE position on the venue, and (b) no active user-directive override is
   * journaled (sizing-lock override registry). Reduce-only exits that fully
   * close a position in exactly the user's intended direction may pass when a
   * directive exists; otherwise default-refuse.
   */
  private async assertNoUnauthorizedFlatten(params: {
    address: HexString
    dex: string
    coin: string
    side: 'long' | 'short'
    amount: BigNumber
    reduceOnly: boolean
  }): Promise<void> {
    if (!params.reduceOnly) return
    if (isNullish(this.sizingLock)) return
    const positions = await this.listPositions({
      address: params.address,
      dex: params.dex,
      allDexes: false
    })
    const pos = positions.positions.find((p) => p.coin === params.coin.toUpperCase())
    if (isNullish(pos)) return // no live position -> nothing to flatten
    // A reduce-only order in the SAME direction as the position cannot flatten
    // it (it reduces; it does not close the wrong way).
    const orderFlattens =
      (pos.side === 'long' && params.side === 'short') ||
      (pos.side === 'short' && params.side === 'long')
    if (!orderFlattens) return
    const directive = await this.sizingLock.hasActiveFlattenDirective(params.dex, params.coin)
    if (directive) return
    throw new Error(
      `flatten guard: ${params.coin} has a LIVE ${pos.side} position; a closing / otherwise ` +
        `re-placing ${params.side} reduce-only order would flatten it WITHOUT a user directive ` +
        `through Chief (COIN rule). An armed-bracketed live position is not flattened. ` +
        `Get the directive journaled (sizing-lock override by chief/exec-lead) first.`
    )
  }

  private resolveMarginMode(params: {
    perpAsset: ResolvedPerpAsset
    requestedMarginMode: 'cross' | 'isolated'
  }): 'cross' | 'isolated' {
    return params.perpAsset.requiresIsolatedMargin ? 'isolated' : params.requestedMarginMode
  }

  async twapPerp(
    params: HyperliquidWithSignerParams<HyperliquidTwapOrderCommandOptions>
  ): Promise<TwapOrderSuccessResponse> {
    if (!params.request.amount.isGreaterThan(0)) {
      throw new Error('twap amount must be greater than 0')
    }

    const exchange = this.createExchangeClient({
      address: params.request.from,
      walletId: params.walletId
    })
    const dex = this.normalizeDex(params.request.dex)
    const perpAsset = await this.resolvePerpAsset({
      coin: params.request.coin,
      dex
    })
    this.assertPerpEntryAllowed({
      perpAsset,
      reduceOnly: params.request.reduceOnly
    })
    await this.assertEntryGateAllowed({
      dex,
      coin: params.request.coin,
      reduceOnly: params.request.reduceOnly
    })
    await this.assertSizingLockAllowed({
      dex,
      coin: params.request.coin,
      amount: params.request.amount,
      referencePrice: perpAsset.referencePrice,
      reduceOnly: params.request.reduceOnly
    })
    await this.assertNoUnauthorizedFlatten({
      address: params.request.from,
      dex,
      coin: params.request.coin,
      side: params.request.side,
      amount: params.request.amount,
      reduceOnly: params.request.reduceOnly
    })
    const asset = this.toOrderAssetFromPerp(perpAsset)

    this.validateTwapNotional({
      asset,
      amount: params.request.amount,
      durationMinutes: params.request.durationMinutes
    })

    await this.maybeUpdateLeverage({
      exchange,
      wireAsset: perpAsset.wireAsset,
      marginMode: this.resolveMarginMode({
        perpAsset,
        requestedMarginMode: params.request.marginMode
      }),
      leverage: params.request.leverage
    })

    return await exchange.twapOrder({
      twap: this.buildTwapWire({
        asset,
        amount: params.request.amount,
        isBuy: params.request.side === 'long',
        durationMinutes: params.request.durationMinutes,
        randomize: params.request.randomize,
        reduceOnly: params.request.reduceOnly
      })
    })
  }

  async twapSpot(
    params: HyperliquidWithSignerParams<HyperliquidSpotTwapOrderCommandOptions>
  ): Promise<TwapOrderSuccessResponse> {
    if (!params.request.amount.isGreaterThan(0)) {
      throw new Error('twap amount must be greater than 0')
    }

    const exchange = this.createExchangeClient({
      address: params.request.from,
      walletId: params.walletId
    })
    const spotAsset = await this.resolveSpotAsset(params.request.pair)
    const asset = this.toOrderAssetFromSpot(spotAsset)

    this.validateTwapNotional({
      asset,
      amount: params.request.amount,
      durationMinutes: params.request.durationMinutes
    })

    return await exchange.twapOrder({
      twap: this.buildTwapWire({
        asset,
        amount: params.request.amount,
        isBuy: params.request.side === 'buy',
        durationMinutes: params.request.durationMinutes,
        randomize: params.request.randomize,
        reduceOnly: false
      })
    })
  }

  async twapCancel(
    params: HyperliquidWithSignerParams<HyperliquidTwapCancelCommandOptions>
  ): Promise<TwapCancelSuccessResponse> {
    const exchange = this.createExchangeClient({
      address: params.request.from,
      walletId: params.walletId
    })
    const dex = this.normalizeDex(params.request.dex)
    const perpAsset = await this.resolvePerpAsset({
      coin: params.request.coin,
      dex
    })

    return await exchange.twapCancel({
      a: perpAsset.wireAsset,
      t: params.request.twapId
    })
  }

  async twapCancelSpot(
    params: HyperliquidWithSignerParams<HyperliquidSpotTwapCancelCommandOptions>
  ): Promise<TwapCancelSuccessResponse> {
    const exchange = this.createExchangeClient({
      address: params.request.from,
      walletId: params.walletId
    })
    const spotAsset = await this.resolveSpotAsset(params.request.pair)

    return await exchange.twapCancel({
      a: spotAsset.assetId,
      t: params.request.twapId
    })
  }

  async cancelOrder(
    params: HyperliquidWithSignerParams<HyperliquidCancelOrderCommandOptions>
  ): Promise<CancelSuccessResponse> {
    const exchange = this.createExchangeClient({
      address: params.request.from,
      walletId: params.walletId
    })
    const dex = this.normalizeDex(params.request.dex)
    const perpAsset = await this.resolvePerpAsset({
      coin: params.request.coin,
      dex
    })

    return await exchange.cancel({
      cancels: [{ a: perpAsset.wireAsset, o: params.request.orderId }]
    })
  }

  async cancelOrderSpot(
    params: HyperliquidWithSignerParams<HyperliquidSpotCancelOrderCommandOptions>
  ): Promise<CancelSuccessResponse> {
    const exchange = this.createExchangeClient({
      address: params.request.from,
      walletId: params.walletId
    })
    const spotAsset = await this.resolveSpotAsset(params.request.pair)

    return await exchange.cancel({
      cancels: [{ a: spotAsset.assetId, o: params.request.orderId }]
    })
  }

  async scalePerp(
    params: HyperliquidWithSignerParams<HyperliquidScaleOrderCommandOptions>
  ): Promise<OrderSuccessResponse> {
    if (!params.request.amount.isGreaterThan(0)) {
      throw new Error('scale amount must be greater than 0')
    }

    const exchange = this.createExchangeClient({
      address: params.request.from,
      walletId: params.walletId
    })
    const dex = this.normalizeDex(params.request.dex)
    const perpAsset = await this.resolvePerpAsset({
      coin: params.request.coin,
      dex
    })
    this.assertPerpEntryAllowed({
      perpAsset,
      reduceOnly: params.request.reduceOnly
    })
    await this.assertEntryGateAllowed({
      dex,
      coin: params.request.coin,
      reduceOnly: params.request.reduceOnly
    })
    await this.assertSizingLockAllowed({
      dex,
      coin: params.request.coin,
      amount: params.request.amount,
      referencePrice: perpAsset.referencePrice,
      reduceOnly: params.request.reduceOnly
    })

    await this.maybeUpdateLeverage({
      exchange,
      wireAsset: perpAsset.wireAsset,
      marginMode: this.resolveMarginMode({
        perpAsset,
        requestedMarginMode: params.request.marginMode
      }),
      leverage: params.request.leverage
    })

    const orderParams = this.buildScaleOrderParams({
      asset: this.toOrderAssetFromPerp(perpAsset),
      marketType: 'perp',
      amount: params.request.amount,
      isBuy: params.request.side === 'long',
      startPx: params.request.startPx,
      endPx: params.request.endPx,
      orders: params.request.orders,
      sizeSkew: params.request.sizeSkew,
      tif: params.request.tif,
      reduceOnly: params.request.reduceOnly
    })
    return await exchange.order(orderParams)
  }

  async scaleSpot(
    params: HyperliquidWithSignerParams<HyperliquidSpotScaleOrderCommandOptions>
  ): Promise<OrderSuccessResponse> {
    if (!params.request.amount.isGreaterThan(0)) {
      throw new Error('scale amount must be greater than 0')
    }

    const exchange = this.createExchangeClient({
      address: params.request.from,
      walletId: params.walletId
    })
    const spotAsset = await this.resolveSpotAsset(params.request.pair)

    const orderParams = this.buildScaleOrderParams({
      asset: this.toOrderAssetFromSpot(spotAsset),
      marketType: 'spot',
      amount: params.request.amount,
      isBuy: params.request.side === 'buy',
      startPx: params.request.startPx,
      endPx: params.request.endPx,
      orders: params.request.orders,
      sizeSkew: params.request.sizeSkew,
      tif: params.request.tif,
      reduceOnly: false
    })
    return await exchange.order(orderParams)
  }

  async tradeSpot(
    params: HyperliquidWithSignerParams<HyperliquidSpotTradeCommandOptions>
  ): Promise<OrderSuccessResponse> {
    if (!params.request.amount.isGreaterThan(0)) {
      throw new Error('trade amount must be greater than 0')
    }

    const exchange = this.createExchangeClient({
      address: params.request.from,
      walletId: params.walletId
    })
    const spotAsset = await this.resolveSpotAsset(params.request.pair)
    const isBuy = params.request.side === 'buy'
    const orderPrice = this.resolveOrderPrice({
      marketType: 'spot',
      orderType: params.request.type,
      limitPrice: params.request.price,
      szDecimals: spotAsset.szDecimals,
      referencePrice: spotAsset.referencePrice,
      isBuy
    })
    const orderParams: OrderParameters = {
      orders: [
        {
          a: spotAsset.assetId,
          b: isBuy,
          p: orderPrice,
          s: formatSize(params.request.amount.toFixed(), spotAsset.szDecimals),
          r: false,
          t: {
            limit: {
              tif: this.resolveOrderTif({ orderType: params.request.type, tif: params.request.tif })
            }
          },
          ...(isNullish(params.request.cloid) ? {} : { c: params.request.cloid })
        }
      ],
      grouping: 'na'
    }
    return await exchange.order(orderParams)
  }

  async listBalances(params: HyperliquidListBalancesParams): Promise<HyperliquidBalancesResult> {
    const normalizedDex = this.normalizeDex(params.dex)
    const perpParams: HyperliquidInfoUserDexParams = { user: params.address }
    if (normalizedDex.length > 0) perpParams.dex = normalizedDex

    const [perpState, spotState] = await Promise.all([
      retryProviderAware({ fn: () => this.infoClient.clearinghouseState(perpParams) }),
      retryProviderAware({
        fn: () => this.infoClient.spotClearinghouseState({ user: params.address })
      })
    ])

    const spot = spotState.balances.map((balance) =>
      HyperliquidSpotBalanceSchema.parse({
        coin: balance.coin,
        token: balance.token,
        total: balance.total,
        hold: balance.hold,
        available: new BigNumber(balance.total).minus(balance.hold).toFixed()
      })
    )

    return HyperliquidBalancesResultSchema.parse({
      address: params.address,
      dex: normalizedDex.length > 0 ? normalizedDex : 'main',
      perp: {
        accountValue: perpState.marginSummary.accountValue,
        withdrawable: perpState.withdrawable,
        totalMarginUsed: perpState.marginSummary.totalMarginUsed,
        totalNtlPos: perpState.marginSummary.totalNtlPos
      },
      spot
    })
  }

  async listPositions(params: HyperliquidListPositionsParams): Promise<HyperliquidPositionsResult> {
    const dexNames = params.allDexes
      ? await this.resolveAllDexNames()
      : [this.normalizeDex(params.dex)]
    const selectedDexes = new Set(dexNames.map((dexName) => this.formatDexName(dexName)))

    const [states, twapHistory] = await Promise.all([
      Promise.all(
        dexNames.map(async (dexName) => {
          const stateParams: HyperliquidInfoUserDexParams = { user: params.address }
          if (dexName.length > 0) stateParams.dex = dexName
          const state = await retryProviderAware({
            fn: () => this.infoClient.clearinghouseState(stateParams)
          })
          return { dexName, state }
        })
      ),
      retryProviderAware({ fn: () => this.infoClient.twapHistory({ user: params.address }) })
    ])

    const positions: HyperliquidPerpPosition[] = []
    for (const { dexName, state } of states) {
      const formattedDexName = this.formatDexName(dexName)
      for (const assetPosition of state.assetPositions) {
        const position = assetPosition.position
        const szi = new BigNumber(position.szi)
        if (szi.isZero()) continue
        positions.push(
          HyperliquidPerpPositionSchema.parse({
            dex: formattedDexName,
            coin: position.coin,
            side: szi.isGreaterThan(0) ? 'long' : 'short',
            size: szi.abs().toFixed(),
            signedSize: position.szi,
            entryPx: position.entryPx,
            positionValue: position.positionValue,
            unrealizedPnl: position.unrealizedPnl,
            returnOnEquity: position.returnOnEquity,
            liquidationPx: position.liquidationPx,
            leverage: position.leverage.value,
            leverageType: position.leverage.type,
            marginUsed: position.marginUsed,
            maxLeverage: position.maxLeverage
          })
        )
      }
    }

    const latestTwapById = new Map<number, (typeof twapHistory)[number]>()
    for (const twap of twapHistory) {
      if (isNullish(twap.twapId)) continue
      const existing = latestTwapById.get(twap.twapId)
      if (isNullish(existing) || twap.time > existing.time) latestTwapById.set(twap.twapId, twap)
    }

    const twapOrders: HyperliquidPerpTwapOrder[] = []
    for (const twap of latestTwapById.values()) {
      if (twap.status.status !== 'activated') continue

      const { dex, coin } = this.resolveDexAndCoin(twap.state.coin)
      if (!params.allDexes && !selectedDexes.has(dex)) continue

      const totalSize = new BigNumber(twap.state.sz)
      const executedSize = new BigNumber(twap.state.executedSz)
      const remainingSize = BigNumber.maximum(totalSize.minus(executedSize), new BigNumber(0))

      twapOrders.push(
        HyperliquidPerpTwapOrderSchema.parse({
          dex,
          coin,
          side: twap.state.side === 'B' ? 'long' : 'short',
          size: twap.state.sz,
          executedSize: twap.state.executedSz,
          remainingSize: remainingSize.toFixed(),
          executedNotional: twap.state.executedNtl,
          durationMinutes: twap.state.minutes,
          randomize: twap.state.randomize,
          reduceOnly: twap.state.reduceOnly,
          startedAt: twap.state.timestamp,
          createdAtSeconds: twap.time,
          twapId: twap.twapId
        })
      )
    }

    return HyperliquidPositionsResultSchema.parse({
      address: params.address,
      positions,
      twapOrders
    })
  }

  async listOpenOrders(
    params: HyperliquidListOpenOrdersParams
  ): Promise<HyperliquidOpenOrdersResult> {
    const dexNames = params.allDexes
      ? await this.resolveAllDexNames()
      : [this.normalizeDex(params.dex)]

    const orderSets = await Promise.all(
      dexNames.map(async (dexName) => {
        const requestParams: HyperliquidInfoUserDexParams = { user: params.address }
        if (dexName.length > 0) requestParams.dex = dexName
        const orders = await retryProviderAware({
          fn: () => this.infoClient.frontendOpenOrders(requestParams)
        })
        return { dexName, orders }
      })
    )

    const spotPairByCoin = await this.buildSpotPairNamesByCoin()
    const openOrders: HyperliquidOpenOrder[] = []
    for (const { dexName, orders } of orderSets) {
      for (const order of orders) {
        openOrders.push(this.mapFrontendOpenOrder(order, dexName, spotPairByCoin))
      }
    }

    return HyperliquidOpenOrdersResultSchema.parse({
      address: params.address,
      orders: openOrders
    })
  }

  async listFills(params: HyperliquidListFillsParams): Promise<HyperliquidFillsResult> {
    let fills: HyperliquidUserFillWire[]
    if (isNullish(params.startTime)) {
      fills = await retryProviderAware({
        fn: () =>
          this.infoClient.userFills({
            user: params.address,
            aggregateByTime: params.aggregateByTime
          })
      })
    } else {
      const startTime = params.startTime
      const endTime = params.endTime ?? undefined
      fills = await retryProviderAware({
        fn: () =>
          this.infoClient.userFillsByTime({
            user: params.address,
            startTime,
            endTime,
            aggregateByTime: params.aggregateByTime,
            reversed: params.reversed
          })
      })
    }

    const spotPairByCoin = await this.buildSpotPairNamesByCoin()

    return HyperliquidFillsResultSchema.parse({
      address: params.address,
      fills: fills.map((fill) => this.mapUserFill(fill, spotPairByCoin))
    })
  }

  /**
   * Round-trip pair detector over a fills window: identical-size buy/sell legs
   * close together are an open+immediate-flatten that clearing nets to ZERO
   * position. The fills feed reports both legs honestly; the desk must not
   * re-fire into this class expecting exposure. Read-only — no cancel/refire.
   */
  async detectRoundTripPairs(params: {
    address: HexString
    startTime?: number
    endTime?: number
    windowMs?: number
  }): Promise<HyperliquidFillPairsResult> {
    const fillsResult = await this.listFills({
      address: params.address,
      startTime: params.startTime,
      endTime: params.endTime,
      aggregateByTime: true,
      reversed: false
    })
    const pairs = findRoundTripPairs(fillsResult.fills, params.windowMs ?? 1000)
    return HyperliquidFillPairsResultSchema.parse({
      address: params.address,
      pairs
    })
  }

  /**
   * Post-fill position read-guard: a fill ack is not "live" until the position
   * actually exists. Reads the fills window AND list-positions; if fills show a
   * coin but the position is flat, emits `fills-without-position` with the
   * paired-leg evidence (net-zero round-trip, not a dropped fill). Read-only —
   * never cancels, never re-fires, never throws on a legit flat (reduce-only /
   * stopped-out closes are flat by design).
   */
  async verifyPostFillPosition(params: {
    address: HexString
    coin: string
    dex?: string | null
    windowMs?: number
    startTime?: number
    side?: 'long' | 'short'
    slPx?: BigNumber | null
    tpPx?: BigNumber | null
    entryRef?: BigNumber | null
  }): Promise<HyperliquidPostFillGuardResult> {
    const normalizedDex = this.formatDexName(this.normalizeDex(params.dex))
    const positions = await this.listPositions({
      address: params.address,
      dex: normalizedDex,
      allDexes: false
    })
    const normalizedCoin = params.coin.trim().toUpperCase()
    const position = positions.positions.find((p) => p.coin === normalizedCoin) ?? null
    if (position !== null) {
      // SL re-anchor to ACTUAL fill: the position's entryPx is the fill price.
      // When a bracket was placed, re-anchor the stop relative to the real
      // entry — if the fill slipped through the intended stop, the SL would be
      // inverted; surface a reject + re-stage verdict instead of trusting it.
      if (params.side !== undefined && params.slPx !== undefined && params.slPx !== null) {
        const fill = new BigNumber(position.entryPx)
        const intended = params.entryRef ?? fill
        try {
          const reanchored = this.reanchorBracketStop({
            side: params.side,
            entryRef: intended.toFixed(),
            slPx: params.slPx,
            actualFillPx: fill
          })
          return HyperliquidPostFillGuardResultSchema.parse({
            address: params.address,
            coin: normalizedCoin,
            dex: normalizedDex,
            verdict: 'position-exists',
            position,
            slReanchored: reanchored,
            warning:
              `SL_REANCHOR: stop recomputed relative to actual fill ${fill.toFixed()} ` +
              `(intended band ${intended.toFixed()}, original SL ${params.slPx.toFixed()}) — ` +
              `re-anchored stop ${reanchored} if you want the same risk distance.`
          })
        } catch (error) {
          if (error instanceof BracketGuardError) {
            return HyperliquidPostFillGuardResultSchema.parse({
              address: params.address,
              coin: normalizedCoin,
              dex: normalizedDex,
              verdict: 'position-exists',
              position,
              warning: `FILL_SLIP_INVERSION: ${error.message} — reject + re-stage, never broadcast an inverted stop.`
            })
          }
          throw error
        }
      }
      return HyperliquidPostFillGuardResultSchema.parse({
        address: params.address,
        coin: normalizedCoin,
        dex: normalizedDex,
        verdict: 'position-exists',
        position
      })
    }

    // Position flat — check whether recent fills explain it (round-trip pair)
    // or whether there is simply nothing to verify.
    const fillsResult = await this.listFills({
      address: params.address,
      startTime: params.startTime ?? Date.now() - 60 * 60 * 1000,
      endTime: undefined,
      aggregateByTime: true,
      reversed: false
    })
    const coinFills = fillsResult.fills.filter(
      (fill) => fill.coin === normalizedCoin && fill.dex === normalizedDex
    )
    if (coinFills.length === 0) {
      return HyperliquidPostFillGuardResultSchema.parse({
        address: params.address,
        coin: normalizedCoin,
        dex: normalizedDex,
        verdict: 'no-recent-fills'
      })
    }
    const pairs = findRoundTripPairs(coinFills, params.windowMs ?? 1000)
    return HyperliquidPostFillGuardResultSchema.parse({
      address: params.address,
      coin: normalizedCoin,
      dex: normalizedDex,
      verdict: 'fills-without-position',
      warning:
        `FILL_WITHOUT_POSITION: ${coinFills.length} fill(s) for ${normalizedCoin} on ` +
        `${normalizedDex} but no live position — net-zero round-trip? ` +
        (pairs.length > 0
          ? `${pairs.length} equal-size buy/sell pair(s) detected.`
          : 'no equal-size pair detected — verify the ticket before re-firing.'),
      pairs: pairs.length > 0 ? pairs : null
    })
  }

  /**
   * Arm-collision guard read (the COIN ghost-flatten class): a manifest re-arm
   * must not flatten a coin that a fill/position currently protects. Live read
   * of positions + open orders + the recent fills window for ONE coin. Returns
   * the collision verdict the SizingLockService.arm guard refuses on. Read-only.
   */
  async checkSizingArmCollision(params: {
    address: HexString
    coin: string
    dex?: string | null
  }): Promise<HyperliquidSizingLockArmCollision> {
    const normalizedDex = this.formatDexName(this.normalizeDex(params.dex))
    const normalizedCoin = params.coin.trim().toUpperCase()
    const livePosition = await this.listPositions({
      address: params.address,
      dex: normalizedDex,
      allDexes: false
    }).then((r) => r.positions.some((p) => p.coin === normalizedCoin))
    const restingEntry = await this.listOpenOrders({
      address: params.address,
      dex: normalizedDex,
      allDexes: false
    }).then((r) =>
      r.orders.some(
        (o) => o.coin === normalizedCoin && o.market === 'perp' && !o.reduceOnly && !o.isTrigger
      )
    )
    const inFlightFill = await this.listFills({
      address: params.address,
      startTime: Date.now() - 5 * 60 * 1000,
      endTime: undefined,
      aggregateByTime: true,
      reversed: false
    }).then((r) =>
      r.fills.some((f) => f.coin === normalizedCoin && f.dex === normalizedDex && f.crossed)
    )
    const collision = { livePosition, inFlightFill, restingEntry }
    const note =
      livePosition || inFlightFill || restingEntry
        ? `coin ${normalizedCoin} on ${normalizedDex} has ` +
          `${livePosition ? 'a LIVE position' : ''}${inFlightFill ? ', an IN-FLIGHT fill' : ''}` +
          `${restingEntry ? ', a RESTING entry' : ''} — re-arm refused (arm-collision guard)`
        : null
    return HyperliquidSizingLockArmCollisionSchema.parse({ ...collision, note })
  }

  private async resolveAllDexNames(): Promise<string[]> {
    const perpDexs = await this.infoClient.perpDexs()
    const dexNames = ['']
    for (const perpDex of perpDexs) {
      if (!isNullish(perpDex) && perpDex.name.length > 0) dexNames.push(perpDex.name)
    }
    return dexNames
  }

  async listExchanges(): Promise<HyperliquidExchange[]> {
    const perpDexs = await this.infoClient.perpDexs()
    return perpDexs.map((perpDex) =>
      isNullish(perpDex)
        ? HyperliquidExchangeSchema.parse({ name: 'main', fullName: 'Main', isMain: true })
        : HyperliquidExchangeSchema.parse({
            name: perpDex.name,
            fullName: perpDex.fullName,
            isMain: false
          })
    )
  }

  async listPerpAssets(dex: string | null | undefined): Promise<HyperliquidPerpAssetsResult> {
    const normalizedDex = this.normalizeDex(dex)
    const metaParams: MetaAndAssetCtxsParameters = {}
    if (normalizedDex.length > 0) metaParams.dex = normalizedDex
    const [meta, assetContexts] = await this.infoClient.metaAndAssetCtxs(metaParams)

    const assets = meta.universe.map((asset, index) => {
      const assetContext = assetContexts[index]
      const requiresIsolatedMargin = this.requiresIsolatedMargin(asset)
      return HyperliquidPerpAssetSchema.parse({
        name: asset.name,
        szDecimals: asset.szDecimals,
        maxLeverage: asset.maxLeverage,
        isDelisted: asset.isDelisted === true,
        onlyIsolated: asset.onlyIsolated === true,
        marginMode: asset.marginMode ?? null,
        requiresIsolatedMargin,
        markPx: assetContext?.markPx ?? null,
        referencePx: assetContext?.midPx ?? assetContext?.markPx ?? null,
        midPx: assetContext?.midPx ?? null,
        oraclePx: assetContext?.oraclePx ?? null,
        prevDayPx: assetContext?.prevDayPx ?? null,
        dayNtlVlm: assetContext?.dayNtlVlm ?? null,
        dayBaseVlm: assetContext?.dayBaseVlm ?? null,
        funding: assetContext?.funding ?? null,
        openInterest: assetContext?.openInterest ?? null,
        premium: assetContext?.premium ?? null,
        impactPxs: assetContext?.impactPxs ?? null
      })
    })

    return HyperliquidPerpAssetsResultSchema.parse({
      market: 'perp',
      dex: normalizedDex.length > 0 ? normalizedDex : 'main',
      assets
    })
  }

  async listAllPerpAssets(): Promise<HyperliquidAllPerpAssetsResult> {
    const dexNames = await this.resolveAllDexNames()
    const dexes = await Promise.all(dexNames.map((dexName) => this.listPerpAssets(dexName)))
    return HyperliquidAllPerpAssetsResultSchema.parse({
      market: 'perp',
      dexes
    })
  }

  async listSpotAssets(): Promise<HyperliquidSpotAssetsResult> {
    const [spotMeta, spotAssetContexts] = await this.infoClient.spotMetaAndAssetCtxs()
    const tokenNameByIndex = new Map<number, string>()
    const tokenSzDecimalsByIndex = new Map<number, number>()
    for (const token of spotMeta.tokens) {
      tokenNameByIndex.set(token.index, token.name)
      tokenSzDecimalsByIndex.set(token.index, token.szDecimals)
    }

    const assets: HyperliquidSpotAsset[] = []
    for (const spotMarket of spotMeta.universe) {
      if (spotMarket.tokens.length < 2) continue
      const baseTokenIndex = spotMarket.tokens[0]
      const quoteTokenIndex = spotMarket.tokens[1]
      if (isNullish(baseTokenIndex) || isNullish(quoteTokenIndex)) continue
      const baseTokenName = tokenNameByIndex.get(baseTokenIndex)
      const quoteTokenName = tokenNameByIndex.get(quoteTokenIndex)
      const baseSzDecimals = tokenSzDecimalsByIndex.get(baseTokenIndex)
      if (isNullish(baseTokenName) || isNullish(quoteTokenName) || isNullish(baseSzDecimals)) {
        continue
      }
      const spotAssetContext = spotAssetContexts[spotMarket.index]
      assets.push(
        HyperliquidSpotAssetSchema.parse({
          pair: `${baseTokenName}/${quoteTokenName}`,
          szDecimals: baseSzDecimals,
          markPx: spotAssetContext?.markPx ?? null,
          referencePx: spotAssetContext?.midPx ?? spotAssetContext?.markPx ?? null,
          midPx: spotAssetContext?.midPx ?? null,
          prevDayPx: spotAssetContext?.prevDayPx ?? null,
          dayNtlVlm: spotAssetContext?.dayNtlVlm ?? null,
          dayBaseVlm: spotAssetContext?.dayBaseVlm ?? null
        })
      )
    }

    return HyperliquidSpotAssetsResultSchema.parse({ market: 'spot', assets })
  }

  async getOrderBook(params: HyperliquidOrderBookParams): Promise<HyperliquidOrderBookResult> {
    const dex = this.normalizeDex(params.dex)
    const rawCoin = params.coin.includes(':')
      ? params.coin
      : `${dex ? `${dex}:` : ''}${params.coin}`
    // Same venue-exact resolution as getCandles: l2Book is case-sensitive (a
    // bare uppercased KPEPE 500s while kPEPE returns). Resolve to the venue's
    // canonical name; dex-prefixed coins pass through unchanged when the meta
    // universe has no exact match (fresh HIP-3 listings).
    const coin = await this.resolveVenueCoinName(rawCoin, dex)
    const book = await this.infoClient.l2Book({ coin })
    if (isNullish(book)) {
      throw new Error(`unknown coin ${params.coin} on dex ${this.formatDexName(dex)}`)
    }
    const [bids, asks] = book.levels
    return HyperliquidOrderBookResultSchema.parse({
      coin: book.coin,
      bids: bids
        .slice(0, params.depth)
        .map((level) => ({ px: level.px, sz: level.sz, n: level.n })),
      asks: asks.slice(0, params.depth).map((level) => ({ px: level.px, sz: level.sz, n: level.n }))
    })
  }

  async getCandles(params: HyperliquidCandlesParams): Promise<HyperliquidCandlesResult> {
    const dex = this.normalizeDex(params.dex)
    const rawCoin = params.coin.includes(':')
      ? params.coin
      : `${dex ? `${dex}:` : ''}${params.coin}`
    // Resolve the VENUE-EXACT coin name from the perp meta universe. The venue's
    // canonical symbol case is authoritative (e.g. `kPEPE` on main), and
    // candleSnapshot is case-sensitive — an uppercased `KPEPE` 500s while
    // `kPEPE` returns. Resolving also fails fast with a clear message for a
    // symbol that is not actually listed (instead of an opaque 500).
    const coin = await this.resolveVenueCoinName(rawCoin, dex)
    // The bundled SDK requires a startTime; when the caller omits it, widen the
    // lookback so Hyperliquid returns the most recent candle run (capped at a few
    // thousand), which is what the desk's indicator compute needs.
    const startTime = params.startTime ?? Date.now() - HYPERLIQUID_CANDLE_DEFAULT_LOOKBACK_MS
    const candles = await this.infoClient.candleSnapshot({
      coin,
      interval: params.interval,
      startTime,
      endTime: params.endTime ?? undefined
    })
    return HyperliquidCandlesSchema.parse({
      source: 'hyperliquid',
      interval: params.interval,
      coin,
      candles: candles.map((row) => ({
        t: row.t,
        o: Number(row.o),
        h: Number(row.h),
        l: Number(row.l),
        c: Number(row.c),
        v: Number(row.v)
      }))
    })
  }

  /**
   * Resolve the venue-canonical coin name (exact case, optional dex prefix) for
   * a coin symbol. Matches case-insensitively against the perp meta universe and
   * returns the venue's own `name` field, so mixed-case venue symbols (kPEPE)
   * round-trip with their true case into candleSnapshot.
   */
  private async resolveVenueCoinName(rawCoin: string, dex: string): Promise<string> {
    const metaParams: MetaAndAssetCtxsParameters = {}
    if (dex.length > 0) metaParams.dex = dex
    const [meta] = await this.infoClient.metaAndAssetCtxs(metaParams)
    const colonIdx = rawCoin.indexOf(':')
    const symbol = (colonIdx >= 0 ? rawCoin.slice(colonIdx + 1) : rawCoin).toLowerCase()
    const dexPart = colonIdx >= 0 ? rawCoin.slice(0, colonIdx) : ''
    const match = meta.universe.find((asset) => asset.name.toLowerCase() === symbol)
    if (isNullish(match)) {
      // Dex-prefixed coins (xyz:KORU / xyz:PURRDAT): the HIP-3 meta universe may
      // not return the exact bare symbol (fresh listings, naming/case mismatch),
      // but the venue still accepts the raw prefixed coin — pass it through
      // unchanged (pre-fix behavior) rather than failing the whole read.
      if (dexPart.length > 0) return rawCoin
      throw new Error(`unknown perp coin ${rawCoin} on dex ${dex || 'main'}`)
    }
    return dexPart.length > 0 ? `${dexPart}:${match.name}` : match.name
  }

  private directionToPerpFlag(direction: HyperliquidUsdClassDirection): boolean {
    switch (direction) {
      case 'spot-to-perp':
        return true
      case 'perp-to-spot':
        return false
    }
  }

  private createExchangeClient(params: CreateExchangeClientParams): ExchangeClient {
    let nonce = Date.now()
    return new ExchangeClient({
      transport: new HttpTransport(),
      wallet: this.createPrivyWallet(params),
      signatureChainId: HYPERLIQUID_MAINNET_SIGNATURE_CHAIN_ID,
      nonceManager: (): number => {
        nonce += 1
        return nonce
      }
    })
  }

  private normalizeDex(dex: string | null | undefined): string {
    if (isNullish(dex)) return ''
    const normalizedDex = dex.trim()
    if (normalizedDex.length === 0 || normalizedDex === 'main') return ''
    return normalizedDex
  }

  private formatDexName(dexName: string): string {
    return dexName.length > 0 ? dexName : 'main'
  }

  private resolveDexAndCoin(rawCoin: string): { dex: string; coin: string } {
    const coin = rawCoin.trim()
    const separatorIndex = coin.indexOf(':')
    if (separatorIndex <= 0) return { dex: 'main', coin }

    const dex = coin.slice(0, separatorIndex)
    const strippedCoin = coin.slice(separatorIndex + 1)
    return { dex, coin: strippedCoin.length > 0 ? strippedCoin : coin }
  }

  private isSpotCoin(rawCoin: string): boolean {
    return rawCoin.startsWith('@') || rawCoin.includes('/')
  }

  private mapFrontendOpenOrder(
    order: HyperliquidFrontendOpenOrderWire,
    queriedDexName: string,
    spotPairByCoin: Map<string, string>
  ): HyperliquidOpenOrder {
    const market = this.isSpotCoin(order.coin) ? 'spot' : 'perp'
    const { dex: coinDex, coin } = this.resolveDexAndCoin(order.coin)
    let dex: string
    let displayCoin: string
    switch (market) {
      case 'spot': {
        dex = 'spot'
        displayCoin = spotPairByCoin.get(order.coin) ?? order.coin
        break
      }
      case 'perp': {
        dex = queriedDexName.length > 0 ? this.formatDexName(queriedDexName) : coinDex
        displayCoin = coin
        break
      }
    }
    let triggerPx: string | null = null
    if (order.isTrigger && !isNullish(order.triggerPx) && order.triggerPx !== '0.0') {
      triggerPx = order.triggerPx
    }

    return HyperliquidOpenOrderSchema.parse({
      dex,
      coin: displayCoin,
      market,
      side: order.side === 'B' ? 'buy' : 'sell',
      limitPx: order.limitPx,
      size: order.sz,
      origSize: order.origSz,
      orderId: order.oid,
      timestamp: order.timestamp,
      orderType: order.orderType,
      tif: order.tif,
      reduceOnly: order.reduceOnly,
      isTrigger: order.isTrigger,
      triggerPx,
      triggerCondition: order.triggerCondition,
      isPositionTpsl: order.isPositionTpsl,
      cloid: order.cloid
    })
  }

  private async buildSpotPairNamesByCoin(): Promise<Map<string, string>> {
    const [spotMeta] = await this.infoClient.spotMetaAndAssetCtxs()
    const tokenNameByIndex = new Map<number, string>()
    for (const token of spotMeta.tokens) {
      tokenNameByIndex.set(token.index, token.name)
    }

    const pairByCoin = new Map<string, string>()
    for (const spotMarket of spotMeta.universe) {
      if (spotMarket.tokens.length < 2) continue
      const baseTokenIndex = spotMarket.tokens[0]
      const quoteTokenIndex = spotMarket.tokens[1]
      if (isNullish(baseTokenIndex) || isNullish(quoteTokenIndex)) continue
      const baseTokenName = tokenNameByIndex.get(baseTokenIndex)
      const quoteTokenName = tokenNameByIndex.get(quoteTokenIndex)
      if (isNullish(baseTokenName) || isNullish(quoteTokenName)) continue
      const pair = `${baseTokenName}/${quoteTokenName}`
      pairByCoin.set(`@${spotMarket.index}`, pair)
      pairByCoin.set(spotMarket.name, pair)
    }
    return pairByCoin
  }

  private mapUserFill(
    fill: HyperliquidUserFillWire,
    spotPairByCoin: Map<string, string>
  ): HyperliquidFill {
    const market = this.isSpotCoin(fill.coin) ? 'spot' : 'perp'
    const { dex: coinDex, coin } = this.resolveDexAndCoin(fill.coin)
    let dex: string = coinDex
    let displayCoin: string = coin

    if (market === 'spot') {
      dex = 'spot'
      displayCoin = spotPairByCoin.get(fill.coin) ?? fill.coin
    }

    return HyperliquidFillSchema.parse({
      dex,
      coin: displayCoin,
      market,
      side: fill.side === 'B' ? 'buy' : 'sell',
      price: fill.px,
      size: fill.sz,
      startPosition: fill.startPosition,
      direction: fill.dir,
      closedPnl: fill.closedPnl,
      fee: fill.fee,
      feeToken: fill.feeToken,
      builderFee: fill.builderFee,
      hash: fill.hash,
      orderId: fill.oid,
      tradeId: fill.tid,
      timestamp: fill.time,
      crossed: fill.crossed,
      twapId: fill.twapId,
      cloid: fill.cloid ?? null,
      liquidation: fill.liquidation ?? null
    })
  }

  private async resolvePerpAsset(params: ResolvePerpAssetParams): Promise<ResolvedPerpAsset> {
    const metaParams: MetaAndAssetCtxsParameters = {}
    if (params.dex.length > 0) metaParams.dex = params.dex
    const [meta, assetContexts] = await this.infoClient.metaAndAssetCtxs(metaParams)

    const coin = params.coin.toLowerCase()
    const localAssetIndex = meta.universe.findIndex((asset) => {
      const name = asset.name.toLowerCase()
      return name === coin || name.replace(/^.*:/, '') === coin
    })
    if (localAssetIndex < 0) {
      throw new Error(`unknown perp coin ${params.coin} on dex ${params.dex || 'main'}`)
    }

    const assetContext = assetContexts[localAssetIndex]
    if (isNullish(assetContext)) throw new Error(`missing perp asset context for ${params.coin}`)
    const referencePrice = new BigNumber(assetContext.midPx ?? assetContext.markPx)
    if (!referencePrice.isFinite() || !referencePrice.isGreaterThan(0)) {
      throw new Error(`invalid reference price for ${params.coin}`)
    }

    const wireAsset = await this.resolveWirePerpAssetId({
      localAssetIndex,
      dex: params.dex
    })
    const metaAsset = meta.universe[localAssetIndex]
    if (isNullish(metaAsset)) throw new Error(`missing perp metadata for ${params.coin}`)
    return {
      wireAsset,
      referencePrice,
      szDecimals: metaAsset.szDecimals,
      isDelisted: metaAsset.isDelisted === true,
      requiresIsolatedMargin: this.requiresIsolatedMargin(metaAsset)
    }
  }

  private requiresIsolatedMargin(asset: {
    onlyIsolated?: true
    marginMode?: 'strictIsolated' | 'noCross'
  }): boolean {
    return asset.onlyIsolated === true || !isNullish(asset.marginMode)
  }

  private async resolveSpotAsset(pair: string): Promise<ResolvedSpotAsset> {
    const normalizedPair = pair.trim().replace(/-/g, '/').toUpperCase()
    const [spotMeta, spotAssetContexts] = await this.infoClient.spotMetaAndAssetCtxs()
    const tokenNameByIndex = new Map<number, string>()
    const tokenSzDecimalsByIndex = new Map<number, number>()
    for (const token of spotMeta.tokens) {
      tokenNameByIndex.set(token.index, token.name)
      tokenSzDecimalsByIndex.set(token.index, token.szDecimals)
    }

    let spotMarketIndex: number | null = null
    let spotBaseSzDecimals: number | null = null

    for (const spotMarket of spotMeta.universe) {
      if (spotMarket.tokens.length < 2) continue
      const baseTokenIndex = spotMarket.tokens[0]
      const quoteTokenIndex = spotMarket.tokens[1]
      if (isNullish(baseTokenIndex) || isNullish(quoteTokenIndex)) continue
      const baseTokenName = tokenNameByIndex.get(baseTokenIndex)
      const quoteTokenName = tokenNameByIndex.get(quoteTokenIndex)
      if (isNullish(baseTokenName) || isNullish(quoteTokenName)) continue
      const candidatePair = `${baseTokenName}/${quoteTokenName}`.toUpperCase()
      if (candidatePair !== normalizedPair) continue
      const baseSzDecimals = tokenSzDecimalsByIndex.get(baseTokenIndex)
      if (isNullish(baseSzDecimals)) continue
      spotMarketIndex = spotMarket.index
      spotBaseSzDecimals = baseSzDecimals
      break
    }

    if (isNullish(spotMarketIndex) || isNullish(spotBaseSzDecimals)) {
      throw new Error(`unknown spot pair ${pair}`)
    }

    const spotAssetContext = spotAssetContexts[spotMarketIndex]
    if (isNullish(spotAssetContext)) throw new Error(`missing spot asset context for ${pair}`)
    const referencePrice = new BigNumber(spotAssetContext.midPx ?? spotAssetContext.markPx)
    if (!referencePrice.isFinite() || !referencePrice.isGreaterThan(0)) {
      throw new Error(`invalid reference price for ${pair}`)
    }

    return {
      assetId: 10000 + spotMarketIndex,
      referencePrice,
      szDecimals: spotBaseSzDecimals
    }
  }

  private async resolveWirePerpAssetId(params: ResolveWirePerpAssetIdParams): Promise<number> {
    if (params.dex.length === 0) return params.localAssetIndex
    if (params.localAssetIndex >= 100000) return params.localAssetIndex

    const perpDexs = await this.infoClient.perpDexs()
    const perpDexIndex = perpDexs.findIndex((perpDex) => {
      return !isNullish(perpDex) && perpDex.name === params.dex
    })
    if (perpDexIndex < 0) throw new Error(`unknown perp dex ${params.dex}`)
    return 100000 + perpDexIndex * 10000 + params.localAssetIndex
  }

  private resolveOrderPrice(params: ResolveOrderPriceParams): string {
    const { marketType, orderType, limitPrice, triggerPx, szDecimals, referencePrice, isBuy } =
      params
    switch (orderType) {
      case 'limit':
      case 'stop_limit':
      case 'take_limit': {
        if (isNullish(limitPrice) || limitPrice.isNaN() || !limitPrice.isGreaterThan(0)) {
          throw new Error('limit price must be greater than 0')
        }
        return formatPrice(limitPrice.toFixed(), szDecimals, marketType)
      }
      case 'market': {
        const value = referencePrice.multipliedBy(isBuy ? 1.01 : 0.99)
        return formatPrice(value.toFixed(), szDecimals, marketType)
      }
      case 'stop_market':
      case 'take_market': {
        if (isNullish(triggerPx) || triggerPx.isNaN() || !triggerPx.isGreaterThan(0)) {
          throw new Error('trigger price must be greater than 0')
        }
        const value = triggerPx.multipliedBy(isBuy ? 1.01 : 0.99)
        return formatPrice(value.toFixed(), szDecimals, marketType)
      }
    }
  }

  private resolvePerpOrderTypeField(params: ResolvePerpOrderTypeFieldParams): PerpOrderTypeField {
    switch (params.orderType) {
      case 'market':
      case 'limit':
        return {
          limit: {
            tif: this.resolveOrderTif({ orderType: params.orderType, tif: params.tif })
          }
        }
      case 'stop_market':
      case 'stop_limit':
      case 'take_market':
      case 'take_limit': {
        if (
          isNullish(params.triggerPx) ||
          params.triggerPx.isNaN() ||
          !params.triggerPx.isGreaterThan(0)
        ) {
          throw new Error('trigger price must be greater than 0')
        }
        const isMarket = params.orderType === 'stop_market' || params.orderType === 'take_market'
        const tpsl: HyperliquidTpSl =
          params.orderType === 'take_market' || params.orderType === 'take_limit' ? 'tp' : 'sl'
        return {
          trigger: {
            isMarket,
            triggerPx: formatPrice(params.triggerPx.toFixed(), params.szDecimals, 'perp'),
            tpsl
          }
        }
      }
    }
  }

  private resolveOrderTif(params: ResolveOrderTifParams): HyperliquidOrderTif {
    switch (params.orderType) {
      case 'market':
        return 'Ioc'
      case 'limit':
        return params.tif
      case 'stop_market':
      case 'stop_limit':
      case 'take_market':
      case 'take_limit':
        throw new Error(`tif is not applicable to ${params.orderType} orders`)
    }
  }

  private buildBracketExitLeg(params: BuildBracketExitLegParams): PerpOrderWire {
    const price = this.resolveOrderPrice({
      marketType: 'perp',
      orderType: params.orderType,
      limitPrice: params.limitPx,
      triggerPx: params.triggerPx,
      szDecimals: params.perpAsset.szDecimals,
      referencePrice: params.perpAsset.referencePrice,
      isBuy: params.exitIsBuy
    })
    return {
      a: params.perpAsset.wireAsset,
      b: params.exitIsBuy,
      p: price,
      s: params.size,
      r: true,
      t: this.resolvePerpOrderTypeField({
        orderType: params.orderType,
        tif: 'Gtc',
        triggerPx: params.triggerPx,
        szDecimals: params.perpAsset.szDecimals
      })
    }
  }

  private createPrivyWallet(params: CreateExchangeClientParams): HyperliquidPrivyWallet {
    return {
      address: params.address,
      signTypedData: async (
        typedData: EthSignTypedData,
        _options?: unknown
      ): Promise<HexString> => {
        return await this.transaction.signEthTypedDataV4({
          typedData,
          walletId: params.walletId
        })
      }
    }
  }
}
