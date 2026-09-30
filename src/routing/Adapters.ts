import {
  type CandleSource,
  EmptyPayloadError,
  type HoldersSource,
  type NewListingsSource,
  NotFoundError,
  type PriceSource,
  type ProfileSource,
  type SearchSource,
  type TrendingSource
} from '@/routing/Capabilities'
import { type ResolvedChain } from '@/routing/Chains'
import type { BirdeyeService } from '@/services/BirdeyeService'
import type { HyperliquidService } from '@/services/HyperliquidService'
import type { StocksService } from '@/services/StocksService'
import { type TokenDataTimeframe } from '@/types/Birdeye'
import {
  AssetCandlesPayloadSchema,
  AssetHoldersListPayloadSchema,
  AssetNewListPayloadSchema,
  AssetPriceQuotePayloadSchema,
  AssetProfilePayloadSchema,
  AssetSearchResultsPayloadSchema,
  type AssetTimeframe,
  AssetTrendingListPayloadSchema
} from '@/types/Capability'
import { isNullish } from '@/utils/Lang'

// ---------------------------------------------------------------------------
// Capability adapters: thin wrappers over the EXISTING provider services,
// normalizing each provider's trimmed shape into the unified capability
// payloads. No service is rewritten; a source is one provider. The routed
// providers are BirdEye (on-chain tokens), Marketstack (stocks), and
// Hyperliquid (perps).
// ---------------------------------------------------------------------------

const STOCK_CANDLES_LIMIT = 200
// BirdEye's trending/new-listing endpoints require an x-chain header; when the
// caller gives no chain the Solana feed is the deepest default.
const BIRDEYE_DEFAULT_LIST_CHAIN = 'solana'
const PCT_FACTOR = 100
const MS_PER_SECOND = 1000

const BIRDEYE_TIMEFRAMES: Record<AssetTimeframe, TokenDataTimeframe> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '1h': '1H',
  '4h': '4H',
  '1d': '1D',
  '1w': '1W'
}

function asFiniteNumber(value: string | number | null | undefined): number | null {
  if (isNullish(value)) {
    return null
  }
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export type AssetServices = {
  readonly birdeye: BirdeyeService
  readonly stocks: StocksService
  readonly hyperliquid: HyperliquidService
}

// --- price ---------------------------------------------------------------

type PriceContractParams = {
  readonly services: AssetServices
  readonly address: string
  readonly chain: ResolvedChain
}

export function priceContractSources(params: PriceContractParams): PriceSource[] {
  const { services, address, chain } = params
  return [
    {
      provider: 'birdeye',
      fetch: async () => {
        const result = await services.birdeye.getPrices({
          addresses: [address],
          chain: chain.birdeye
        })
        const row = result.prices[0]
        if (isNullish(row)) {
          throw new EmptyPayloadError(`BirdEye has no price for ${address}`)
        }
        return AssetPriceQuotePayloadSchema.parse({
          price_usd: row.price_usd,
          change_24h_pct: row.change_24h_pct,
          liquidity_usd: row.liquidity_usd,
          updated_at: row.updated_at
        })
      }
    }
  ]
}

type PriceTickerParams = {
  readonly services: AssetServices
  readonly ticker: string
}

export function priceTickerSources(params: PriceTickerParams): PriceSource[] {
  const { services, ticker } = params
  return [
    {
      provider: 'marketstack',
      authoritative: true,
      fetch: async () => {
        const result = await services.stocks.getStockPrice({ symbol: ticker })
        if (isNullish(result.price)) {
          throw new NotFoundError(`Marketstack has no live price for ticker '${ticker}'`)
        }
        return AssetPriceQuotePayloadSchema.parse({
          symbol: result.symbol,
          price_usd: result.price
        })
      }
    },
    {
      // Same provider, honest fallback: latest EOD close, labeled stale.
      provider: 'marketstack',
      authoritative: true,
      fetch: async () => {
        const result = await services.stocks.getCandles({
          symbol: ticker,
          from: null,
          to: null,
          limit: 1
        })
        const latest = result.candles[result.candles.length - 1]
        if (isNullish(latest)) {
          throw new NotFoundError(`Marketstack has no EOD data for ticker '${ticker}'`)
        }
        return AssetPriceQuotePayloadSchema.parse({
          symbol: ticker,
          price_usd: latest.c,
          volume_24h_usd: latest.v,
          updated_at: Math.floor(latest.t / MS_PER_SECOND),
          stale: true
        })
      }
    }
  ]
}

type PricePerpParams = {
  readonly services: AssetServices
  readonly perp: string
}

export function pricePerpSources(params: PricePerpParams): PriceSource[] {
  const { services, perp } = params
  return [
    {
      provider: 'hyperliquid',
      authoritative: true,
      fetch: async () => {
        const colonIdx = perp.indexOf(':')
        const symbol = (colonIdx >= 0 ? perp.slice(colonIdx + 1) : perp).toUpperCase()
        const dex = colonIdx >= 0 ? perp.slice(0, colonIdx) : null
        const listings = isNullish(dex)
          ? (await services.hyperliquid.listAllPerpAssets()).dexes
          : [await services.hyperliquid.listPerpAssets(dex)]
        const assets = listings.flatMap((listing) => listing.assets)
        const asset =
          assets.find((entry) => entry.name.toUpperCase() === symbol && !entry.isDelisted) ??
          assets.find((entry) => entry.name.toUpperCase() === symbol)
        if (isNullish(asset)) {
          throw new NotFoundError(`Hyperliquid lists no perp '${perp}'`)
        }
        const mark = asFiniteNumber(asset.markPx)
        const prev = asFiniteNumber(asset.prevDayPx)
        return AssetPriceQuotePayloadSchema.parse({
          symbol: asset.name,
          price_usd: mark,
          volume_24h_usd: asFiniteNumber(asset.dayNtlVlm),
          change_24h_pct:
            isNullish(mark) || isNullish(prev) || prev === 0
              ? null
              : ((mark - prev) / prev) * PCT_FACTOR
        })
      }
    }
  ]
}

// --- candles -------------------------------------------------------------

type CandlesContractParams = {
  readonly services: AssetServices
  readonly address: string
  readonly chain: ResolvedChain
  readonly timeframe: AssetTimeframe
}

export function candlesContractSources(params: CandlesContractParams): CandleSource[] {
  const { services, address, chain, timeframe } = params
  return [
    {
      provider: 'birdeye',
      fetch: async () => {
        const result = await services.birdeye.getOhlcv({
          address,
          timeframe: BIRDEYE_TIMEFRAMES[timeframe],
          from: null,
          to: null,
          chain: chain.birdeye
        })
        if (result.candles.length === 0) {
          throw new EmptyPayloadError(`BirdEye has no ${timeframe} candles for ${address}`)
        }
        return AssetCandlesPayloadSchema.parse({ candles: result.candles })
      }
    }
  ]
}

type CandlesTickerParams = {
  readonly services: AssetServices
  readonly ticker: string
}

export function candlesTickerSources(params: CandlesTickerParams): CandleSource[] {
  const { services, ticker } = params
  return [
    {
      provider: 'marketstack',
      authoritative: true,
      fetch: async () => {
        const result = await services.stocks.getCandles({
          symbol: ticker,
          from: null,
          to: null,
          limit: STOCK_CANDLES_LIMIT
        })
        if (result.candles.length === 0) {
          throw new NotFoundError(`Marketstack has no EOD candles for ticker '${ticker}'`)
        }
        return AssetCandlesPayloadSchema.parse({ candles: result.candles })
      }
    }
  ]
}

type CandlesPoolParams = {
  readonly services: AssetServices
  readonly pool: string
  readonly chain: ResolvedChain
  readonly timeframe: AssetTimeframe
}

export function candlesPoolSources(params: CandlesPoolParams): CandleSource[] {
  const { services, pool, chain, timeframe } = params
  return [
    {
      provider: 'birdeye',
      fetch: async () => {
        const result = await services.birdeye.getPairOhlcv({
          address: pool,
          timeframe: BIRDEYE_TIMEFRAMES[timeframe],
          from: null,
          to: null,
          chain: chain.birdeye
        })
        if (result.candles.length === 0) {
          throw new EmptyPayloadError(`BirdEye has no ${timeframe} candles for pool ${pool}`)
        }
        return AssetCandlesPayloadSchema.parse({ candles: result.candles })
      }
    }
  ]
}

// --- profile -------------------------------------------------------------

type ProfileContractParams = {
  readonly services: AssetServices
  readonly address: string
  readonly chain: ResolvedChain
}

export function profileContractSources(params: ProfileContractParams): ProfileSource[] {
  const { services, address, chain } = params
  return [
    {
      provider: 'birdeye',
      fetch: async () => {
        const overview = await services.birdeye.getOverview({ address, chain: chain.birdeye })
        return AssetProfilePayloadSchema.parse({
          symbol: overview.symbol,
          name: overview.name,
          address,
          chain: chain.canonical,
          price_usd: overview.price_usd,
          market_cap_usd: overview.market_cap_usd,
          fdv_usd: overview.fdv_usd,
          liquidity_usd: overview.liquidity_usd,
          volume_24h_usd: overview.volume_24h_usd,
          holders: overview.holders,
          change_24h_pct: overview.change_24h_pct
        })
      }
    }
  ]
}

type ProfileTickerParams = {
  readonly services: AssetServices
  readonly ticker: string
}

export function profileTickerSources(params: ProfileTickerParams): ProfileSource[] {
  const { services, ticker } = params
  return [
    {
      provider: 'marketstack',
      authoritative: true,
      fetch: async () => {
        const detail = await services.stocks.getDetail({ symbol: ticker })
        return AssetProfilePayloadSchema.parse({
          symbol: detail.symbol,
          name: detail.name,
          sector: detail.sector,
          industry: detail.industry,
          exchange: detail.exchange,
          country: detail.country
        })
      }
    }
  ]
}

// --- trending ------------------------------------------------------------

type TrendingParams = {
  readonly services: AssetServices
  readonly chain: ResolvedChain | null
  readonly limit: number
}

export function trendingSources(params: TrendingParams): TrendingSource[] {
  const { services, chain, limit } = params
  return [
    {
      provider: 'birdeye',
      fetch: async () => {
        const result = await services.birdeye.getTrending({
          limit,
          chain: chain?.birdeye ?? BIRDEYE_DEFAULT_LIST_CHAIN
        })
        if (result.tokens.length === 0) {
          throw new EmptyPayloadError('BirdEye returned no trending tokens')
        }
        return AssetTrendingListPayloadSchema.parse({
          space: 'onchain',
          items: result.tokens.map((token) => ({
            address: token.address,
            symbol: token.symbol,
            name: token.name,
            network: chain?.canonical ?? BIRDEYE_DEFAULT_LIST_CHAIN,
            rank: token.rank,
            price_usd: token.price_usd,
            change_24h_pct: token.change_24h_pct,
            volume_24h_usd: token.volume_24h_usd,
            liquidity_usd: token.liquidity_usd,
            market_cap_usd: token.market_cap_usd
          }))
        })
      }
    }
  ]
}

// --- new listings ---------------------------------------------------------

type NewListingsParams = {
  readonly services: AssetServices
  readonly limit: number
}

export function newListingSources(params: NewListingsParams): NewListingsSource[] {
  const { services, limit } = params
  return [
    {
      provider: 'birdeye',
      fetch: async () => {
        const result = await services.birdeye.getNewListings({
          limit,
          chain: BIRDEYE_DEFAULT_LIST_CHAIN
        })
        if (result.tokens.length === 0) {
          throw new EmptyPayloadError('BirdEye returned no new listings')
        }
        return AssetNewListPayloadSchema.parse({
          space: 'onchain',
          items: result.tokens.map((token) => ({
            address: token.address,
            symbol: token.symbol,
            name: token.name,
            network: BIRDEYE_DEFAULT_LIST_CHAIN,
            liquidity_usd: token.liquidity_usd,
            listed_at: token.listed_at,
            dex: token.dex
          }))
        })
      }
    }
  ]
}

// --- search ---------------------------------------------------------------

type SearchParams = {
  readonly services: AssetServices
  readonly query: string
  readonly chain: ResolvedChain
  readonly limit: number
}

export function searchSources(params: SearchParams): SearchSource[] {
  const { services, query, chain, limit } = params
  return [
    {
      // Empty triggers the next source — indexing coverage differs per provider.
      provider: 'birdeye',
      fetch: async () => {
        const result = await services.birdeye.getSearch({
          keyword: query,
          chain: chain.birdeye,
          limit
        })
        if (result.results.length === 0) {
          throw new EmptyPayloadError(`BirdEye found no tokens for '${query}'`)
        }
        return AssetSearchResultsPayloadSchema.parse({
          query,
          results: result.results.map((token) => ({
            address: token.address,
            symbol: token.symbol,
            name: token.name,
            network: token.network,
            price_usd: token.price_usd,
            liquidity_usd: token.liquidity_usd,
            volume_24h_usd: token.volume_24h_usd
          }))
        })
      }
    }
  ]
}

// --- holders --------------------------------------------------------------

type HoldersParams = {
  readonly services: AssetServices
  readonly address: string
  readonly chain: ResolvedChain
  readonly limit: number
}

export function holdersSources(params: HoldersParams): HoldersSource[] {
  const { services, address, chain, limit } = params
  return [
    {
      provider: 'birdeye',
      fetch: async () => {
        const result = await services.birdeye.getHolders({
          address,
          limit,
          chain: chain.birdeye
        })
        if (result.holders.length === 0) {
          throw new EmptyPayloadError(`BirdEye has no holders for ${address}`)
        }
        return AssetHoldersListPayloadSchema.parse({
          address,
          chain: chain.canonical,
          holders: result.holders.map((holder) => ({
            address: holder.owner,
            amount: holder.ui_amount
          }))
        })
      }
    }
  ]
}
