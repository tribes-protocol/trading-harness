/**
 * Shared types for the hyperliquid-status extension.
 *
 * Split from `index.ts` so the renderer in `./render.ts` can import these
 * without dragging the index module's pi-coding-agent runtime imports.
 */

export type Dex = string

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
  readonly killSwitch: boolean
  readonly killSwitchReason: string | null
  readonly clear: boolean
  readonly equityUsd: number | null
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
  readonly error?: string
}
