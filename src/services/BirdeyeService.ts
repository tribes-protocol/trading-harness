import type {
  TokenDataCandles,
  TokenDataHolders,
  TokenDataNewListings,
  TokenDataOverview,
  TokenDataPrices,
  TokenDataSecurity,
  TokenDataTimeframe,
  TokenDataTrades,
  TokenDataTrending,
  TokenDataWalletPortfolio
} from '@/types/Birdeye'
import {
  BirdeyeHolderResponseSchema,
  BirdeyeMultiPriceResponseSchema,
  BirdeyeNewListingResponseSchema,
  BirdeyeOhlcvResponseSchema,
  BirdeyeTokenOverviewResponseSchema,
  BirdeyeTokenSecurityResponseSchema,
  BirdeyeTrendingResponseSchema,
  BirdeyeTxsTokenResponseSchema,
  BirdeyeWalletTokenListResponseSchema,
  TokenDataCandlesSchema,
  TokenDataHoldersSchema,
  TokenDataNewListingsSchema,
  TokenDataOverviewSchema,
  TokenDataPricesSchema,
  TokenDataSecuritySchema,
  TokenDataTradesSchema,
  TokenDataTrendingSchema,
  TokenDataWalletPortfolioSchema
} from '@/types/Birdeye'
import { compactMap, isNullish } from '@/utils/Lang'

type BirdeyeServiceParams = {
  readonly apiKey: string
}

type GetPricesParams = {
  readonly addresses: string[]
  readonly chain: string
}

type GetOverviewParams = {
  readonly address: string
  readonly chain: string
}

type GetSecurityParams = {
  readonly address: string
  readonly chain: string
}

type GetHoldersParams = {
  readonly address: string
  readonly limit: number
  readonly chain: string
}

type GetTradesParams = {
  readonly address: string
  readonly limit: number
  readonly chain: string
}

type GetTrendingParams = {
  readonly limit: number
  readonly chain: string
}

type GetNewListingsParams = {
  readonly limit: number
  readonly chain: string
}

type GetOhlcvParams = {
  readonly address: string
  readonly timeframe: TokenDataTimeframe
  readonly from: number | null | undefined
  readonly to: number | null | undefined
  readonly chain: string
}

type GetWalletPortfolioParams = {
  readonly wallet: string
  readonly chain: string
}

const BIRDEYE_BASE_URL = 'https://public-api.birdeye.so/'
const BIRDEYE_KEY_HEADER = 'X-API-KEY'
const BIRDEYE_CHAIN_HEADER = 'x-chain'
const ERROR_BODY_MAX_CHARS = 300
const DEFAULT_OHLCV_CANDLES = 200

const TIMEFRAME_SECONDS: Record<TokenDataTimeframe, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1H': 3600,
  '4H': 14400,
  '1D': 86400,
  '1W': 604800
}

export class BirdeyeService {
  private readonly apiKey: string

  constructor(params: BirdeyeServiceParams) {
    this.apiKey = params.apiKey
  }

  async getPrices(params: GetPricesParams): Promise<TokenDataPrices> {
    const raw = await this.fetch(
      'defi/multi_price',
      { list_address: params.addresses.join(','), include_liquidity: 'true' },
      params.chain
    )
    const parsed = BirdeyeMultiPriceResponseSchema.parse(raw)
    const prices = compactMap(
      params.addresses.map((address) => {
        const entry = parsed.data[address]
        if (isNullish(entry)) {
          return null
        }
        return {
          address,
          price_usd: entry.value,
          change_24h_pct: entry.priceChange24h,
          liquidity_usd: entry.liquidity,
          updated_at: entry.updateUnixTime
        }
      })
    )
    return TokenDataPricesSchema.parse({ source: 'birdeye', chain: params.chain, prices })
  }

  async getOverview(params: GetOverviewParams): Promise<TokenDataOverview> {
    const raw = await this.fetch('defi/token_overview', { address: params.address }, params.chain)
    const parsed = BirdeyeTokenOverviewResponseSchema.parse(raw)
    const data = parsed.data
    return TokenDataOverviewSchema.parse({
      source: 'birdeye',
      chain: params.chain,
      address: params.address,
      symbol: data.symbol,
      name: data.name,
      price_usd: data.price,
      market_cap_usd: data.marketCap,
      fdv_usd: data.fdv,
      liquidity_usd: data.liquidity,
      volume_24h_usd: data.v24hUSD,
      trades_24h: data.trade24h,
      holders: data.holder,
      unique_wallets_24h: data.uniqueWallet24h,
      change_1h_pct: data.priceChange1hPercent,
      change_24h_pct: data.priceChange24hPercent
    })
  }

  async getSecurity(params: GetSecurityParams): Promise<TokenDataSecurity> {
    const raw = await this.fetch('defi/token_security', { address: params.address }, params.chain)
    const parsed = BirdeyeTokenSecurityResponseSchema.parse(raw)
    const data = parsed.data
    return TokenDataSecuritySchema.parse({
      source: 'birdeye',
      chain: params.chain,
      address: params.address,
      creator_address: data.creatorAddress,
      owner_address: data.ownerAddress,
      created_at: data.creationTime,
      creator_pct: data.creatorPercentage,
      owner_pct: data.ownerPercentage,
      top10_holder_pct: data.top10HolderPercent,
      mutable_metadata: data.mutableMetadata,
      freezeable: data.freezeable,
      freeze_authority: data.freezeAuthority,
      non_transferable: data.nonTransferable,
      transfer_fee_enabled: data.transferFeeEnable
    })
  }

  async getHolders(params: GetHoldersParams): Promise<TokenDataHolders> {
    const raw = await this.fetch(
      'defi/v3/token/holder',
      { address: params.address, offset: '0', limit: String(params.limit) },
      params.chain
    )
    const parsed = BirdeyeHolderResponseSchema.parse(raw)
    return TokenDataHoldersSchema.parse({
      source: 'birdeye',
      chain: params.chain,
      address: params.address,
      holders: (parsed.data.items ?? []).map((item) => ({
        owner: item.owner,
        token_account: item.token_account,
        ui_amount: item.ui_amount
      }))
    })
  }

  async getTrades(params: GetTradesParams): Promise<TokenDataTrades> {
    const raw = await this.fetch(
      'defi/txs/token',
      {
        address: params.address,
        offset: '0',
        limit: String(params.limit),
        tx_type: 'swap',
        sort_type: 'desc'
      },
      params.chain
    )
    const parsed = BirdeyeTxsTokenResponseSchema.parse(raw)
    return TokenDataTradesSchema.parse({
      source: 'birdeye',
      chain: params.chain,
      address: params.address,
      trades: (parsed.data.items ?? []).map((item) => ({
        tx_hash: item.txHash,
        block_unix_time: item.blockUnixTime,
        side: item.side,
        dex: item.source,
        owner: item.owner,
        from_symbol: item.from?.symbol,
        from_amount: item.from?.uiAmount,
        to_symbol: item.to?.symbol,
        to_amount: item.to?.uiAmount,
        volume_usd: item.volumeUSD
      }))
    })
  }

  async getTrending(params: GetTrendingParams): Promise<TokenDataTrending> {
    const raw = await this.fetch(
      'defi/token_trending',
      { sort_by: 'rank', sort_type: 'asc', offset: '0', limit: String(params.limit) },
      params.chain
    )
    const parsed = BirdeyeTrendingResponseSchema.parse(raw)
    return TokenDataTrendingSchema.parse({
      source: 'birdeye',
      chain: params.chain,
      tokens: (parsed.data.tokens ?? []).map((token) => ({
        address: token.address,
        symbol: token.symbol,
        name: token.name,
        rank: token.rank,
        price_usd: token.price,
        change_24h_pct: token.price24hChangePercent,
        volume_24h_usd: token.volume24hUSD,
        liquidity_usd: token.liquidity,
        market_cap_usd: token.marketcap
      }))
    })
  }

  async getNewListings(params: GetNewListingsParams): Promise<TokenDataNewListings> {
    const raw = await this.fetch(
      'defi/v2/tokens/new_listing',
      { limit: String(params.limit) },
      params.chain
    )
    const parsed = BirdeyeNewListingResponseSchema.parse(raw)
    return TokenDataNewListingsSchema.parse({
      source: 'birdeye',
      chain: params.chain,
      tokens: (parsed.data.items ?? []).map((item) => ({
        address: item.address,
        symbol: item.symbol,
        name: item.name,
        liquidity_usd: item.liquidity,
        listed_at: item.liquidityAddedAt,
        dex: item.source
      }))
    })
  }

  async getOhlcv(params: GetOhlcvParams): Promise<TokenDataCandles> {
    const to = params.to ?? Math.floor(Date.now() / 1000)
    const from = params.from ?? to - TIMEFRAME_SECONDS[params.timeframe] * DEFAULT_OHLCV_CANDLES
    const raw = await this.fetch(
      'defi/v3/ohlcv',
      {
        address: params.address,
        type: params.timeframe,
        time_from: String(from),
        time_to: String(to)
      },
      params.chain
    )
    const parsed = BirdeyeOhlcvResponseSchema.parse(raw)
    return TokenDataCandlesSchema.parse({
      source: 'birdeye',
      candles: (parsed.data.items ?? []).map((item) => ({
        t: item.unix_time * 1000,
        o: item.o,
        h: item.h,
        l: item.l,
        c: item.c,
        v: item.v
      }))
    })
  }

  async getWalletPortfolio(params: GetWalletPortfolioParams): Promise<TokenDataWalletPortfolio> {
    const raw = await this.fetch('v1/wallet/token_list', { wallet: params.wallet }, params.chain)
    const parsed = BirdeyeWalletTokenListResponseSchema.parse(raw)
    return TokenDataWalletPortfolioSchema.parse({
      source: 'birdeye',
      chain: params.chain,
      wallet: params.wallet,
      total_usd: parsed.data.totalUsd,
      tokens: (parsed.data.items ?? []).map((item) => ({
        address: item.address,
        symbol: item.symbol,
        name: item.name,
        ui_amount: item.uiAmount,
        price_usd: item.priceUsd,
        value_usd: item.valueUsd
      }))
    })
  }

  private async fetch(
    path: string,
    searchParams: Record<string, string>,
    chain: string
  ): Promise<unknown> {
    if (this.apiKey === '') {
      throw new Error(
        'BIRDEYE_API_KEY is not set — the `token-data` command group is unavailable on this box'
      )
    }
    const url = new URL(path, BIRDEYE_BASE_URL)
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, value)
    }
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        [BIRDEYE_KEY_HEADER]: this.apiKey,
        [BIRDEYE_CHAIN_HEADER]: chain
      }
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(
        `BirdEye /${path} failed: ${response.status} ${response.statusText} ${body.slice(0, ERROR_BODY_MAX_CHARS)}`
      )
    }
    const data: unknown = await response.json()
    return data
  }
}
