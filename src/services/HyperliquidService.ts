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
  type UsdClassTransferSuccessResponse,
  type UsdSendSuccessResponse,
  type Withdraw3SuccessResponse
} from '@nktkas/hyperliquid'
import { formatPrice, formatSize } from '@nktkas/hyperliquid/utils'
import BigNumber from 'bignumber.js'
import { encodeFunctionData, erc20Abi, parseUnits } from 'viem'

import { TransactionService } from '@/services/TransactionService'
import {
  type BuildBracketExitLegParams,
  type BuildScaleOrdersParams,
  type BuildTwapWireParams,
  type CreateExchangeClientParams,
  type HyperliquidBalancesResult,
  HyperliquidBalancesResultSchema,
  type HyperliquidCancelOrderCommandOptions,
  type HyperliquidDepositParams,
  type HyperliquidDepositResult,
  HyperliquidDepositResultSchema,
  type HyperliquidDexCashTransferCommandOptions,
  type HyperliquidExchange,
  HyperliquidExchangeSchema,
  type HyperliquidFill,
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
  type HyperliquidPrivyWallet,
  type HyperliquidScaleOrderCommandOptions,
  type HyperliquidServiceParams,
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

const ARBITRUM_USDC_DECIMALS = 6
const MIN_HYPERLIQUID_DEPOSIT_USDC = '5'
const HYPERLIQUID_ARBITRUM_CHAIN_ID = 42161
const HYPERLIQUID_BRIDGE_ADDRESS = '0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7'
const ARBITRUM_USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'
const HYPERLIQUID_MAINNET_SIGNATURE_CHAIN_ID = '0xa4b1'
const MIN_HYPERLIQUID_ORDER_NOTIONAL_USD = 10
const HYPERLIQUID_TWAP_INTERVAL_SECONDS = 30

export class HyperliquidService {
  private readonly transaction: TransactionService

  private readonly infoClient: InfoClient

  constructor(params: HyperliquidServiceParams) {
    this.infoClient = new InfoClient({ transport: new HttpTransport() })
    this.transaction = params.transaction
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

    if (!isNullish(params.request.leverage)) {
      await exchange
        .updateLeverage({
          asset: perpAsset.wireAsset,
          isCross: params.request.marginMode === 'cross',
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
            })
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
        t: { limit: { tif: request.type === 'market' ? 'Ioc' : 'Gtc' } }
      }
    ]

    if (!isNullish(request.tpPx)) {
      orders.push(
        this.buildBracketExitLeg({
          orderType: isNullish(request.tpLimitPx) ? 'take_market' : 'take_limit',
          triggerPx: request.tpPx,
          limitPx: request.tpLimitPx,
          exitIsBuy,
          perpAsset,
          size
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
          size
        })
      )
    }

    return { orders, grouping: 'normalTpsl' }
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
    const asset = this.toOrderAssetFromPerp(perpAsset)

    this.validateTwapNotional({
      asset,
      amount: params.request.amount,
      durationMinutes: params.request.durationMinutes
    })

    await this.maybeUpdateLeverage({
      exchange,
      wireAsset: perpAsset.wireAsset,
      marginMode: params.request.marginMode,
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

    await this.maybeUpdateLeverage({
      exchange,
      wireAsset: perpAsset.wireAsset,
      marginMode: params.request.marginMode,
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
          }
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
      this.infoClient.clearinghouseState(perpParams),
      this.infoClient.spotClearinghouseState({ user: params.address })
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
          const state = await this.infoClient.clearinghouseState(stateParams)
          return { dexName, state }
        })
      ),
      this.infoClient.twapHistory({ user: params.address })
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
        const orders = await this.infoClient.frontendOpenOrders(requestParams)
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
      fills = await this.infoClient.userFills({
        user: params.address,
        aggregateByTime: params.aggregateByTime
      })
    } else {
      fills = await this.infoClient.userFillsByTime({
        user: params.address,
        startTime: params.startTime,
        endTime: params.endTime ?? undefined,
        aggregateByTime: params.aggregateByTime,
        reversed: params.reversed
      })
    }

    const spotPairByCoin = await this.buildSpotPairNamesByCoin()

    return HyperliquidFillsResultSchema.parse({
      address: params.address,
      fills: fills.map((fill) => this.mapUserFill(fill, spotPairByCoin))
    })
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
      let markPx: string | null = null
      if (!isNullish(assetContext)) {
        markPx = assetContext.midPx ?? assetContext.markPx
      }
      return HyperliquidPerpAssetSchema.parse({
        name: asset.name,
        szDecimals: asset.szDecimals,
        maxLeverage: asset.maxLeverage,
        markPx
      })
    })

    return HyperliquidPerpAssetsResultSchema.parse({
      market: 'perp',
      dex: normalizedDex.length > 0 ? normalizedDex : 'main',
      assets
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
      let markPx: string | null = null
      if (!isNullish(spotAssetContext)) {
        markPx = spotAssetContext.midPx ?? spotAssetContext.markPx
      }
      assets.push(
        HyperliquidSpotAssetSchema.parse({
          pair: `${baseTokenName}/${quoteTokenName}`,
          szDecimals: baseSzDecimals,
          markPx
        })
      )
    }

    return HyperliquidSpotAssetsResultSchema.parse({ market: 'spot', assets })
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
      szDecimals: metaAsset.szDecimals
    }
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
