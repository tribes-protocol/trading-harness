import type {
  HyperliquidAddressLeaderboard,
  NansenFlowsWindow,
  NansenFlowTimeframe,
  NansenTokenListTimeframe,
  SmartMoneyDcas,
  SmartMoneyDexTrades,
  SmartMoneyHistoricalHoldings,
  SmartMoneyHoldings,
  SmartMoneyNetflows,
  SmartMoneyPerpTrades,
  SmartMoneyTokenList,
  TokenFlowIntelligence,
  TokenFlows,
  TokenPerpPnlLeaderboard,
  TokenPnlLeaderboard,
  TokenSignals,
  TokenTransfers,
  TokenWhoBoughtSold,
  WalletBalances,
  WalletCounterparties,
  WalletDefiHoldings,
  WalletEntitySearch,
  WalletHistoricalBalances,
  WalletLabels,
  WalletPnlSummary,
  WalletRelatedWallets,
  WalletTransactions
} from '@/types/Nansen'
import {
  HyperliquidAddressLeaderboardSchema,
  NansenAddressLeaderboardResponseSchema,
  NansenBalancesResponseSchema,
  NansenCounterpartiesResponseSchema,
  NansenDcasResponseSchema,
  NansenDefiHoldingsResponseSchema,
  NansenDexTradesResponseSchema,
  NansenEntitySearchResponseSchema,
  NansenFlowIntelligenceResponseSchema,
  NansenFlowsResponseSchema,
  NansenHistoricalBalancesResponseSchema,
  NansenHistoricalHoldingsResponseSchema,
  NansenHoldingsResponseSchema,
  NansenIndicatorsResponseSchema,
  NansenLabelsResponseSchema,
  NansenNetflowResponseSchema,
  NansenPerpPnlLeaderboardResponseSchema,
  NansenPerpTradesResponseSchema,
  NansenPnlLeaderboardResponseSchema,
  NansenPnlSummaryResponseSchema,
  NansenRelatedWalletsResponseSchema,
  NansenTokenScreenerResponseSchema,
  NansenTransactionsResponseSchema,
  NansenTransfersResponseSchema,
  NansenWhoBoughtSoldResponseSchema,
  SmartMoneyDcasSchema,
  SmartMoneyDexTradesSchema,
  SmartMoneyHistoricalHoldingsSchema,
  SmartMoneyHoldingsSchema,
  SmartMoneyNetflowsSchema,
  SmartMoneyPerpTradesSchema,
  SmartMoneyTokenListSchema,
  TokenFlowIntelligenceSchema,
  TokenFlowsSchema,
  TokenPerpPnlLeaderboardSchema,
  TokenPnlLeaderboardSchema,
  TokenSignalsSchema,
  TokenTransfersSchema,
  TokenWhoBoughtSoldSchema,
  WalletBalancesSchema,
  WalletCounterpartiesSchema,
  WalletDefiHoldingsSchema,
  WalletEntitySearchSchema,
  WalletHistoricalBalancesSchema,
  WalletLabelsSchema,
  WalletPnlSummarySchema,
  WalletRelatedWalletsSchema,
  WalletTransactionsSchema
} from '@/types/Nansen'
import { ensureJsonTreeString, isNullish } from '@/utils/Lang'

type NansenServiceParams = {
  readonly apiKey: string
}

type GetNetflowParams = {
  readonly chain: string
  readonly limit: number
  readonly tokenAddress: string | null
}

type GetHoldingsParams = {
  readonly chain: string
  readonly limit: number
  readonly tokenAddress: string | null
}

type GetDexTradesParams = {
  readonly chain: string
  readonly limit: number
  readonly tokenAddress: string | null
}

type GetPerpTradesParams = {
  readonly limit: number
  readonly tokenSymbol: string | null
}

type GetDcasParams = {
  readonly limit: number
  readonly outputTokenSymbol: string | null
}

type GetTokenListParams = {
  readonly chain: string
  readonly limit: number
  readonly timeframe: NansenTokenListTimeframe
}

type GetFlowIntelligenceParams = {
  readonly chain: string
  readonly tokenAddress: string
  readonly timeframe: NansenFlowTimeframe
}

type GetPnlLeaderboardParams = {
  readonly chain: string
  readonly tokenAddress: string
  readonly limit: number
}

type GetBalancesParams = {
  readonly wallet: string
  readonly chain: string
}

type GetLabelsParams = {
  readonly wallet: string
  readonly chain: string
}

type GetCounterpartiesParams = {
  readonly wallet: string
  readonly chain: string
  readonly limit: number
}

type GetTransactionsParams = {
  readonly wallet: string
  readonly chain: string
  readonly limit: number
}

type GetRelatedWalletsParams = {
  readonly wallet: string
  readonly chain: string
}

type GetPnlSummaryParams = {
  readonly wallet: string
  readonly chain: string
}

type GetScreenerParams = {
  readonly chain: string
  readonly limit: number
  readonly timeframe: NansenTokenListTimeframe
}

type GetFlowsParams = {
  readonly chain: string
  readonly tokenAddress: string
  readonly timeframe: NansenFlowsWindow
}

type GetWhoBoughtSoldParams = {
  readonly chain: string
  readonly tokenAddress: string
  readonly limit: number
}

type GetSignalsParams = {
  readonly chain: string
  readonly tokenAddress: string
}

type GetTransfersParams = {
  readonly chain: string
  readonly tokenAddress: string
  readonly limit: number
}

type GetHistoricalHoldingsParams = {
  readonly chain: string
  readonly limit: number
  readonly tokenAddress: string | null
}

type GetPerpPnlLeaderboardParams = {
  readonly tokenSymbol: string
  readonly limit: number
}

type GetAddressLeaderboardParams = {
  readonly limit: number
}

type GetHistoricalBalancesParams = {
  readonly wallet: string
  readonly chain: string
  readonly limit: number
}

type GetDefiHoldingsParams = {
  readonly wallet: string
}

type GetEntitySearchParams = {
  readonly query: string
}

const NANSEN_BASE_URL = 'https://api.nansen.ai'
const NANSEN_KEY_HEADER = 'apiKey'
const ERROR_BODY_MAX_CHARS = 300
const LOOKBACK_DAYS = 30
const MS_PER_DAY = 24 * 60 * 60 * 1000
const FLOWS_WINDOW_DAYS: Record<NansenFlowsWindow, number> = { '1d': 1, '7d': 7, '30d': 30 }

export class NansenService {
  private readonly apiKey: string

  constructor(params: NansenServiceParams) {
    this.apiKey = params.apiKey
  }

  async getNetflow(params: GetNetflowParams): Promise<SmartMoneyNetflows> {
    const body: Record<string, unknown> = {
      chains: [params.chain],
      pagination: { page: 1, per_page: params.limit },
      order_by: [{ field: 'net_flow_24h_usd', direction: 'DESC' }]
    }
    if (!isNullish(params.tokenAddress)) {
      body.filters = { token_address: params.tokenAddress }
    }
    const raw = await this.post('/api/v1/smart-money/netflow', body)
    const parsed = NansenNetflowResponseSchema.parse(raw)
    return SmartMoneyNetflowsSchema.parse({
      source: 'nansen',
      chain: params.chain,
      tokens: (parsed.data ?? []).map((row) => ({
        chain: row.chain,
        address: row.token_address,
        symbol: row.token_symbol,
        sectors: row.token_sectors ?? [],
        netflow_1h_usd: this.asFiniteNumber(row.net_flow_1h_usd),
        netflow_24h_usd: this.asFiniteNumber(row.net_flow_24h_usd),
        netflow_7d_usd: this.asFiniteNumber(row.net_flow_7d_usd),
        netflow_30d_usd: this.asFiniteNumber(row.net_flow_30d_usd),
        trader_count: row.trader_count,
        token_age_days: row.token_age_days,
        market_cap_usd: this.asFiniteNumber(row.market_cap_usd)
      }))
    })
  }

  async getHoldings(params: GetHoldingsParams): Promise<SmartMoneyHoldings> {
    const body: Record<string, unknown> = {
      chains: [params.chain],
      pagination: { page: 1, per_page: params.limit },
      order_by: [{ field: 'value_usd', direction: 'DESC' }]
    }
    if (!isNullish(params.tokenAddress)) {
      body.filters = { token_address: params.tokenAddress }
    }
    const raw = await this.post('/api/v1/smart-money/holdings', body)
    const parsed = NansenHoldingsResponseSchema.parse(raw)
    return SmartMoneyHoldingsSchema.parse({
      source: 'nansen',
      chain: params.chain,
      holdings: (parsed.data ?? []).map((row) => ({
        chain: row.chain,
        address: row.token_address,
        symbol: row.token_symbol,
        sectors: row.token_sectors ?? [],
        value_usd: this.asFiniteNumber(row.value_usd),
        balance_change_24h_pct: row.balance_24h_percent_change,
        holders_count: row.holders_count,
        share_of_holdings_pct: row.share_of_holdings_percent,
        token_age_days: row.token_age_days,
        market_cap_usd: this.asFiniteNumber(row.market_cap_usd)
      }))
    })
  }

  async getDexTrades(params: GetDexTradesParams): Promise<SmartMoneyDexTrades> {
    const body: Record<string, unknown> = {
      chains: [params.chain],
      pagination: { page: 1, per_page: params.limit },
      order_by: [{ field: 'block_timestamp', direction: 'DESC' }]
    }
    if (!isNullish(params.tokenAddress)) {
      body.filters = { token_bought_address: params.tokenAddress }
    }
    const raw = await this.post('/api/v1/smart-money/dex-trades', body)
    const parsed = NansenDexTradesResponseSchema.parse(raw)
    return SmartMoneyDexTradesSchema.parse({
      source: 'nansen',
      chain: params.chain,
      trades: (parsed.data ?? []).map((row) => ({
        chain: row.chain,
        time: row.block_timestamp,
        trader: row.trader_address,
        trader_label: row.trader_address_label,
        bought_symbol: row.token_bought_symbol,
        bought_address: row.token_bought_address,
        bought_amount: row.token_bought_amount,
        sold_symbol: row.token_sold_symbol,
        sold_address: row.token_sold_address,
        sold_amount: row.token_sold_amount,
        value_usd: this.asFiniteNumber(row.trade_value_usd)
      }))
    })
  }

  async getPerpTrades(params: GetPerpTradesParams): Promise<SmartMoneyPerpTrades> {
    const body: Record<string, unknown> = {
      pagination: { page: 1, per_page: params.limit },
      order_by: [{ field: 'block_timestamp', direction: 'DESC' }]
    }
    if (!isNullish(params.tokenSymbol)) {
      body.filters = { token_symbol: params.tokenSymbol }
    }
    const raw = await this.post('/api/v1/smart-money/perp-trades', body)
    const parsed = NansenPerpTradesResponseSchema.parse(raw)
    return SmartMoneyPerpTradesSchema.parse({
      source: 'nansen',
      trades: (parsed.data ?? []).map((row) => ({
        time: row.block_timestamp,
        trader: row.trader_address,
        trader_label: row.trader_address_label,
        symbol: row.token_symbol,
        side: row.side,
        action: row.action,
        type: row.type,
        amount: row.token_amount,
        price_usd: this.asFiniteNumber(row.price_usd),
        value_usd: this.asFiniteNumber(row.value_usd)
      }))
    })
  }

  async getDcas(params: GetDcasParams): Promise<SmartMoneyDcas> {
    const body: Record<string, unknown> = {
      pagination: { page: 1, per_page: params.limit },
      order_by: [{ field: 'dca_created_at', direction: 'DESC' }]
    }
    if (!isNullish(params.outputTokenSymbol)) {
      body.filters = { output_token_symbol: params.outputTokenSymbol }
    }
    const raw = await this.post('/api/v1/smart-money/dcas', body)
    const parsed = NansenDcasResponseSchema.parse(raw)
    return SmartMoneyDcasSchema.parse({
      source: 'nansen',
      dcas: (parsed.data ?? []).map((row) => ({
        created_at: row.dca_created_at,
        updated_at: row.dca_updated_at,
        trader: row.trader_address,
        trader_label: row.trader_address_label,
        status: row.dca_status,
        input_symbol: row.input_token_symbol,
        output_symbol: row.output_token_symbol,
        deposit_amount: row.deposit_token_amount,
        spent_amount: row.token_spent_amount,
        redeemed_amount: row.output_token_redeemed_amount,
        deposit_value_usd: this.asFiniteNumber(row.deposit_value_usd)
      }))
    })
  }

  async getTokenList(params: GetTokenListParams): Promise<SmartMoneyTokenList> {
    const raw = await this.post('/api/v1/token-screener', {
      chains: [params.chain],
      timeframe: params.timeframe,
      pagination: { page: 1, per_page: params.limit },
      filters: { only_smart_money: true },
      order_by: [{ field: 'volume', direction: 'DESC' }]
    })
    const parsed = NansenTokenScreenerResponseSchema.parse(raw)
    return SmartMoneyTokenListSchema.parse({
      source: 'nansen',
      chain: params.chain,
      timeframe: params.timeframe,
      tokens: (parsed.data ?? []).map((row) => ({
        chain: row.chain,
        address: row.token_address,
        symbol: row.token_symbol,
        price_usd: this.asFiniteNumber(row.price_usd),
        price_change_pct: row.price_change,
        market_cap_usd: this.asFiniteNumber(row.market_cap_usd),
        liquidity_usd: row.liquidity,
        volume_usd: row.volume,
        buy_volume_usd: row.buy_volume,
        sell_volume_usd: row.sell_volume,
        netflow_usd: row.netflow,
        traders: row.nof_traders,
        buyers: row.nof_buyers,
        sellers: row.nof_sellers,
        token_age_days: row.token_age_days
      }))
    })
  }

  async getFlowIntelligence(params: GetFlowIntelligenceParams): Promise<TokenFlowIntelligence> {
    const raw = await this.post('/api/v1/tgm/flow-intelligence', {
      chain: params.chain,
      token_address: params.tokenAddress,
      timeframe: params.timeframe
    })
    const parsed = NansenFlowIntelligenceResponseSchema.parse(raw)
    return TokenFlowIntelligenceSchema.parse({
      source: 'nansen',
      chain: params.chain,
      token: params.tokenAddress,
      timeframe: params.timeframe,
      flows: (parsed.data ?? []).map((row) => ({
        smart_trader_netflow_usd: this.asFiniteNumber(row.smart_trader_net_flow_usd),
        smart_trader_wallets: row.smart_trader_wallet_count,
        whale_netflow_usd: this.asFiniteNumber(row.whale_net_flow_usd),
        whale_wallets: row.whale_wallet_count,
        public_figure_netflow_usd: this.asFiniteNumber(row.public_figure_net_flow_usd),
        public_figure_wallets: row.public_figure_wallet_count,
        top_pnl_netflow_usd: this.asFiniteNumber(row.top_pnl_net_flow_usd),
        top_pnl_wallets: row.top_pnl_wallet_count,
        exchange_netflow_usd: this.asFiniteNumber(row.exchange_net_flow_usd),
        exchange_wallets: row.exchange_wallet_count,
        fresh_wallet_netflow_usd: this.asFiniteNumber(row.fresh_wallets_net_flow_usd),
        fresh_wallet_wallets: row.fresh_wallets_wallet_count
      }))
    })
  }

  async getPnlLeaderboard(params: GetPnlLeaderboardParams): Promise<TokenPnlLeaderboard> {
    const raw = await this.post('/api/v1/tgm/pnl-leaderboard', {
      chain: params.chain,
      token_address: params.tokenAddress,
      date: this.lookbackDateRange(),
      pagination: { page: 1, per_page: params.limit },
      order_by: [{ field: 'pnl_usd_total', direction: 'DESC' }]
    })
    const parsed = NansenPnlLeaderboardResponseSchema.parse(raw)
    return TokenPnlLeaderboardSchema.parse({
      source: 'nansen',
      chain: params.chain,
      token: params.tokenAddress,
      traders: (parsed.data ?? []).map((row) => ({
        address: row.trader_address,
        label: row.trader_address_label,
        pnl_total_usd: this.asFiniteNumber(row.pnl_usd_total),
        pnl_realized_usd: this.asFiniteNumber(row.pnl_usd_realised),
        pnl_unrealized_usd: this.asFiniteNumber(row.pnl_usd_unrealised),
        roi_total_pct: row.roi_percent_total,
        holding_usd: this.asFiniteNumber(row.holding_usd),
        trade_count: row.nof_trades
      }))
    })
  }

  async getBalances(params: GetBalancesParams): Promise<WalletBalances> {
    const raw = await this.post('/api/v1/profiler/address/current-balance', {
      address: params.wallet,
      chain: params.chain,
      hide_spam_token: true,
      order_by: [{ field: 'value_usd', direction: 'DESC' }]
    })
    const parsed = NansenBalancesResponseSchema.parse(raw)
    return WalletBalancesSchema.parse({
      source: 'nansen',
      wallet: params.wallet,
      chain: params.chain,
      balances: (parsed.data ?? []).map((row) => ({
        chain: row.chain,
        token_address: row.token_address,
        symbol: row.token_symbol,
        amount: row.token_amount,
        price_usd: this.asFiniteNumber(row.price_usd),
        value_usd: this.asFiniteNumber(row.value_usd)
      }))
    })
  }

  async getLabels(params: GetLabelsParams): Promise<WalletLabels> {
    const raw = await this.post('/api/v1/profiler/address/labels', {
      address: params.wallet,
      chain: params.chain
    })
    const parsed = NansenLabelsResponseSchema.parse(raw)
    return WalletLabelsSchema.parse({
      source: 'nansen',
      wallet: params.wallet,
      chain: params.chain,
      labels: (parsed.data ?? []).map((row) => ({
        label: row.label,
        category: row.category
      }))
    })
  }

  async getCounterparties(params: GetCounterpartiesParams): Promise<WalletCounterparties> {
    const raw = await this.post('/api/v1/profiler/address/counterparties', {
      address: params.wallet,
      chain: params.chain,
      date: this.lookbackDateRange(),
      pagination: { page: 1, per_page: params.limit },
      order_by: [{ field: 'total_volume_usd', direction: 'DESC' }]
    })
    const parsed = NansenCounterpartiesResponseSchema.parse(raw)
    return WalletCounterpartiesSchema.parse({
      source: 'nansen',
      wallet: params.wallet,
      chain: params.chain,
      counterparties: (parsed.data ?? []).map((row) => ({
        address: row.counterparty_address,
        labels: row.counterparty_address_label ?? [],
        interaction_count: row.interaction_count,
        volume_usd: this.asFiniteNumber(row.total_volume_usd),
        volume_in_usd: this.asFiniteNumber(row.volume_in_usd),
        volume_out_usd: this.asFiniteNumber(row.volume_out_usd)
      }))
    })
  }

  async getTransactions(params: GetTransactionsParams): Promise<WalletTransactions> {
    const raw = await this.post('/api/v1/profiler/address/transactions', {
      address: params.wallet,
      chain: params.chain,
      date: this.lookbackDateRange(),
      hide_spam_token: true,
      pagination: { page: 1, per_page: params.limit },
      order_by: [{ field: 'block_timestamp', direction: 'DESC' }]
    })
    const parsed = NansenTransactionsResponseSchema.parse(raw)
    return WalletTransactionsSchema.parse({
      source: 'nansen',
      wallet: params.wallet,
      chain: params.chain,
      transactions: (parsed.data ?? []).map((row) => ({
        chain: row.chain,
        time: row.block_timestamp,
        tx_hash: row.transaction_hash,
        method: row.method,
        volume_usd: this.asFiniteNumber(row.volume_usd),
        sent: (row.tokens_sent ?? []).map((token) => ({
          symbol: token.token_symbol,
          amount: token.token_amount,
          value_usd: this.asFiniteNumber(token.value_usd)
        })),
        received: (row.tokens_received ?? []).map((token) => ({
          symbol: token.token_symbol,
          amount: token.token_amount,
          value_usd: this.asFiniteNumber(token.value_usd)
        }))
      }))
    })
  }

  async getRelatedWallets(params: GetRelatedWalletsParams): Promise<WalletRelatedWallets> {
    const raw = await this.post('/api/v1/profiler/address/related-wallets', {
      address: params.wallet,
      chain: params.chain
    })
    const parsed = NansenRelatedWalletsResponseSchema.parse(raw)
    return WalletRelatedWalletsSchema.parse({
      source: 'nansen',
      wallet: params.wallet,
      chain: params.chain,
      wallets: (parsed.data ?? []).map((row) => ({
        address: row.address,
        label: row.address_label,
        relation: row.relation
      }))
    })
  }

  async getPnlSummary(params: GetPnlSummaryParams): Promise<WalletPnlSummary> {
    const raw = await this.post('/api/v1/profiler/address/pnl-summary', {
      address: params.wallet,
      chain: params.chain,
      date: this.lookbackDateRange()
    })
    const parsed = NansenPnlSummaryResponseSchema.parse(raw)
    return WalletPnlSummarySchema.parse({
      source: 'nansen',
      wallet: params.wallet,
      chain: params.chain,
      realized_pnl_usd: this.asFiniteNumber(parsed.realized_pnl_usd),
      realized_pnl_pct: parsed.realized_pnl_percent,
      win_rate: parsed.win_rate,
      traded_token_count: parsed.traded_token_count,
      trade_count: parsed.traded_times,
      top_tokens: (parsed.top5_tokens ?? []).map((row) => ({
        chain: row.chain,
        address: row.token_address,
        symbol: row.token_symbol,
        realized_pnl_usd: this.asFiniteNumber(row.realized_pnl),
        realized_roi_pct: row.realized_roi
      }))
    })
  }

  async getScreener(params: GetScreenerParams): Promise<SmartMoneyTokenList> {
    const raw = await this.post('/api/v1/token-screener', {
      chains: [params.chain],
      timeframe: params.timeframe,
      pagination: { page: 1, per_page: params.limit },
      order_by: [{ field: 'volume', direction: 'DESC' }]
    })
    const parsed = NansenTokenScreenerResponseSchema.parse(raw)
    return SmartMoneyTokenListSchema.parse({
      source: 'nansen',
      chain: params.chain,
      timeframe: params.timeframe,
      tokens: (parsed.data ?? []).map((row) => ({
        chain: row.chain,
        address: row.token_address,
        symbol: row.token_symbol,
        price_usd: this.asFiniteNumber(row.price_usd),
        price_change_pct: row.price_change,
        market_cap_usd: this.asFiniteNumber(row.market_cap_usd),
        liquidity_usd: row.liquidity,
        volume_usd: row.volume,
        buy_volume_usd: row.buy_volume,
        sell_volume_usd: row.sell_volume,
        netflow_usd: row.netflow,
        traders: row.nof_traders,
        buyers: row.nof_buyers,
        sellers: row.nof_sellers,
        token_age_days: row.token_age_days
      }))
    })
  }

  async getFlows(params: GetFlowsParams): Promise<TokenFlows> {
    const raw = await this.post('/api/v1/tgm/flows', {
      chain: params.chain,
      token_address: params.tokenAddress,
      date: this.lookbackRange(FLOWS_WINDOW_DAYS[params.timeframe]),
      order_by: [{ field: 'date', direction: 'DESC' }]
    })
    const parsed = NansenFlowsResponseSchema.parse(raw)
    return TokenFlowsSchema.parse({
      source: 'nansen',
      chain: params.chain,
      token: params.tokenAddress,
      timeframe: params.timeframe,
      flows: (parsed.data ?? []).map((row) => ({
        date: row.date,
        price_usd: this.asFiniteNumber(row.price_usd),
        value_usd: this.asFiniteNumber(row.value_usd),
        holders_count: row.holders_count,
        inflows_count: row.total_inflows_count,
        outflows_count: row.total_outflows_count,
        inflows_dex: row.total_inflows_dex,
        outflows_dex: row.total_outflows_dex,
        inflows_cex: row.total_inflows_cex,
        outflows_cex: row.total_outflows_cex
      }))
    })
  }

  async getWhoBoughtSold(params: GetWhoBoughtSoldParams): Promise<TokenWhoBoughtSold> {
    const raw = await this.post('/api/v1/tgm/who-bought-sold', {
      chain: params.chain,
      token_address: params.tokenAddress,
      date: this.lookbackDateRange(),
      pagination: { page: 1, per_page: params.limit },
      order_by: [{ field: 'trade_volume_usd', direction: 'DESC' }]
    })
    const parsed = NansenWhoBoughtSoldResponseSchema.parse(raw)
    return TokenWhoBoughtSoldSchema.parse({
      source: 'nansen',
      chain: params.chain,
      token: params.tokenAddress,
      traders: (parsed.data ?? []).map((row) => ({
        address: row.address,
        label: row.address_label,
        bought_amount: row.bought_token_volume,
        sold_amount: row.sold_token_volume,
        bought_usd: this.asFiniteNumber(row.bought_volume_usd),
        sold_usd: this.asFiniteNumber(row.sold_volume_usd),
        trade_usd: this.asFiniteNumber(row.trade_volume_usd)
      }))
    })
  }

  async getSignals(params: GetSignalsParams): Promise<TokenSignals> {
    const raw = await this.post('/api/v1/tgm/indicators', {
      chain: params.chain,
      token_address: params.tokenAddress
    })
    const parsed = NansenIndicatorsResponseSchema.parse(raw)
    const toSignal = (row: {
      indicator_type: string
      score?: string | null
      signal?: number | null
      last_trigger_on?: string | null
    }): Record<string, unknown> => ({
      indicator: row.indicator_type,
      score: row.score,
      signal: row.signal,
      last_trigger_on: row.last_trigger_on
    })
    return TokenSignalsSchema.parse({
      source: 'nansen',
      chain: params.chain,
      token: params.tokenAddress,
      risk: (parsed.risk_indicators ?? []).map(toSignal),
      reward: (parsed.reward_indicators ?? []).map(toSignal)
    })
  }

  async getTransfers(params: GetTransfersParams): Promise<TokenTransfers> {
    const raw = await this.post('/api/v1/tgm/transfers', {
      chain: params.chain,
      token_address: params.tokenAddress,
      date: this.lookbackDateRange(),
      pagination: { page: 1, per_page: params.limit },
      order_by: [{ field: 'block_timestamp', direction: 'DESC' }]
    })
    const parsed = NansenTransfersResponseSchema.parse(raw)
    return TokenTransfersSchema.parse({
      source: 'nansen',
      chain: params.chain,
      token: params.tokenAddress,
      transfers: (parsed.data ?? []).map((row) => ({
        time: row.block_timestamp,
        tx_hash: row.transaction_hash,
        from: row.from_address,
        from_label: row.from_address_label,
        to: row.to_address,
        to_label: row.to_address_label,
        amount: row.transfer_amount,
        value_usd: this.asFiniteNumber(row.transfer_value_usd)
      }))
    })
  }

  async getHistoricalHoldings(
    params: GetHistoricalHoldingsParams
  ): Promise<SmartMoneyHistoricalHoldings> {
    const body: Record<string, unknown> = {
      chains: [params.chain],
      date_range: this.lookbackDateRange(),
      pagination: { page: 1, per_page: params.limit },
      order_by: [{ field: 'date', direction: 'DESC' }]
    }
    if (!isNullish(params.tokenAddress)) {
      body.filters = { token_address: params.tokenAddress }
    }
    const raw = await this.post('/api/v1/smart-money/historical-holdings', body)
    const parsed = NansenHistoricalHoldingsResponseSchema.parse(raw)
    return SmartMoneyHistoricalHoldingsSchema.parse({
      source: 'nansen',
      chain: params.chain,
      holdings: (parsed.data ?? []).map((row) => ({
        date: row.date,
        chain: row.chain,
        address: row.token_address,
        symbol: row.token_symbol,
        balance: row.balance,
        value_usd: this.asFiniteNumber(row.value_usd),
        holders_count: row.holders_count,
        share_of_holdings_pct: row.share_of_holdings_percent,
        market_cap_usd: this.asFiniteNumber(row.market_cap_usd)
      }))
    })
  }

  async getPerpPnlLeaderboard(
    params: GetPerpPnlLeaderboardParams
  ): Promise<TokenPerpPnlLeaderboard> {
    const raw = await this.post('/api/v1/tgm/perp-pnl-leaderboard', {
      token_symbol: params.tokenSymbol,
      date: this.lookbackDateRange(),
      pagination: { page: 1, per_page: params.limit },
      order_by: [{ field: 'pnl_usd_total', direction: 'DESC' }]
    })
    const parsed = NansenPerpPnlLeaderboardResponseSchema.parse(raw)
    return TokenPerpPnlLeaderboardSchema.parse({
      source: 'nansen',
      token: params.tokenSymbol,
      traders: (parsed.data ?? []).map((row) => ({
        address: row.trader_address,
        label: row.trader_address_label,
        pnl_total_usd: this.asFiniteNumber(row.pnl_usd_total),
        pnl_realized_usd: this.asFiniteNumber(row.pnl_usd_realised),
        pnl_unrealized_usd: this.asFiniteNumber(row.pnl_usd_unrealised),
        roi_total_pct: row.roi_percent_total,
        position_value_usd: this.asFiniteNumber(row.position_value_usd),
        trade_count: row.nof_trades
      }))
    })
  }

  async getAddressLeaderboard(
    params: GetAddressLeaderboardParams
  ): Promise<HyperliquidAddressLeaderboard> {
    const raw = await this.post('/api/v1/perp-leaderboard', {
      date: this.lookbackDateRange(),
      pagination: { page: 1, per_page: params.limit },
      order_by: [{ field: 'total_pnl', direction: 'DESC' }]
    })
    const parsed = NansenAddressLeaderboardResponseSchema.parse(raw)
    return HyperliquidAddressLeaderboardSchema.parse({
      source: 'nansen',
      traders: (parsed.data ?? []).map((row) => ({
        address: row.trader_address,
        label: row.trader_address_label,
        total_pnl_usd: this.asFiniteNumber(row.total_pnl),
        roi_pct: row.roi,
        account_value_usd: this.asFiniteNumber(row.account_value)
      }))
    })
  }

  async getHistoricalBalances(
    params: GetHistoricalBalancesParams
  ): Promise<WalletHistoricalBalances> {
    const raw = await this.post('/api/v1/profiler/address/historical-balances', {
      address: params.wallet,
      chain: params.chain,
      date: this.lookbackDateRange(),
      filters: { hide_spam_tokens: true },
      pagination: { page: 1, per_page: params.limit },
      order_by: [{ field: 'block_timestamp', direction: 'DESC' }]
    })
    const parsed = NansenHistoricalBalancesResponseSchema.parse(raw)
    return WalletHistoricalBalancesSchema.parse({
      source: 'nansen',
      wallet: params.wallet,
      chain: params.chain,
      balances: (parsed.data ?? []).map((row) => ({
        time: row.block_timestamp,
        chain: row.chain,
        token_address: row.token_address,
        symbol: row.token_symbol,
        amount: row.token_amount,
        value_usd: this.asFiniteNumber(row.value_usd)
      }))
    })
  }

  async getDefiHoldings(params: GetDefiHoldingsParams): Promise<WalletDefiHoldings> {
    const raw = await this.post('/api/v1/portfolio/defi-holdings', {
      wallet_address: params.wallet
    })
    const parsed = NansenDefiHoldingsResponseSchema.parse(raw)
    return WalletDefiHoldingsSchema.parse({
      source: 'nansen',
      wallet: params.wallet,
      total_value_usd: this.asFiniteNumber(parsed.summary?.total_value_usd),
      total_assets_usd: this.asFiniteNumber(parsed.summary?.total_assets_usd),
      total_debts_usd: this.asFiniteNumber(parsed.summary?.total_debts_usd),
      total_rewards_usd: this.asFiniteNumber(parsed.summary?.total_rewards_usd),
      protocol_count: parsed.summary?.protocol_count,
      token_count: parsed.summary?.token_count,
      protocols: (parsed.protocols ?? []).map((row) => ({
        protocol: row.protocol_name,
        chain: row.chain,
        value_usd: this.asFiniteNumber(row.total_value_usd),
        assets_usd: this.asFiniteNumber(row.total_assets_usd),
        debts_usd: this.asFiniteNumber(row.total_debts_usd),
        rewards_usd: this.asFiniteNumber(row.total_rewards_usd),
        tokens: (row.tokens ?? []).map((token) => ({
          symbol: token.symbol,
          position_type: token.position_type,
          amount: token.amount,
          value_usd: this.asFiniteNumber(token.value_usd)
        }))
      }))
    })
  }

  async getEntitySearch(params: GetEntitySearchParams): Promise<WalletEntitySearch> {
    const raw = await this.post('/api/v1/search/entity-name', { search_query: params.query })
    const parsed = NansenEntitySearchResponseSchema.parse(raw)
    return WalletEntitySearchSchema.parse({
      source: 'nansen',
      query: params.query,
      entities: (parsed.data ?? []).map((row) => row.entity_name)
    })
  }

  private async post(path: string, body: Record<string, unknown>): Promise<unknown> {
    if (this.apiKey === '') {
      throw new Error(
        'NANSEN_API_KEY is not set — the `smart-money` and `wallet-data` command groups are unavailable on this box'
      )
    }
    const url = new URL(path, NANSEN_BASE_URL)
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        [NANSEN_KEY_HEADER]: this.apiKey
      },
      body: ensureJsonTreeString(body)
    })
    if (!response.ok) {
      const errorBody = await response.text().catch(() => '')
      throw new Error(
        `Nansen ${path} failed: ${response.status} ${response.statusText} ${errorBody.slice(0, ERROR_BODY_MAX_CHARS)}`
      )
    }
    const data: unknown = await response.json()
    return data
  }

  // Nansen date-scoped endpoints require an explicit range; the harness always
  // queries the trailing window.
  private lookbackDateRange(): { from: string; to: string } {
    const now = Date.now()
    return {
      from: new Date(now - LOOKBACK_DAYS * MS_PER_DAY).toISOString().slice(0, 10),
      to: new Date(now).toISOString().slice(0, 10)
    }
  }

  private lookbackRange(days: number): { from: string; to: string } {
    const now = Date.now()
    return {
      from: new Date(now - days * MS_PER_DAY).toISOString().slice(0, 10),
      to: new Date(now).toISOString().slice(0, 10)
    }
  }

  // Accepts Nansen's mixed numeric encodings (large USD figures arrive as
  // decimal strings, others as numbers); anything non-finite collapses to null.
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
