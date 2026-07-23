import type {
  CoinGeckoOnchainPool,
  OnchainCategories,
  OnchainCategoryPools,
  OnchainDexes,
  OnchainNetworks,
  OnchainPoolOhlcv,
  OnchainPoolRow,
  OnchainPools,
  OnchainPoolSnapshot,
  OnchainPoolTrades,
  OnchainRecentTokens,
  OnchainSearchResults,
  OnchainTimeframe
} from '@/types/Onchain'
import {
  CoinGeckoOnchainCategoriesResponseSchema,
  CoinGeckoOnchainDexesResponseSchema,
  CoinGeckoOnchainNetworksResponseSchema,
  CoinGeckoOnchainOhlcvResponseSchema,
  CoinGeckoOnchainPoolResponseSchema,
  CoinGeckoOnchainPoolsResponseSchema,
  CoinGeckoOnchainTokensInfoResponseSchema,
  CoinGeckoOnchainTradesResponseSchema,
  OnchainCategoriesSchema,
  OnchainCategoryPoolsSchema,
  OnchainDexesSchema,
  OnchainNetworksSchema,
  OnchainPoolOhlcvSchema,
  OnchainPoolSnapshotSchema,
  OnchainPoolsSchema,
  OnchainPoolTradesSchema,
  OnchainRecentTokensSchema,
  OnchainSearchResultsSchema
} from '@/types/Onchain'
import { isNullish } from '@/utils/Lang'

type OnchainServiceParams = {
  readonly apiKey: string
}

type GetNetworksParams = {
  readonly limit: number
}

type GetDexesParams = {
  readonly network: string
  readonly limit: number
}

type GetTrendingPoolsParams = {
  readonly network: string | null
  readonly limit: number
}

type GetTopPoolsParams = {
  readonly network: string
  readonly dex: string | null
  readonly limit: number
}

type GetNewPoolsParams = {
  readonly network: string | null
  readonly limit: number
}

type GetPoolParams = {
  readonly network: string
  readonly address: string
}

type GetPoolOhlcvParams = {
  readonly network: string
  readonly address: string
  readonly timeframe: OnchainTimeframe
  readonly aggregate: number | null
  readonly limit: number
}

type GetPoolTradesParams = {
  readonly network: string
  readonly address: string
  readonly limit: number
}

type SearchPoolsParams = {
  readonly query: string
  readonly network: string | null
}

type GetMegafilterPoolsParams = {
  readonly networks: string | null
  readonly dexes: string | null
  readonly minFdv: number | null
  readonly minLiquidity: number | null
  readonly minVolume: number | null
  readonly sort: string | null
  readonly limit: number
}

type GetCategoriesParams = {
  readonly limit: number
}

type GetPoolsByCategoryParams = {
  readonly category: string
  readonly limit: number
}

type GetTrendingSearchPoolsParams = {
  readonly limit: number
}

type GetPairOhlcvParams = {
  readonly network: string
  readonly pool: string
  readonly base: string
  readonly quote: string
  readonly timeframe: OnchainTimeframe
  readonly aggregate: number | null
  readonly limit: number
}

type GetRecentlyUpdatedTokensParams = {
  readonly limit: number
}

const COINGECKO_PRO_BASE_URL = 'https://pro-api.coingecko.com/'
const COINGECKO_KEY_HEADER = 'x-cg-pro-api-key'
const ERROR_BODY_MAX_CHARS = 300
const MS_PER_SECOND = 1000

export class OnchainService {
  private readonly apiKey: string

  constructor(params: OnchainServiceParams) {
    this.apiKey = params.apiKey
  }

  async getNetworks(params: GetNetworksParams): Promise<OnchainNetworks> {
    const raw = await this.fetch('api/v3/onchain/networks', {})
    const parsed = CoinGeckoOnchainNetworksResponseSchema.parse(raw)
    return OnchainNetworksSchema.parse({
      source: 'geckoterminal',
      networks: (parsed.data ?? []).slice(0, params.limit).map((row) => ({
        id: row.id,
        name: row.attributes?.name,
        coingecko_id: row.attributes?.coingecko_asset_platform_id
      }))
    })
  }

  async getDexes(params: GetDexesParams): Promise<OnchainDexes> {
    const raw = await this.fetch(
      `api/v3/onchain/networks/${encodeURIComponent(params.network)}/dexes`,
      {}
    )
    const parsed = CoinGeckoOnchainDexesResponseSchema.parse(raw)
    return OnchainDexesSchema.parse({
      source: 'geckoterminal',
      network: params.network,
      dexes: (parsed.data ?? []).slice(0, params.limit).map((row) => ({
        id: row.id,
        name: row.attributes?.name
      }))
    })
  }

  async getTrendingPools(params: GetTrendingPoolsParams): Promise<OnchainPools> {
    const path = isNullish(params.network)
      ? 'api/v3/onchain/networks/trending_pools'
      : `api/v3/onchain/networks/${encodeURIComponent(params.network)}/trending_pools`
    const raw = await this.fetch(path, {})
    return this.shapePools(raw, params.limit)
  }

  async getTopPools(params: GetTopPoolsParams): Promise<OnchainPools> {
    const network = encodeURIComponent(params.network)
    const path = isNullish(params.dex)
      ? `api/v3/onchain/networks/${network}/pools`
      : `api/v3/onchain/networks/${network}/dexes/${encodeURIComponent(params.dex)}/pools`
    const raw = await this.fetch(path, {})
    return this.shapePools(raw, params.limit)
  }

  async getNewPools(params: GetNewPoolsParams): Promise<OnchainPools> {
    const path = isNullish(params.network)
      ? 'api/v3/onchain/networks/new_pools'
      : `api/v3/onchain/networks/${encodeURIComponent(params.network)}/new_pools`
    const raw = await this.fetch(path, {})
    return this.shapePools(raw, params.limit)
  }

  async getPool(params: GetPoolParams): Promise<OnchainPoolSnapshot> {
    const raw = await this.fetch(
      `api/v3/onchain/networks/${encodeURIComponent(params.network)}/pools/${encodeURIComponent(params.address)}`,
      {}
    )
    const parsed = CoinGeckoOnchainPoolResponseSchema.parse(raw)
    const attributes = parsed.data.attributes
    const tx24h = attributes?.transactions?.h24
    return OnchainPoolSnapshotSchema.parse({
      source: 'geckoterminal',
      network: params.network,
      address: params.address,
      name: attributes?.name,
      dex: parsed.data.relationships?.dex?.data?.id,
      price_usd: this.asFiniteNumber(attributes?.base_token_price_usd),
      quote_token_price_usd: this.asFiniteNumber(attributes?.quote_token_price_usd),
      reserve_usd: this.asFiniteNumber(attributes?.reserve_in_usd),
      fdv_usd: this.asFiniteNumber(attributes?.fdv_usd),
      market_cap_usd: this.asFiniteNumber(attributes?.market_cap_usd),
      change_pct: {
        m5: this.asFiniteNumber(attributes?.price_change_percentage?.m5),
        h1: this.asFiniteNumber(attributes?.price_change_percentage?.h1),
        h6: this.asFiniteNumber(attributes?.price_change_percentage?.h6),
        h24: this.asFiniteNumber(attributes?.price_change_percentage?.h24)
      },
      volume_usd: {
        m5: this.asFiniteNumber(attributes?.volume_usd?.m5),
        h1: this.asFiniteNumber(attributes?.volume_usd?.h1),
        h6: this.asFiniteNumber(attributes?.volume_usd?.h6),
        h24: this.asFiniteNumber(attributes?.volume_usd?.h24)
      },
      tx_24h: {
        buys: tx24h?.buys,
        sells: tx24h?.sells,
        buyers: tx24h?.buyers,
        sellers: tx24h?.sellers
      },
      created_at: attributes?.pool_created_at
    })
  }

  async getPoolOhlcv(params: GetPoolOhlcvParams): Promise<OnchainPoolOhlcv> {
    const searchParams: Record<string, string> = { limit: String(params.limit) }
    if (!isNullish(params.aggregate)) {
      searchParams.aggregate = String(params.aggregate)
    }
    const raw = await this.fetch(
      `api/v3/onchain/networks/${encodeURIComponent(params.network)}/pools/${encodeURIComponent(params.address)}/ohlcv/${params.timeframe}`,
      searchParams
    )
    const parsed = CoinGeckoOnchainOhlcvResponseSchema.parse(raw)
    return OnchainPoolOhlcvSchema.parse({
      source: 'geckoterminal',
      candles: (parsed.data.attributes.ohlcv_list ?? []).map((row) => ({
        t: row[0] * MS_PER_SECOND,
        o: row[1],
        h: row[2],
        l: row[3],
        c: row[4],
        v: row[5]
      }))
    })
  }

  async getPoolTrades(params: GetPoolTradesParams): Promise<OnchainPoolTrades> {
    const raw = await this.fetch(
      `api/v3/onchain/networks/${encodeURIComponent(params.network)}/pools/${encodeURIComponent(params.address)}/trades`,
      {}
    )
    const parsed = CoinGeckoOnchainTradesResponseSchema.parse(raw)
    return OnchainPoolTradesSchema.parse({
      source: 'geckoterminal',
      network: params.network,
      address: params.address,
      trades: (parsed.data ?? []).slice(0, params.limit).map((row) => ({
        t: this.asEpochMs(row.attributes?.block_timestamp),
        tx_hash: row.attributes?.tx_hash,
        side: row.attributes?.kind,
        volume_usd: this.asFiniteNumber(row.attributes?.volume_in_usd),
        price_from_usd: this.asFiniteNumber(row.attributes?.price_from_in_usd),
        price_to_usd: this.asFiniteNumber(row.attributes?.price_to_in_usd),
        from_amount: this.asFiniteNumber(row.attributes?.from_token_amount),
        to_amount: this.asFiniteNumber(row.attributes?.to_token_amount)
      }))
    })
  }

  async searchPools(params: SearchPoolsParams): Promise<OnchainSearchResults> {
    const searchParams: Record<string, string> = { query: params.query }
    if (!isNullish(params.network)) {
      searchParams.network = params.network
    }
    const raw = await this.fetch('api/v3/onchain/search/pools', searchParams)
    const parsed = CoinGeckoOnchainPoolsResponseSchema.parse(raw)
    return OnchainSearchResultsSchema.parse({
      source: 'geckoterminal',
      query: params.query,
      pools: (parsed.data ?? []).map((pool) => this.shapePoolRow(pool))
    })
  }

  async getMegafilterPools(params: GetMegafilterPoolsParams): Promise<OnchainPools> {
    const searchParams: Record<string, string> = {}
    if (!isNullish(params.networks)) {
      searchParams.networks = params.networks
    }
    if (!isNullish(params.dexes)) {
      searchParams.dexes = params.dexes
    }
    if (!isNullish(params.minFdv)) {
      searchParams.fdv_usd_min = String(params.minFdv)
    }
    if (!isNullish(params.minLiquidity)) {
      searchParams.reserve_in_usd_min = String(params.minLiquidity)
    }
    if (!isNullish(params.minVolume)) {
      searchParams.h24_volume_usd_min = String(params.minVolume)
    }
    if (!isNullish(params.sort)) {
      searchParams.sort = params.sort
    }
    const raw = await this.fetch('api/v3/onchain/pools/megafilter', searchParams)
    return this.shapePools(raw, params.limit)
  }

  async getCategories(params: GetCategoriesParams): Promise<OnchainCategories> {
    const raw = await this.fetch('api/v3/onchain/categories', {})
    const parsed = CoinGeckoOnchainCategoriesResponseSchema.parse(raw)
    return OnchainCategoriesSchema.parse({
      source: 'geckoterminal',
      categories: (parsed.data ?? []).slice(0, params.limit).map((row) => ({
        id: row.id,
        name: row.attributes?.name,
        volume_24h_usd: this.asFiniteNumber(row.attributes?.h24_volume_usd),
        reserve_usd: this.asFiniteNumber(row.attributes?.reserve_in_usd),
        fdv_usd: this.asFiniteNumber(row.attributes?.fdv_usd),
        tx_24h: row.attributes?.h24_tx_count
      }))
    })
  }

  async getPoolsByCategory(params: GetPoolsByCategoryParams): Promise<OnchainCategoryPools> {
    const raw = await this.fetch(
      `api/v3/onchain/categories/${encodeURIComponent(params.category)}/pools`,
      {}
    )
    const parsed = CoinGeckoOnchainPoolsResponseSchema.parse(raw)
    return OnchainCategoryPoolsSchema.parse({
      source: 'geckoterminal',
      category: params.category,
      pools: (parsed.data ?? []).slice(0, params.limit).map((pool) => this.shapePoolRow(pool))
    })
  }

  async getTrendingSearchPools(params: GetTrendingSearchPoolsParams): Promise<OnchainPools> {
    const raw = await this.fetch('api/v3/onchain/pools/trending_search', {
      pools: String(params.limit)
    })
    return this.shapePools(raw, params.limit)
  }

  // Base/quote pair candles: the pool OHLCV endpoint prices the base token in
  // the pool's quote token when currency=token; the quote address is context
  // for the caller and never sent on the wire.
  async getPairOhlcv(params: GetPairOhlcvParams): Promise<OnchainPoolOhlcv> {
    const searchParams: Record<string, string> = {
      token: params.base,
      currency: 'token',
      limit: String(params.limit)
    }
    if (!isNullish(params.aggregate)) {
      searchParams.aggregate = String(params.aggregate)
    }
    const raw = await this.fetch(
      `api/v3/onchain/networks/${encodeURIComponent(params.network)}/pools/${encodeURIComponent(params.pool)}/ohlcv/${params.timeframe}`,
      searchParams
    )
    const parsed = CoinGeckoOnchainOhlcvResponseSchema.parse(raw)
    return OnchainPoolOhlcvSchema.parse({
      source: 'geckoterminal',
      candles: (parsed.data.attributes.ohlcv_list ?? []).map((row) => ({
        t: row[0] * MS_PER_SECOND,
        o: row[1],
        h: row[2],
        l: row[3],
        c: row[4],
        v: row[5]
      }))
    })
  }

  async getRecentlyUpdatedTokens(
    params: GetRecentlyUpdatedTokensParams
  ): Promise<OnchainRecentTokens> {
    const raw = await this.fetch('api/v3/onchain/tokens/info_recently_updated', {})
    const parsed = CoinGeckoOnchainTokensInfoResponseSchema.parse(raw)
    return OnchainRecentTokensSchema.parse({
      source: 'geckoterminal',
      tokens: (parsed.data ?? []).slice(0, params.limit).map((row) => ({
        network: this.networkFromPoolId(row.id),
        address: row.attributes?.address,
        name: row.attributes?.name,
        symbol: row.attributes?.symbol,
        coingecko_id: row.attributes?.coingecko_coin_id,
        gt_score: row.attributes?.gt_score,
        updated_at: row.attributes?.metadata_updated_at
      }))
    })
  }

  private shapePools(raw: unknown, limit: number): OnchainPools {
    const parsed = CoinGeckoOnchainPoolsResponseSchema.parse(raw)
    return OnchainPoolsSchema.parse({
      source: 'geckoterminal',
      pools: (parsed.data ?? []).slice(0, limit).map((pool) => this.shapePoolRow(pool))
    })
  }

  private shapePoolRow(pool: CoinGeckoOnchainPool): OnchainPoolRow {
    const attributes = pool.attributes
    const tx24h = attributes?.transactions?.h24
    return {
      network: this.networkFromPoolId(pool.id),
      address: attributes?.address,
      name: attributes?.name,
      dex: pool.relationships?.dex?.data?.id,
      price_usd: this.asFiniteNumber(attributes?.base_token_price_usd),
      change_1h_pct: this.asFiniteNumber(attributes?.price_change_percentage?.h1),
      change_24h_pct: this.asFiniteNumber(attributes?.price_change_percentage?.h24),
      volume_24h_usd: this.asFiniteNumber(attributes?.volume_usd?.h24),
      reserve_usd: this.asFiniteNumber(attributes?.reserve_in_usd),
      fdv_usd: this.asFiniteNumber(attributes?.fdv_usd),
      buys_24h: tx24h?.buys,
      sells_24h: tx24h?.sells,
      created_at: attributes?.pool_created_at
    }
  }

  // Pool ids are `<network>_<address>`; network slugs may themselves contain
  // underscores (e.g. polygon_pos), so split on the last one.
  private networkFromPoolId(id: string): string | null {
    const separator = id.lastIndexOf('_')
    return separator > 0 ? id.slice(0, separator) : null
  }

  private asEpochMs(value: string | null | undefined): number | null {
    if (isNullish(value)) {
      return null
    }
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  private async fetch(path: string, searchParams: Record<string, string>): Promise<unknown> {
    if (this.apiKey === '') {
      throw new Error(
        'COIN_GECKO_PRO_API_KEY is not set — the `onchain` command group is unavailable on this box'
      )
    }
    const url = new URL(path, COINGECKO_PRO_BASE_URL)
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, value)
    }
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        [COINGECKO_KEY_HEADER]: this.apiKey
      }
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(
        `CoinGecko /${path} failed: ${response.status} ${response.statusText} ${body.slice(0, ERROR_BODY_MAX_CHARS)}`
      )
    }
    const data: unknown = await response.json()
    return data
  }

  // Onchain pool metrics arrive as decimal strings; anything non-finite
  // collapses to null.
  private asFiniteNumber(value: unknown): number | null {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null
    }
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value)
      return Number.isFinite(parsed) ? parsed : null
    }
    return null
  }
}
