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
import type { CoinService } from '@/services/CoinService'
import type { HyperliquidService } from '@/services/HyperliquidService'
import type { MarketService } from '@/services/MarketService'
import type { OnchainService } from '@/services/OnchainService'
import type { StocksService } from '@/services/StocksService'
import { type TokenDataTimeframe } from '@/types/Birdeye'
import {
  AssetCandlesPayloadSchema,
  AssetHoldersListPayloadSchema,
  AssetNewListPayloadSchema,
  AssetPriceQuotePayloadSchema,
  AssetProfilePayloadSchema,
  AssetSearchResultsPayloadSchema,
  type AssetSpace,
  type AssetTimeframe,
  AssetTrendingListPayloadSchema
} from '@/types/Capability'
import { type CoinDays } from '@/types/Coin'
import { type OnchainTimeframe } from '@/types/Onchain'
import { isNullish } from '@/utils/Lang'

// ---------------------------------------------------------------------------
// Capability adapters: thin wrappers over the EXISTING provider services,
// normalizing each provider's trimmed shape into the unified capability
// payloads. No service is rewritten; a source is one provider (BirdEye's
// snapshot+info composition counts as one provider, two endpoints).
// ---------------------------------------------------------------------------

const GECKOTERMINAL_CANDLES_LIMIT = 200
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

type GeckoTerminalTimeframe = {
  readonly timeframe: OnchainTimeframe
  readonly aggregate: number
}

// GeckoTerminal OHLCV supports minute (1/5/15), hour (1/4), day (1); it has no
// weekly aggregate, so '1w' has no GeckoTerminal source.
const GECKOTERMINAL_TIMEFRAMES: Record<Exclude<AssetTimeframe, '1w'>, GeckoTerminalTimeframe> = {
  '1m': { timeframe: 'minute', aggregate: 1 },
  '5m': { timeframe: 'minute', aggregate: 5 },
  '15m': { timeframe: 'minute', aggregate: 15 },
  '1h': { timeframe: 'hour', aggregate: 1 },
  '4h': { timeframe: 'hour', aggregate: 4 },
  '1d': { timeframe: 'day', aggregate: 1 }
}

function geckoTerminalTimeframe(timeframe: AssetTimeframe): GeckoTerminalTimeframe | null {
  return timeframe === '1w' ? null : GECKOTERMINAL_TIMEFRAMES[timeframe]
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
  readonly onchain: OnchainService
  readonly market: MarketService
  readonly coin: CoinService
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
    },
    {
      provider: 'geckoterminal',
      fetch: async () => {
        const result = await services.onchain.getSimpleTokenPrices({
          network: chain.geckoterminal,
          addresses: [address]
        })
        const row = result.prices[0]
        if (isNullish(row)) {
          throw new EmptyPayloadError(`GeckoTerminal has no price for ${address}`)
        }
        return AssetPriceQuotePayloadSchema.parse({
          price_usd: row.price_usd,
          market_cap_usd: row.market_cap_usd,
          volume_24h_usd: row.volume_24h_usd,
          change_24h_pct: row.change_24h_pct
        })
      }
    },
    {
      provider: 'coingecko',
      fetch: async () => {
        const result = await services.market.getTokenPrices({
          platform: chain.coingecko,
          addresses: [address]
        })
        const row = result.prices[0]
        if (isNullish(row)) {
          throw new EmptyPayloadError(`CoinGecko has no price for ${address}`)
        }
        return AssetPriceQuotePayloadSchema.parse({
          price_usd: row.price_usd,
          market_cap_usd: row.market_cap_usd,
          volume_24h_usd: row.volume_24h_usd,
          change_24h_pct: row.change_24h_pct,
          updated_at: row.updated_at
        })
      }
    }
  ]
}

type PriceIdParams = {
  readonly services: AssetServices
  readonly id: string
}

export function priceIdSources(params: PriceIdParams): PriceSource[] {
  const { services, id } = params
  return [
    {
      provider: 'coingecko',
      authoritative: true,
      fetch: async () => {
        const result = await services.market.getPrices({ ids: [id] })
        const row = result.prices[0]
        if (isNullish(row)) {
          throw new NotFoundError(`CoinGecko has no coin id '${id}'`)
        }
        return AssetPriceQuotePayloadSchema.parse({
          price_usd: row.price_usd,
          market_cap_usd: row.market_cap_usd,
          volume_24h_usd: row.volume_24h_usd,
          change_24h_pct: row.change_24h_pct,
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
  const sources: CandleSource[] = [
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
  const geckoTimeframe = geckoTerminalTimeframe(timeframe)
  if (!isNullish(geckoTimeframe)) {
    sources.push({
      provider: 'geckoterminal',
      fetch: async () => {
        const result = await services.onchain.getTokenOhlcv({
          network: chain.geckoterminal,
          address,
          timeframe: geckoTimeframe.timeframe,
          aggregate: geckoTimeframe.aggregate,
          limit: GECKOTERMINAL_CANDLES_LIMIT,
          beforeTimestamp: null
        })
        if (result.candles.length === 0) {
          throw new EmptyPayloadError(`GeckoTerminal has no ${timeframe} candles for ${address}`)
        }
        return AssetCandlesPayloadSchema.parse({ candles: result.candles })
      }
    })
  }
  return sources
}

type CandlesIdParams = {
  readonly services: AssetServices
  readonly id: string
  readonly days: CoinDays
}

export function candlesIdSources(params: CandlesIdParams): CandleSource[] {
  const { services, id, days } = params
  return [
    {
      provider: 'coingecko',
      authoritative: true,
      fetch: async () => {
        const result = await services.coin.getOhlc({ id, days })
        if (result.candles.length === 0) {
          throw new EmptyPayloadError(`CoinGecko has no OHLC for coin id '${id}'`)
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
  const sources: CandleSource[] = []
  const geckoTimeframe = geckoTerminalTimeframe(timeframe)
  if (!isNullish(geckoTimeframe)) {
    sources.push({
      provider: 'geckoterminal',
      fetch: async () => {
        const result = await services.onchain.getPoolOhlcv({
          network: chain.geckoterminal,
          address: pool,
          timeframe: geckoTimeframe.timeframe,
          aggregate: geckoTimeframe.aggregate,
          limit: GECKOTERMINAL_CANDLES_LIMIT
        })
        if (result.candles.length === 0) {
          throw new EmptyPayloadError(`GeckoTerminal has no ${timeframe} candles for pool ${pool}`)
        }
        return AssetCandlesPayloadSchema.parse({ candles: result.candles })
      }
    })
  }
  sources.push({
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
  })
  return sources
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
    },
    {
      // One provider, two endpoints: snapshot for the market block, info for
      // identity/links.
      provider: 'geckoterminal',
      fetch: async () => {
        const [snapshot, info] = await Promise.all([
          services.onchain.getTokenSnapshot({ network: chain.geckoterminal, address }),
          services.onchain.getTokenInfo({ network: chain.geckoterminal, address })
        ])
        return AssetProfilePayloadSchema.parse({
          symbol: snapshot.symbol ?? info.symbol,
          name: snapshot.name ?? info.name,
          address,
          chain: chain.canonical,
          price_usd: snapshot.price_usd,
          market_cap_usd: snapshot.market_cap_usd,
          fdv_usd: snapshot.fdv_usd,
          liquidity_usd: snapshot.total_reserve_usd,
          volume_24h_usd: snapshot.volume_24h_usd,
          links: {
            homepage: info.websites[0],
            twitter: info.socials.twitter,
            telegram: info.socials.telegram,
            discord: info.socials.discord
          },
          description: info.description
        })
      }
    },
    {
      provider: 'coingecko',
      fetch: async () => {
        const contract = await services.coin.getContract({ platform: chain.coingecko, address })
        return AssetProfilePayloadSchema.parse({
          id: contract.id,
          symbol: contract.symbol,
          name: contract.name,
          rank: contract.rank,
          address: contract.address,
          chain: chain.canonical,
          price_usd: contract.price_usd,
          market_cap_usd: contract.market_cap_usd,
          fdv_usd: contract.fdv_usd,
          volume_24h_usd: contract.volume_24h_usd,
          change_24h_pct: contract.change_24h_pct
        })
      }
    }
  ]
}

type ProfileIdParams = {
  readonly services: AssetServices
  readonly id: string
}

export function profileIdSources(params: ProfileIdParams): ProfileSource[] {
  const { services, id } = params
  return [
    {
      provider: 'coingecko',
      authoritative: true,
      fetch: async () => {
        const profile = await services.coin.getProfile({ id })
        return AssetProfilePayloadSchema.parse({
          id: profile.id,
          symbol: profile.symbol,
          name: profile.name,
          rank: profile.rank,
          price_usd: profile.price_usd,
          market_cap_usd: profile.market_cap_usd,
          fdv_usd: profile.fdv_usd,
          volume_24h_usd: profile.volume_24h_usd,
          change_24h_pct: profile.change_24h_pct,
          links: {
            homepage: profile.links.homepage,
            twitter: profile.links.twitter
          },
          description: profile.description
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
  readonly space: AssetSpace
  readonly chain: ResolvedChain | null
  readonly limit: number
}

export function trendingSources(params: TrendingParams): TrendingSource[] {
  const { services, space, chain, limit } = params
  if (space === 'coins') {
    return [
      {
        provider: 'coingecko',
        fetch: async () => {
          const result = await services.market.getTrending()
          if (result.coins.length === 0) {
            throw new EmptyPayloadError('CoinGecko returned no trending coins')
          }
          return AssetTrendingListPayloadSchema.parse({
            space,
            items: result.coins.slice(0, limit).map((coin) => ({
              id: coin.id,
              symbol: coin.symbol,
              name: coin.name,
              rank: coin.rank,
              price_usd: coin.price_usd,
              change_24h_pct: coin.change_24h_pct
            }))
          })
        }
      }
    ]
  }
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
          space,
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
    },
    {
      provider: 'geckoterminal',
      fetch: async () => {
        const result = await services.onchain.getTrendingPools({
          network: chain?.geckoterminal ?? null,
          limit
        })
        if (result.pools.length === 0) {
          throw new EmptyPayloadError('GeckoTerminal returned no trending pools')
        }
        return AssetTrendingListPayloadSchema.parse({
          space,
          items: result.pools.map((pool) => ({
            address: pool.address,
            name: pool.name,
            network: pool.network,
            price_usd: pool.price_usd,
            change_24h_pct: pool.change_24h_pct,
            volume_24h_usd: pool.volume_24h_usd,
            liquidity_usd: pool.reserve_usd
          }))
        })
      }
    }
  ]
}

// --- new listings ---------------------------------------------------------

type NewListingsParams = {
  readonly services: AssetServices
  readonly space: AssetSpace
  readonly limit: number
}

export function newListingSources(params: NewListingsParams): NewListingsSource[] {
  const { services, space, limit } = params
  if (space === 'coins') {
    return [
      {
        provider: 'coingecko',
        fetch: async () => {
          const result = await services.market.getNewCoins({ limit })
          if (result.coins.length === 0) {
            throw new EmptyPayloadError('CoinGecko returned no new coins')
          }
          return AssetNewListPayloadSchema.parse({
            space,
            items: result.coins.map((coin) => ({
              id: coin.id,
              symbol: coin.symbol,
              name: coin.name,
              listed_at: coin.activated_at
            }))
          })
        }
      }
    ]
  }
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
          space,
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
    },
    {
      provider: 'geckoterminal',
      fetch: async () => {
        const result = await services.onchain.getNewPools({ network: null, limit })
        if (result.pools.length === 0) {
          throw new EmptyPayloadError('GeckoTerminal returned no new pools')
        }
        return AssetNewListPayloadSchema.parse({
          space,
          items: result.pools.map((pool) => ({
            address: pool.address,
            name: pool.name,
            network: pool.network,
            liquidity_usd: pool.reserve_usd,
            listed_at: pool.created_at,
            dex: pool.dex
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
  readonly chain: ResolvedChain | null
  readonly limit: number
}

export function searchSources(params: SearchParams): SearchSource[] {
  const { services, query, chain, limit } = params
  if (isNullish(chain)) {
    return [
      {
        // No-match is a legitimate final answer here, so empty results are
        // returned, not thrown.
        provider: 'coingecko',
        fetch: async () => {
          const result = await services.market.search({ query })
          return AssetSearchResultsPayloadSchema.parse({
            query,
            results: result.coins.slice(0, limit).map((coin) => ({
              id: coin.id,
              symbol: coin.symbol,
              name: coin.name,
              rank: coin.rank
            }))
          })
        }
      }
    ]
  }
  return [
    {
      // Empty triggers the GeckoTerminal fallback — indexing coverage differs.
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
    },
    {
      provider: 'geckoterminal',
      fetch: async () => {
        const result = await services.onchain.searchPools({
          query,
          network: chain.geckoterminal
        })
        return AssetSearchResultsPayloadSchema.parse({
          query,
          results: result.pools.slice(0, limit).map((pool) => ({
            address: pool.address,
            name: pool.name,
            network: pool.network,
            price_usd: pool.price_usd,
            liquidity_usd: pool.reserve_usd,
            volume_24h_usd: pool.volume_24h_usd
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
  const geckoterminal: HoldersSource = {
    provider: 'geckoterminal',
    fetch: async () => {
      const result = await services.onchain.getTopHolders({
        network: chain.geckoterminal,
        address,
        limit
      })
      if (result.holders.length === 0) {
        throw new EmptyPayloadError(`GeckoTerminal has no holders for ${address}`)
      }
      return AssetHoldersListPayloadSchema.parse({
        address,
        chain: chain.canonical,
        holders: result.holders
      })
    }
  }
  if (chain.canonical !== 'solana') {
    return [geckoterminal]
  }
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
    },
    geckoterminal
  ]
}
