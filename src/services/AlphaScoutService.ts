import type { z } from 'zod'

import type {
  BirdEyeChain,
  BirdEyeSearchTarget,
  BirdEyeSmartMoneyInterval,
  BirdEyeSmartMoneySort,
  BirdEyeSortType,
  BirdEyeTraderStyle,
  NewListing,
  SmartMoneyToken,
  TokenSearchHit,
  TrendingToken
} from '@/types/BirdEye'
import {
  BirdEyeNewListingResponseSchema,
  BirdEyeSearchResponseSchema,
  BirdEyeSmartMoneyResponseSchema,
  BirdEyeTrendingResponseSchema,
  NewListingSchema,
  SmartMoneyTokenSchema,
  TokenSearchHitSchema,
  TrendingTokenSchema
} from '@/types/BirdEye'
import type {
  NansenChain,
  NansenHistoricalChain,
  RecentlyUpdatedToken,
  SmartMoneyDcaRow,
  SmartMoneyDexTradeRow,
  SmartMoneyHistoricalHoldingRow,
  SmartMoneyHoldingRow,
  SmartMoneyNetflowRow,
  SmartMoneyPerpTradeRow
} from '@/types/Nansen'
import {
  RecentlyUpdatedTokenSchema,
  RecentlyUpdatedTokensResponseSchema,
  SmartMoneyDcasResponseSchema,
  SmartMoneyDexTradesResponseSchema,
  SmartMoneyHistoricalHoldingsResponseSchema,
  SmartMoneyHoldingsResponseSchema,
  SmartMoneyNetflowResponseSchema,
  SmartMoneyPerpTradesResponseSchema
} from '@/types/Nansen'
import { isNullish } from '@/utils/Lang'

const BIRDEYE_BASE_URL = 'https://public-api.birdeye.so'
const NANSEN_BASE_URL = 'https://api.nansen.ai'
const COIN_GECKO_PRO_BASE_URL = 'https://pro-api.coingecko.com'

type AlphaScoutServiceParams = {
  readonly birdEyeApiKey: string
  readonly nansenApiKey: string
  readonly coinGeckoApiKey: string
}

type QueryValue = string | number | boolean | undefined

type TrendingParams = {
  readonly chain: BirdEyeChain
  readonly sortType: BirdEyeSortType
  readonly limit: number
}

type NewListingsParams = {
  readonly chain: BirdEyeChain
  readonly limit: number
  readonly memePlatformEnabled: boolean
}

type SmartMoneyTokensParams = {
  readonly interval: BirdEyeSmartMoneyInterval
  readonly traderStyle: BirdEyeTraderStyle
  readonly sortBy: BirdEyeSmartMoneySort
  readonly sortType: BirdEyeSortType
  readonly limit: number
}

type TokenSearchParams = {
  readonly query: string
  readonly chain: BirdEyeChain
  readonly target: BirdEyeSearchTarget
  readonly limit: number
}

type SmartMoneyListParams = {
  readonly chains: NansenChain[]
  readonly limit: number
  readonly page: number
}

type HistoricalHoldingsParams = {
  readonly chains: NansenHistoricalChain[]
  readonly from: string
  readonly to: string | null | undefined
  readonly limit: number
  readonly page: number
}

type SmartMoneyGlobalParams = {
  readonly limit: number
  readonly page: number
}

/**
 * Discovery layer: BirdEye for trending, new listings, and search; Nansen for
 * smart-money flows; CoinGecko onchain for freshly updated token info.
 */
export class AlphaScoutService {
  private readonly birdEyeApiKey: string

  private readonly nansenApiKey: string

  private readonly coinGeckoApiKey: string

  constructor(params: AlphaScoutServiceParams) {
    this.birdEyeApiKey = params.birdEyeApiKey
    this.nansenApiKey = params.nansenApiKey
    this.coinGeckoApiKey = params.coinGeckoApiKey
  }

  async getTrending(params: TrendingParams): Promise<TrendingToken[]> {
    const response = await this.birdEyeGet(
      '/defi/token_trending',
      BirdEyeTrendingResponseSchema,
      { sort_by: 'rank', sort_type: params.sortType, offset: 0, limit: params.limit },
      params.chain
    )

    return (response.data?.tokens ?? []).map((token) =>
      TrendingTokenSchema.parse({
        rank: token.rank,
        address: token.address,
        symbol: token.symbol,
        name: token.name,
        price: token.price,
        change_24h_pct: token.price24hChangePercent,
        volume_24h_usd: token.volume24hUSD,
        liquidity_usd: token.liquidity,
        market_cap_usd: token.marketcap ?? token.fdv
      })
    )
  }

  async getNewListings(params: NewListingsParams): Promise<NewListing[]> {
    const response = await this.birdEyeGet(
      '/defi/v2/tokens/new_listing',
      BirdEyeNewListingResponseSchema,
      { limit: params.limit, meme_platform_enabled: params.memePlatformEnabled },
      params.chain
    )

    return (response.data?.items ?? []).map((item) =>
      NewListingSchema.parse({
        address: item.address,
        symbol: item.symbol,
        name: item.name,
        source: item.source,
        liquidity_usd: item.liquidity,
        liquidity_added_at: item.liquidityAddedAt
      })
    )
  }

  async getSmartMoneyTokens(params: SmartMoneyTokensParams): Promise<SmartMoneyToken[]> {
    const response = await this.birdEyeGet(
      '/smart-money/v1/token/list',
      BirdEyeSmartMoneyResponseSchema,
      {
        interval: params.interval,
        trader_style: params.traderStyle,
        sort_by: params.sortBy,
        sort_type: params.sortType,
        offset: 0,
        limit: params.limit
      }
    )

    return (response.data ?? []).map((token) =>
      SmartMoneyTokenSchema.parse({
        address: token.token,
        symbol: token.symbol,
        name: token.name,
        price: token.price,
        change_pct: token.price_change_percent,
        smart_traders: token.smart_traders_no,
        net_flow_usd: token.net_flow,
        volume_usd: token.volume_usd,
        liquidity_usd: token.liquidity,
        market_cap_usd: token.market_cap,
        trader_style: token.trader_style
      })
    )
  }

  async searchTokens(params: TokenSearchParams): Promise<TokenSearchHit[]> {
    // `chain` must be a real chain here: BirdEye answers an absent chain (or
    // `all`) with an empty result set rather than an error.
    const response = await this.birdEyeGet('/defi/v3/search', BirdEyeSearchResponseSchema, {
      keyword: params.query,
      chain: params.chain,
      target: params.target,
      search_mode: 'fuzzy',
      search_by: 'combination',
      offset: 0,
      limit: params.limit
    })

    const hits = (response.data?.items ?? []).flatMap((item) => item.result ?? [])
    return hits.map((hit) =>
      TokenSearchHitSchema.parse({
        address: hit.address,
        symbol: hit.symbol,
        name: hit.name,
        network: hit.network,
        price: hit.price,
        change_24h_pct: hit.price_change_24h_percent,
        volume_24h_usd: hit.volume_24h_usd,
        liquidity_usd: hit.liquidity,
        market_cap_usd: hit.market_cap ?? hit.fdv,
        verified: hit.verified
      })
    )
  }

  async getRecentlyUpdatedTokens(network: string, limit: number): Promise<RecentlyUpdatedToken[]> {
    const url = new URL('/api/v3/onchain/tokens/info_recently_updated', COIN_GECKO_PRO_BASE_URL)
    url.searchParams.set('network', network)

    const response = await this.request(
      url,
      {
        method: 'GET',
        headers: { accept: 'application/json', 'x-cg-pro-api-key': this.coinGeckoApiKey }
      },
      RecentlyUpdatedTokensResponseSchema,
      'CoinGecko',
      this.coinGeckoApiKey,
      'COIN_GECKO_PRO_API_KEY'
    )

    return (response.data ?? []).slice(0, limit).map((token) =>
      RecentlyUpdatedTokenSchema.parse({
        id: token.id,
        address: token.attributes?.address,
        symbol: token.attributes?.symbol,
        name: token.attributes?.name,
        coingecko_coin_id: token.attributes?.coingecko_coin_id,
        twitter_handle: token.attributes?.twitter_handle,
        websites: token.attributes?.websites,
        gt_score: token.attributes?.gt_score,
        metadata_updated_at: token.attributes?.metadata_updated_at
      })
    )
  }

  async getSmartMoneyNetflow(params: SmartMoneyListParams): Promise<SmartMoneyNetflowRow[]> {
    const response = await this.nansenPost(
      '/api/v1/smart-money/netflow',
      SmartMoneyNetflowResponseSchema,
      { chains: params.chains, pagination: toPagination(params) }
    )
    return response.data ?? []
  }

  async getSmartMoneyHoldings(params: SmartMoneyListParams): Promise<SmartMoneyHoldingRow[]> {
    const response = await this.nansenPost(
      '/api/v1/smart-money/holdings',
      SmartMoneyHoldingsResponseSchema,
      { chains: params.chains, pagination: toPagination(params) }
    )
    return response.data ?? []
  }

  async getSmartMoneyHistoricalHoldings(
    params: HistoricalHoldingsParams
  ): Promise<SmartMoneyHistoricalHoldingRow[]> {
    const response = await this.nansenPost(
      '/api/v1/smart-money/historical-holdings',
      SmartMoneyHistoricalHoldingsResponseSchema,
      {
        chains: params.chains,
        date_range: { from: params.from, to: params.to ?? undefined },
        pagination: toPagination(params)
      }
    )
    return response.data ?? []
  }

  async getSmartMoneyDexTrades(params: SmartMoneyListParams): Promise<SmartMoneyDexTradeRow[]> {
    const response = await this.nansenPost(
      '/api/v1/smart-money/dex-trades',
      SmartMoneyDexTradesResponseSchema,
      { chains: params.chains, pagination: toPagination(params) }
    )
    return response.data ?? []
  }

  // Perp trades and DCAs are venue-wide, not chain-scoped.
  async getSmartMoneyPerpTrades(params: SmartMoneyGlobalParams): Promise<SmartMoneyPerpTradeRow[]> {
    const response = await this.nansenPost(
      '/api/v1/smart-money/perp-trades',
      SmartMoneyPerpTradesResponseSchema,
      { pagination: toPagination(params) }
    )
    return response.data ?? []
  }

  async getSmartMoneyDcas(params: SmartMoneyGlobalParams): Promise<SmartMoneyDcaRow[]> {
    const response = await this.nansenPost(
      '/api/v1/smart-money/dcas',
      SmartMoneyDcasResponseSchema,
      { pagination: toPagination(params) }
    )
    return response.data ?? []
  }

  private async birdEyeGet<Schema extends z.ZodTypeAny>(
    path: string,
    schema: Schema,
    query: Record<string, QueryValue>,
    chain?: BirdEyeChain
  ): Promise<z.output<Schema>> {
    const url = new URL(path, BIRDEYE_BASE_URL)
    for (const [key, value] of Object.entries(query)) {
      if (isNullish(value)) continue
      url.searchParams.set(key, String(value))
    }

    const headers: Record<string, string> = {
      accept: 'application/json',
      'X-API-KEY': this.birdEyeApiKey
    }
    if (!isNullish(chain)) {
      headers['x-chain'] = chain
    }

    return this.request(
      url,
      { method: 'GET', headers },
      schema,
      'BirdEye',
      this.birdEyeApiKey,
      'BIRDEYE_API_KEY'
    )
  }

  private async nansenPost<Schema extends z.ZodTypeAny>(
    path: string,
    schema: Schema,
    body: unknown
  ): Promise<z.output<Schema>> {
    return this.request(
      new URL(path, NANSEN_BASE_URL),
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          apiKey: this.nansenApiKey
        },
        body: toJsonBody(body)
      },
      schema,
      'Nansen',
      this.nansenApiKey,
      'NANSEN_API_KEY'
    )
  }

  private async request<Schema extends z.ZodTypeAny>(
    url: URL,
    init: RequestInit,
    schema: Schema,
    provider: string,
    apiKey: string,
    envName: string
  ): Promise<z.output<Schema>> {
    if (apiKey.length === 0) {
      throw new Error(`${envName} is not set; ${provider} data is unavailable.`)
    }

    const response = await fetch(url, init)
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(
        `${provider} request failed for ${url.pathname}: ${response.status} ${detail.slice(0, 200) || response.statusText}`
      )
    }

    const data: unknown = await response.json()
    return schema.parse(data)
  }
}

function toPagination(params: { readonly page: number; readonly limit: number }): {
  page: number
  per_page: number
} {
  return { page: params.page, per_page: params.limit }
}

function toJsonBody(body: unknown): string {
  /* eslint-disable lucy/no-json-stringify */
  // Nansen takes a JSON POST body; the project's tree helpers are for output.
  return JSON.stringify(body)
  /* eslint-enable lucy/no-json-stringify */
}
