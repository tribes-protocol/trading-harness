import { BirdEyeHelper } from '@/helpers/BirdEye'
import { HyperliquidCandlesHelper } from '@/helpers/Hyperliquid'
import { MarketstackHelper } from '@/helpers/Marketstack'
import type { AssetIdentity } from '@/types/AssetIdentity'
import type {
  CandlesServiceParams,
  OhlcvRequest,
  OhlcvTimeframe,
  UnifiedCandle
} from '@/types/Candles'
import { TokenIdSchema } from '@/types/CrossChain'
import { normalizeHyperliquidCoin } from '@/types/Hyperliquid'
import { normalizeMassiveStocksTicker } from '@/types/MassiveStocks'
import { aggregateCandles } from '@/utils/CandleAggregation'
import {
  BIRDEYE_CHAIN_TO_CHAIN_ID,
  chainIdToBirdeyeChain,
  toMarketStackDate,
  toMarketStackPlan
} from '@/utils/Candles'
import { isNullish } from '@/utils/Lang'

const SECONDS_PER_DAY = 86_400

export class CandlesService {
  private readonly birdEye: BirdEyeHelper
  private readonly marketstack: MarketstackHelper
  private readonly hyperliquid: HyperliquidCandlesHelper

  constructor(params: CandlesServiceParams) {
    this.birdEye = new BirdEyeHelper(params.birdeyeApiKey)
    this.marketstack = new MarketstackHelper(params.marketStackApiKey)
    this.hyperliquid = new HyperliquidCandlesHelper()
  }

  // Uniform OHLCV keyed on AssetIdentity: token → BirdEye, perp → Hyperliquid,
  // stock → Marketstack. Always ascending, null bars stripped, clipped to window.
  async getOhlcv(request: OhlcvRequest): Promise<UnifiedCandle[]> {
    const timeTo = Math.floor(Date.now() / 1000)
    const timeFrom = timeTo - request.days * SECONDS_PER_DAY
    const identity = await this.resolveAssetIdentity(request)
    const candles = await this.fetchByIdentity(identity, request.timeframe, timeFrom, timeTo)
    return candles.filter((candle) => candle.timestamp >= timeFrom && candle.timestamp <= timeTo)
  }

  // Turn friendly CLI input into a concrete AssetIdentity (resolving a token
  // symbol to chain + address along the way).
  private async resolveAssetIdentity(request: OhlcvRequest): Promise<AssetIdentity> {
    switch (request.kind) {
      case 'token': {
        if (isNullish(request.chain)) {
          throw new Error('--chain is required when --kind token')
        }
        const address = await this.birdEye.resolveTokenAddress(request.chain, request.asset)
        return {
          kind: 'token',
          chainId: BIRDEYE_CHAIN_TO_CHAIN_ID[request.chain],
          tokenId: TokenIdSchema.parse(address)
        }
      }
      case 'perp':
        return { kind: 'perp', coin: normalizeHyperliquidCoin(request.asset) }
      case 'stock':
        return { kind: 'stock', ticker: normalizeMassiveStocksTicker(request.asset) }
    }
  }

  private async fetchByIdentity(
    identity: AssetIdentity,
    timeframe: OhlcvTimeframe,
    timeFrom: number,
    timeTo: number
  ): Promise<UnifiedCandle[]> {
    switch (identity.kind) {
      case 'token':
        return this.birdEye.fetchOhlcv({
          chain: chainIdToBirdeyeChain(identity.chainId),
          address: identity.tokenId,
          timeframe,
          timeFrom,
          timeTo
        })
      case 'perp':
        return this.hyperliquid.fetchPerpCandles({
          coin: identity.coin,
          timeframe,
          timeFrom,
          timeTo
        })
      case 'stock': {
        const plan = toMarketStackPlan(timeframe)
        const source = await this.marketstack.fetchSourceCandles({
          plan,
          ticker: identity.ticker,
          dateFrom: toMarketStackDate(timeFrom),
          dateTo: toMarketStackDate(timeTo)
        })
        return isNullish(plan.aggregation) ? source : aggregateCandles(source, plan.aggregation)
      }
    }
  }
}
