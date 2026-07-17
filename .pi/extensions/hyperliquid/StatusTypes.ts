/**
 * Shared types for the hyperliquid-status extension.
 *
 * Split from `index.ts` so the renderer in `./Render.ts` can import these
 * without dragging the index module's pi-coding-agent runtime imports.
 */

export type Dex = string

/**
 * The bottom-section tabs, mirroring the CoinGlass Hyperliquid address page:
 * Positions · Balances · Transactions · Open Orders · Deposits & Withdrawals.
 * Perp accounts and spot holdings share the Balances tab.
 */
export type HlTab = 'positions' | 'balances' | 'transactions' | 'orders' | 'deposits'

export interface OpenOrder {
  readonly coin: string
  /** dex-prefixed coin for HIP-3 markets, e.g. `xyz:AAPL`; bare coin otherwise. */
  readonly symbol: string
  readonly side: 'buy' | 'sell'
  readonly size: number
  readonly origSize: number
  readonly limitPrice: number | null
  readonly orderType: string
  readonly reduceOnly: boolean
  readonly isTrigger: boolean
  readonly triggerPrice: number | null
  /** Time-in-force (e.g. `Gtc`, `Alo`, `Ioc`); null when the order carries none. */
  readonly tif: string | null
  /** Placement time in epoch milliseconds. */
  readonly timestamp: number
}

export interface LedgerUpdate {
  /** Update time in epoch milliseconds. */
  readonly time: number
  readonly type: 'deposit' | 'withdraw'
  readonly amountUsd: number
  readonly hash: string | null
}

export interface SpotHolding {
  readonly coin: string
  readonly total: number
  readonly available: number
  readonly entryNotionalUsd: number | null
}

export interface MarketContext {
  readonly markPrice: number | null
  readonly fundingRateHourly: number | null
}

export interface AccountSummary {
  readonly dex: Dex
  readonly equityUsd: number
  readonly withdrawableUsd: number
  readonly grossExposureUsd: number
  readonly marginUsedUsd: number
}

export interface StatusPosition {
  readonly symbol: string
  readonly dex: Dex
  readonly side: 'long' | 'short'
  readonly size: number
  readonly signedSize: number
  readonly notionalUsd: number
  readonly leverage: number | null
  readonly leverageType: string | null
  readonly entryPrice: number | null
  readonly markPrice: number | null
  /** Authoritative liq price from Hyperliquid. Null for cross positions HL deems unreachable. */
  readonly liquidationPrice: number | null
  /**
   * Estimated liq price computed locally for cross positions when HL returns
   * null. Uses the dex-level cross equity + cross maintenance margin and
   * holds every other cross position flat. `null` if data is insufficient
   * or the estimate is unreachable (e.g., < 0 for a long).
   */
  readonly estimatedLiquidationPrice: number | null
  readonly marginUsedUsd: number | null
  readonly unrealizedPnlUsd: number | null
  readonly returnOnEquity: number | null
  readonly fundingRateHourly: number | null
  readonly fundingCostUsdPerDay: number | null
  readonly fundingAprPct: number | null
  readonly recentFeesUsd: number
  readonly recentFundingNetUsd: number
  readonly recentCostUsd: number
}

export interface PositionCostStats {
  readonly feesUsd: number
  readonly fundingNetUsd: number
  readonly netCostUsd: number
  readonly tradedNotionalUsd: number
  readonly fills: number
}

export interface CostSummary {
  readonly lookbackDays: number
  readonly startTime: number
  readonly tradingFeesPaidUsd: number
  readonly fundingPaidUsd: number
  readonly fundingReceivedUsd: number
  readonly fundingNetUsd: number
  readonly netCostUsd: number
  readonly tradedNotionalUsd: number
  readonly feeBpsOnTradedNotional: number | null
  readonly byCoin: Record<string, PositionCostStats>
  readonly error: string | null
}

export interface ClosedTradeStats {
  readonly closedPnlUsd: number
  readonly feesUsd: number
  readonly fills: number
  readonly lastTime: number
}

export interface ClosedPnlSummary {
  readonly lookbackHours: number
  readonly startTime: number
  readonly totalClosedPnlUsd: number
  readonly totalFeesUsd: number
  readonly closingFills: number
  readonly byCoin: Record<string, ClosedTradeStats>
  readonly error: string | null
}

export interface RecentTrade {
  readonly coin: string
  /** Hyperliquid fill direction, e.g. 'Open Long' / 'Close Short'. */
  readonly dir: string
  readonly size: number
  readonly price: number
  /** Fill time in epoch milliseconds. */
  readonly time: number
  readonly closedPnlUsd: number
  /**
   * For a closing fill, how long the position was held before this fill, in
   * milliseconds. Null for opening fills or when it can't be reconstructed
   * from the available history.
   */
  readonly holdMs: number | null
  /**
   * Weighted-average entry price of the position this fill relates to. For a
   * closing fill it's the segment's average entry basis; for an opening fill
   * it's the fill's own price. Null when it can't be reconstructed.
   */
  readonly avgEntryPrice: number | null
  /** Average exit price — the fill price for a closing fill; null for opens. */
  readonly avgExitPrice: number | null
}

export interface HyperliquidStatus {
  readonly ok: boolean
  readonly schema: 'hyperliquid-status.v1'
  readonly updatedAt: string
  readonly mode: 'live'
  readonly user: string | null
  readonly dexes: readonly Dex[]
  readonly accountSource: 'hyperliquid-clearinghouse' | 'unavailable'
  readonly accountError: string | null
  readonly hyperliquidAccounts: readonly AccountSummary[]
  readonly equityUsd: number | null
  readonly spotBalanceUsd: number | null
  readonly withdrawableUsd: number | null
  readonly dailyPnlUsd: number
  readonly dailyPnlPct: number
  readonly allTimePnlUsd: number
  readonly openPositions: number
  readonly grossExposureUsd: number
  readonly netExposureUsd: number
  readonly marginUsedUsd: number | null
  readonly positions: readonly StatusPosition[]
  readonly costSummary: CostSummary | null
  readonly closedPnl24h: ClosedPnlSummary | null
  readonly topCandidates: readonly string[]
  readonly totalTrades: number
  /** Most recent fills, newest first. Shown in the Transactions tab. */
  readonly recentTrades: readonly RecentTrade[]
  /** Resting open orders across all dexes, newest first. Shown in the Open Orders tab. */
  readonly openOrders: readonly OpenOrder[]
  /** Deposits and withdrawals, newest first. Shown in the Deposits tab. */
  readonly ledgerUpdates: readonly LedgerUpdate[]
  /** Non-zero spot token balances. Shown alongside perp accounts in the Balances tab. */
  readonly spotHoldings: readonly SpotHolding[]
  readonly error?: string
  // True while the wallet snapshot (.tribes/privy-wallets.json) hasn't been written
  // yet — the account address is being resolved, not genuinely absent. Drives a
  // "loading" widget state instead of "Missing account address".
  readonly initializing?: boolean
  // True when no agent authorization key is present — the user hasn't logged in.
  // Drives a login-prompt widget state.
  readonly unauthenticated?: boolean
}
