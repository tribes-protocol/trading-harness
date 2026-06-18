import {
  ExchangeClient,
  HttpTransport,
  InfoClient,
  type MetaAndAssetCtxsParameters,
  type OrderParameters,
  type OrderSuccessResponse,
  type SendAssetSuccessResponse,
  type SpotSendSuccessResponse,
  type UsdClassTransferSuccessResponse,
  type UsdSendSuccessResponse,
  type Withdraw3SuccessResponse
} from '@nktkas/hyperliquid'
import { formatPrice, formatSize } from '@nktkas/hyperliquid/utils'
import BigNumber from 'bignumber.js'
import { encodeFunctionData, erc20Abi, parseUnits } from 'viem'

import { TransactionService } from '@/services/TransactionService'
import { type EthAddress } from '@/types/Eth'
import {
  type HyperliquidBalancesResult,
  HyperliquidBalancesResultSchema,
  type HyperliquidDepositResult,
  HyperliquidDepositResultSchema,
  type HyperliquidDexCashTransferCommandOptions,
  type HyperliquidExchange,
  HyperliquidExchangeSchema,
  type HyperliquidOrderTif,
  HyperliquidPerpAssetSchema,
  type HyperliquidPerpAssetsResult,
  HyperliquidPerpAssetsResultSchema,
  type HyperliquidPerpOrderType,
  type HyperliquidPerpPosition,
  HyperliquidPerpPositionSchema,
  type HyperliquidPerpTif,
  type HyperliquidPerpTradeCommandOptions,
  type HyperliquidPositionsResult,
  HyperliquidPositionsResultSchema,
  type HyperliquidPrivyWallet,
  type HyperliquidSpotAsset,
  HyperliquidSpotAssetSchema,
  type HyperliquidSpotAssetsResult,
  HyperliquidSpotAssetsResultSchema,
  HyperliquidSpotBalanceSchema,
  type HyperliquidSpotTradeCommandOptions,
  type HyperliquidSpotTransferCommandOptions,
  type HyperliquidTpSl,
  type HyperliquidUsdClassDirection,
  type HyperliquidUsdClassTransferCommandOptions,
  type HyperliquidUsdTransferCommandOptions,
  type HyperliquidWithdrawCommandOptions,
  type ResolvedPerpAsset,
  type ResolvedSpotAsset,
  type ResolveOrderPriceParams,
  type ResolveOrderTifParams,
  type ResolvePerpAssetParams,
  type ResolveWirePerpAssetIdParams
} from '@/types/Hyperliquid'
import { type HexString } from '@/types/Lang'
import { type EthSignTypedData } from '@/types/Tx'
import { isNullish } from '@/utils/Lang'

interface HyperliquidServiceParams {
  readonly transaction: TransactionService
}

interface HyperliquidDepositParams {
  readonly amount: BigNumber
  readonly from: EthAddress
  readonly walletId: string
}

interface HyperliquidWithSignerParams<TRequest> {
  readonly request: TRequest
  readonly walletId: string
}

interface HyperliquidListBalancesParams {
  readonly address: EthAddress
  readonly dex: string | null | undefined
}

interface HyperliquidListPositionsParams {
  readonly address: EthAddress
  readonly dex: string | null | undefined
  readonly allDexes: boolean
}

interface CreateExchangeClientParams {
  readonly address: EthAddress
  readonly walletId: string
}

type PerpOrderTypeField =
  | { readonly limit: { readonly tif: HyperliquidOrderTif } }
  | {
      readonly trigger: {
        readonly isMarket: boolean
        readonly triggerPx: string
        readonly tpsl: HyperliquidTpSl
      }
    }

interface PerpOrderWire {
  readonly a: number
  readonly b: boolean
  readonly p: string
  readonly s: string
  readonly r: boolean
  readonly t: PerpOrderTypeField
}

interface BuildBracketExitLegParams {
  readonly orderType: HyperliquidPerpOrderType
  readonly triggerPx: BigNumber
  readonly limitPx: BigNumber | null | undefined
  readonly exitIsBuy: boolean
  readonly perpAsset: ResolvedPerpAsset
  readonly size: string
}

interface ResolvePerpOrderTypeFieldParams {
  readonly orderType: HyperliquidPerpOrderType
  readonly tif: HyperliquidPerpTif
  readonly triggerPx: BigNumber | null | undefined
  readonly szDecimals: number
}

const ARBITRUM_USDC_DECIMALS = 6
const MIN_HYPERLIQUID_DEPOSIT_USDC = '5'
const HYPERLIQUID_ARBITRUM_CHAIN_ID = 42161
const HYPERLIQUID_BRIDGE_ADDRESS = '0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7'
const ARBITRUM_USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'
const HYPERLIQUID_MAINNET_SIGNATURE_CHAIN_ID = '0xa4b1'

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
    const perpParams: { user: EthAddress; dex?: string } = { user: params.address }
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

    const states = await Promise.all(
      dexNames.map(async (dexName) => {
        const stateParams: { user: EthAddress; dex?: string } = { user: params.address }
        if (dexName.length > 0) stateParams.dex = dexName
        const state = await this.infoClient.clearinghouseState(stateParams)
        return { dexName, state }
      })
    )

    const positions: HyperliquidPerpPosition[] = []
    for (const { dexName, state } of states) {
      for (const assetPosition of state.assetPositions) {
        const position = assetPosition.position
        const szi = new BigNumber(position.szi)
        if (szi.isZero()) continue
        positions.push(
          HyperliquidPerpPositionSchema.parse({
            dex: dexName.length > 0 ? dexName : 'main',
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

    return HyperliquidPositionsResultSchema.parse({
      address: params.address,
      positions
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
      const markPx = isNullish(assetContext) ? null : (assetContext.midPx ?? assetContext.markPx)
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
      const markPx = isNullish(spotAssetContext)
        ? null
        : (spotAssetContext.midPx ?? spotAssetContext.markPx)
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
