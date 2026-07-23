import type {
  BirdeyeWalletNetWorthData,
  TokenDataCandles,
  TokenDataCreationInfo,
  TokenDataExitLiquidity,
  TokenDataHolders,
  TokenDataMintBurns,
  TokenDataNewListings,
  TokenDataOverview,
  TokenDataPrices,
  TokenDataSearchResults,
  TokenDataSecurity,
  TokenDataTimeframe,
  TokenDataTradeHistory,
  TokenDataTradeHistoryTimeFrame,
  TokenDataTrades,
  TokenDataTradeStats,
  TokenDataTransferTotal,
  TokenDataTrending,
  WalletAnalyticsBalanceChanges,
  WalletAnalyticsInterval,
  WalletAnalyticsNetWorth,
  WalletAnalyticsNetWorthChart,
  WalletAnalyticsNetWorthDetails,
  WalletAnalyticsTransferTotal
} from '@/types/Birdeye'
import {
  BirdeyeAllTimeTradesResponseSchema,
  BirdeyeBalanceChangeResponseSchema,
  BirdeyeCreationInfoResponseSchema,
  BirdeyeExitLiquidityResponseSchema,
  BirdeyeHolderResponseSchema,
  BirdeyeMintBurnTxsResponseSchema,
  BirdeyeMultiPriceResponseSchema,
  BirdeyeNewListingResponseSchema,
  BirdeyeOhlcvResponseSchema,
  BirdeyeSearchResponseSchema,
  BirdeyeTokenOverviewResponseSchema,
  BirdeyeTokenSecurityResponseSchema,
  BirdeyeTokenTransferTotalResponseSchema,
  BirdeyeTradeDataMultipleResponseSchema,
  BirdeyeTrendingResponseSchema,
  BirdeyeTxsTokenResponseSchema,
  BirdeyeWalletNetWorthChartResponseSchema,
  BirdeyeWalletNetWorthResponseSchema,
  BirdeyeWalletTransferTotalResponseSchema,
  TokenDataCandlesSchema,
  TokenDataCreationInfoSchema,
  TokenDataExitLiquiditySchema,
  TokenDataHoldersSchema,
  TokenDataMintBurnsSchema,
  TokenDataNewListingsSchema,
  TokenDataOverviewSchema,
  TokenDataPricesSchema,
  TokenDataSearchResultsSchema,
  TokenDataSecuritySchema,
  TokenDataTradeHistorySchema,
  TokenDataTradesSchema,
  TokenDataTradeStatsSchema,
  TokenDataTransferTotalSchema,
  TokenDataTrendingSchema,
  WalletAnalyticsBalanceChangesSchema,
  WalletAnalyticsNetWorthChartSchema,
  WalletAnalyticsNetWorthDetailsSchema,
  WalletAnalyticsNetWorthSchema,
  WalletAnalyticsTransferTotalSchema
} from '@/types/Birdeye'
import { compactMap, ensureJsonTreeString, isNullish } from '@/utils/Lang'

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

type GetPairOhlcvParams = {
  readonly address: string
  readonly timeframe: TokenDataTimeframe
  readonly from: number | null | undefined
  readonly to: number | null | undefined
  readonly chain: string
}

type GetSearchParams = {
  readonly keyword: string
  readonly chain: string | null | undefined
  readonly limit: number | null | undefined
}

type GetMintBurnsParams = {
  readonly address: string
  readonly limit: number
  readonly chain: string
}

type GetCreationInfoParams = {
  readonly address: string
  readonly chain: string
}

type GetExitLiquidityParams = {
  readonly addresses: string[]
  readonly chain: string
}

type GetTradeHistoryParams = {
  readonly address: string
  readonly timeFrame: TokenDataTradeHistoryTimeFrame
  readonly chain: string
}

type GetTradeStatsParams = {
  readonly addresses: string[]
  readonly chain: string
}

type GetWalletNetWorthParams = {
  readonly wallet: string
  readonly limit: number
  readonly chain: string
}

type GetWalletNetWorthDetailsParams = {
  readonly wallet: string
  readonly interval: WalletAnalyticsInterval
  readonly time: string | null | undefined
  readonly limit: number
  readonly chain: string
}

type GetWalletNetWorthChartParams = {
  readonly wallet: string
  readonly interval: WalletAnalyticsInterval
  readonly count: number
  readonly chain: string
}

type GetWalletBalanceChangesParams = {
  readonly wallet: string
  readonly from: number | null | undefined
  readonly to: number | null | undefined
  readonly limit: number
  readonly chain: string
}

type GetWalletTransferTotalParams = {
  readonly wallet: string
  readonly chain: string
}

type GetTokenTransferTotalParams = {
  readonly address: string
  readonly chain: string
}

const BIRDEYE_BASE_URL = 'https://public-api.birdeye.so/'
const BIRDEYE_KEY_HEADER = 'X-API-KEY'
const BIRDEYE_CHAIN_HEADER = 'x-chain'
const DEFAULT_OHLCV_CANDLES = 200
const DEFAULT_SEARCH_CHAIN = 'all'
const DEFAULT_SEARCH_LIMIT = 20

const TIMEFRAME_SECONDS: Record<TokenDataTimeframe, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1H': 3600,
  '4H': 14400,
  '1D': 86400,
  '1W': 604800
}

// The wallet/transfer analytics endpoints return loosely-typed payloads
// (numbers or numeric strings under several field casings); coalesce the
// probed candidates into the first finite number.
function pickNumber(
  ...candidates: ReadonlyArray<number | string | null | undefined>
): number | null {
  for (const candidate of candidates) {
    if (isNullish(candidate)) {
      continue
    }
    const value = typeof candidate === 'number' ? candidate : Number(candidate)
    if (Number.isFinite(value)) {
      return value
    }
  }
  return null
}

function pickNetWorthTotal(data: BirdeyeWalletNetWorthData | null | undefined): number | null {
  return pickNumber(
    data?.totalNetWorth,
    data?.totalNetWorthUsd,
    data?.netWorth,
    data?.net_worth,
    data?.totalValue,
    data?.value
  )
}

function mapNetWorthHoldings(data: BirdeyeWalletNetWorthData | null | undefined): Array<{
  address: string | null
  symbol: string | null
  ui_amount: number | null
  price_usd: number | null
  value_usd: number | null
  cost_basis_usd: number | null
  allocation_pct: number | null
}> {
  const items = data?.items ?? data?.tokens ?? data?.assets ?? data?.holdings ?? []
  return items.map((item) => ({
    address: item.address ?? item.tokenAddress ?? item.token_address ?? item.mint ?? null,
    symbol: item.symbol ?? item.tokenSymbol ?? item.token_symbol ?? null,
    ui_amount: pickNumber(item.uiAmount, item.ui_amount, item.amount, item.balance),
    price_usd: pickNumber(item.priceUsd, item.price_usd, item.price),
    value_usd: pickNumber(item.valueUsd, item.usdValue, item.value, item.amountUsd),
    cost_basis_usd: pickNumber(item.costBasisUsd, item.cost_basis_usd, item.costBasis),
    allocation_pct: pickNumber(item.allocation, item.share, item.weight, item.valuePercent)
  }))
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

  // Pair (pool) candles: address is the pair/pool address, not a token mint.
  async getPairOhlcv(params: GetPairOhlcvParams): Promise<TokenDataCandles> {
    const to = params.to ?? Math.floor(Date.now() / 1000)
    const from = params.from ?? to - TIMEFRAME_SECONDS[params.timeframe] * DEFAULT_OHLCV_CANDLES
    const raw = await this.fetch(
      'defi/v3/ohlcv/pair',
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

  async getSearch(params: GetSearchParams): Promise<TokenDataSearchResults> {
    const chain = params.chain ?? DEFAULT_SEARCH_CHAIN
    const raw = await this.fetch(
      'defi/v3/search',
      {
        keyword: params.keyword,
        chain,
        target: 'token',
        search_by: 'combination',
        sort_by: 'volume_24h_usd',
        sort_type: 'desc',
        offset: '0',
        limit: String(params.limit ?? DEFAULT_SEARCH_LIMIT)
      },
      chain
    )
    const parsed = BirdeyeSearchResponseSchema.parse(raw)
    const tokens = (parsed.data.items ?? [])
      .filter((item) => item.type === 'token')
      .flatMap((item) => item.result ?? [])
    const results = compactMap(
      tokens.map((token) => {
        if (isNullish(token.address)) {
          return null
        }
        return {
          address: token.address,
          symbol: token.symbol,
          name: token.name,
          price_usd: token.price,
          liquidity_usd: token.liquidity,
          volume_24h_usd: token.volume_24h_usd,
          network: token.network
        }
      })
    )
    return TokenDataSearchResultsSchema.parse({
      source: 'birdeye',
      chain,
      keyword: params.keyword,
      results
    })
  }

  async getMintBurns(params: GetMintBurnsParams): Promise<TokenDataMintBurns> {
    const raw = await this.fetch(
      'defi/v3/token/mint-burn-txs',
      {
        address: params.address,
        sort_by: 'block_time',
        sort_type: 'desc',
        type: 'all',
        offset: '0',
        limit: String(params.limit)
      },
      params.chain
    )
    const parsed = BirdeyeMintBurnTxsResponseSchema.parse(raw)
    return TokenDataMintBurnsSchema.parse({
      source: 'birdeye',
      chain: params.chain,
      address: params.address,
      transactions: (parsed.data.items ?? []).map((item) => ({
        tx_hash: item.tx_hash,
        block_unix_time: item.block_time,
        type: item.common_type,
        amount: item.ui_amount,
        slot: item.slot
      }))
    })
  }

  async getCreationInfo(params: GetCreationInfoParams): Promise<TokenDataCreationInfo> {
    const raw = await this.fetch(
      'defi/token_creation_info',
      { address: params.address },
      params.chain
    )
    const parsed = BirdeyeCreationInfoResponseSchema.parse(raw)
    const data = parsed.data
    return TokenDataCreationInfoSchema.parse({
      source: 'birdeye',
      chain: params.chain,
      address: params.address,
      symbol: data?.symbol,
      name: data?.name,
      decimals: data?.decimals,
      creator: data?.creator,
      tx_hash: data?.txHash,
      slot: data?.slot,
      created_at: data?.blockUnixTime
    })
  }

  async getExitLiquidity(params: GetExitLiquidityParams): Promise<TokenDataExitLiquidity> {
    const raw = await this.fetch(
      'defi/v3/token/exit-liquidity/multiple',
      { list_address: params.addresses.join(',') },
      params.chain
    )
    const parsed = BirdeyeExitLiquidityResponseSchema.parse(raw)
    const tokens = compactMap(
      params.addresses.map((address) => {
        const entry = parsed.data[address]
        if (isNullish(entry)) {
          return null
        }
        return {
          address,
          exit_liquidity_usd:
            entry.exit_liquidity_usd ?? entry.exitLiquidityUsd ?? entry.liquidityUsd
        }
      })
    )
    return TokenDataExitLiquiditySchema.parse({ source: 'birdeye', chain: params.chain, tokens })
  }

  async getTradeHistory(params: GetTradeHistoryParams): Promise<TokenDataTradeHistory> {
    const raw = await this.fetch(
      'defi/v3/all-time/trades/single',
      { address: params.address, time_frame: params.timeFrame },
      params.chain
    )
    const parsed = BirdeyeAllTimeTradesResponseSchema.parse(raw)
    return TokenDataTradeHistorySchema.parse({
      source: 'birdeye',
      chain: params.chain,
      address: params.address,
      time_frame: params.timeFrame,
      stats: (parsed.data ?? []).map((item) => ({
        address: item.address,
        buys: item.buy,
        sells: item.sell,
        total_trades: item.total_trade,
        volume_buy_usd: item.volume_buy_usd,
        volume_sell_usd: item.volume_sell_usd,
        total_volume_usd: item.total_volume_usd
      }))
    })
  }

  async getTradeStats(params: GetTradeStatsParams): Promise<TokenDataTradeStats> {
    const raw = await this.fetch(
      'defi/v3/token/trade-data/multiple',
      { list_address: params.addresses.join(',') },
      params.chain
    )
    const parsed = BirdeyeTradeDataMultipleResponseSchema.parse(raw)
    const tokens = compactMap(
      params.addresses.map((address) => {
        const entry = parsed.data[address]
        if (isNullish(entry)) {
          return null
        }
        return {
          address,
          price_usd: entry.price,
          change_1h_pct: entry.price_change_1h_percent,
          change_24h_pct: entry.price_change_24h_percent,
          trades_24h: entry.trade_24h,
          buys_24h: entry.buy_24h,
          sells_24h: entry.sell_24h,
          volume_24h_usd: entry.volume_24h_usd,
          volume_24h_change_pct: entry.volume_24h_change_percent,
          unique_wallets_24h: entry.unique_wallet_24h,
          holders: entry.holder,
          last_trade_at: entry.last_trade_unix_time
        }
      })
    )
    return TokenDataTradeStatsSchema.parse({ source: 'birdeye', chain: params.chain, tokens })
  }

  async getWalletNetWorth(params: GetWalletNetWorthParams): Promise<WalletAnalyticsNetWorth> {
    const raw = await this.fetch(
      'wallet/v2/current-net-worth',
      {
        wallet: params.wallet,
        sort_by: 'value',
        sort_type: 'desc',
        offset: '0',
        limit: String(params.limit)
      },
      params.chain
    )
    const parsed = BirdeyeWalletNetWorthResponseSchema.parse(raw)
    return WalletAnalyticsNetWorthSchema.parse({
      source: 'birdeye',
      chain: params.chain,
      wallet: params.wallet,
      total_usd: pickNetWorthTotal(parsed.data),
      tokens: mapNetWorthHoldings(parsed.data)
    })
  }

  async getWalletNetWorthDetails(
    params: GetWalletNetWorthDetailsParams
  ): Promise<WalletAnalyticsNetWorthDetails> {
    const searchParams: Record<string, string> = {
      wallet: params.wallet,
      type: params.interval,
      sort_type: 'desc',
      offset: '0',
      limit: String(params.limit)
    }
    if (!isNullish(params.time)) {
      searchParams.time = params.time
    }
    const raw = await this.fetch('wallet/v2/net-worth-details', searchParams, params.chain)
    const parsed = BirdeyeWalletNetWorthResponseSchema.parse(raw)
    return WalletAnalyticsNetWorthDetailsSchema.parse({
      source: 'birdeye',
      chain: params.chain,
      wallet: params.wallet,
      interval: params.interval,
      time: params.time ?? null,
      total_usd: pickNetWorthTotal(parsed.data),
      tokens: mapNetWorthHoldings(parsed.data)
    })
  }

  async getWalletNetWorthChart(
    params: GetWalletNetWorthChartParams
  ): Promise<WalletAnalyticsNetWorthChart> {
    const raw = await this.fetch(
      'wallet/v2/net-worth',
      {
        wallet: params.wallet,
        count: String(params.count),
        direction: 'back',
        type: params.interval,
        sort_type: 'desc'
      },
      params.chain
    )
    const parsed = BirdeyeWalletNetWorthChartResponseSchema.parse(raw)
    const data = parsed.data
    const points = Array.isArray(data) ? data : (data?.items ?? data?.points ?? data?.history ?? [])
    return WalletAnalyticsNetWorthChartSchema.parse({
      source: 'birdeye',
      chain: params.chain,
      wallet: params.wallet,
      interval: params.interval,
      points: points.map((point) => ({
        unix_time: pickNumber(point.unixTime, point.timestamp, point.time, point.blockTime),
        value_usd: pickNumber(point.valueUsd, point.netWorthUsd, point.value, point.usdValue)
      }))
    })
  }

  async getWalletBalanceChanges(
    params: GetWalletBalanceChangesParams
  ): Promise<WalletAnalyticsBalanceChanges> {
    const searchParams: Record<string, string> = {
      address: params.wallet,
      offset: '0',
      limit: String(params.limit)
    }
    if (!isNullish(params.from)) {
      searchParams.time_from = String(params.from)
    }
    if (!isNullish(params.to)) {
      searchParams.time_to = String(params.to)
    }
    const raw = await this.fetch('wallet/v2/balance-change', searchParams, params.chain)
    const parsed = BirdeyeBalanceChangeResponseSchema.parse(raw)
    const data = parsed.data
    const items = Array.isArray(data) ? data : (data?.items ?? data?.changes ?? data?.history ?? [])
    return WalletAnalyticsBalanceChangesSchema.parse({
      source: 'birdeye',
      chain: params.chain,
      wallet: params.wallet,
      changes: items.map((item) => ({
        block_unix_time: pickNumber(
          item.blockTime,
          item.block_time,
          item.timestamp,
          item.time,
          item.unixTime
        ),
        address: item.address ?? item.tokenAddress ?? item.token_address ?? item.mint ?? null,
        symbol: item.symbol ?? item.tokenSymbol ?? item.token_symbol ?? null,
        amount: pickNumber(
          item.uiAmount,
          item.ui_amount,
          item.amount,
          item.balance,
          item.changeAmount
        ),
        value_usd: pickNumber(item.valueUsd, item.usdValue, item.value, item.amountUsd),
        change_type: item.changeType ?? item.change_type ?? item.direction ?? item.type ?? null
      }))
    })
  }

  async getWalletTransferTotal(
    params: GetWalletTransferTotalParams
  ): Promise<WalletAnalyticsTransferTotal> {
    const raw = await this.post('wallet/v2/transfer/total', { wallet: params.wallet }, params.chain)
    const parsed = BirdeyeWalletTransferTotalResponseSchema.parse(raw)
    const data = parsed.data
    return WalletAnalyticsTransferTotalSchema.parse({
      source: 'birdeye',
      chain: params.chain,
      wallet: params.wallet,
      total_amount: pickNumber(data?.totalAmount, data?.amount, data?.quantity, data?.uiAmount),
      total_value_usd: pickNumber(
        data?.totalValueUsd,
        data?.totalUsd,
        data?.valueUsd,
        data?.usdValue,
        data?.value
      ),
      transfer_count: pickNumber(data?.transferCount, data?.count, data?.totalTransfers),
      unique_counterparties: pickNumber(
        data?.uniqueCounterparties,
        data?.counterpartyCount,
        data?.counterparty_count
      ),
      symbol: data?.symbol ?? data?.tokenSymbol ?? data?.token_symbol ?? null
    })
  }

  async getTokenTransferTotal(
    params: GetTokenTransferTotalParams
  ): Promise<TokenDataTransferTotal> {
    const raw = await this.post(
      'token/v1/transfer/total',
      { token_address: params.address },
      params.chain
    )
    const parsed = BirdeyeTokenTransferTotalResponseSchema.parse(raw)
    const metrics = Object.entries(parsed.data ?? {})
      .filter(
        (entry): entry is [string, number | string] =>
          typeof entry[1] === 'number' || typeof entry[1] === 'string'
      )
      .map(([metric, value]) => ({ metric, value }))
    return TokenDataTransferTotalSchema.parse({
      source: 'birdeye',
      chain: params.chain,
      address: params.address,
      metrics
    })
  }

  private async post(path: string, body: unknown, chain: string): Promise<unknown> {
    if (this.apiKey === '') {
      throw new Error(
        'BIRDEYE_API_KEY is not set — the `token-data` group and the BirdEye-backed `wallet-data` commands are unavailable on this box'
      )
    }
    const url = new URL(path, BIRDEYE_BASE_URL)
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        [BIRDEYE_KEY_HEADER]: this.apiKey,
        [BIRDEYE_CHAIN_HEADER]: chain
      },
      body: ensureJsonTreeString(body)
    })
    if (!response.ok) {
      throw new Error(`BirdEye /${path} failed: ${response.status} ${response.statusText}`)
    }
    const data: unknown = await response.json()
    return data
  }

  private async fetch(
    path: string,
    searchParams: Record<string, string>,
    chain: string
  ): Promise<unknown> {
    if (this.apiKey === '') {
      throw new Error(
        'BIRDEYE_API_KEY is not set — the `token-data` group and the BirdEye-backed `wallet-data` commands are unavailable on this box'
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
      throw new Error(`BirdEye /${path} failed: ${response.status} ${response.statusText}`)
    }
    const data: unknown = await response.json()
    return data
  }
}
