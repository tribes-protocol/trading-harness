import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import type { ExtensionAPI, ExtensionContext, Theme } from '@earendil-works/pi-coding-agent'
import type { TUI } from '@earendil-works/pi-tui'

import { ensureJsonTreeString } from './EnsureJson.ts'
import { type CrossBucket, estimateCrossLiquidationPx } from './LiqEstimator.ts'
import { renderHyperliquidPositionsWidget } from './Render.ts'
import type {
  AccountSummary,
  ClosedPnlSummary,
  ClosedTradeStats,
  CostSummary,
  HyperliquidStatus,
  MarketContext,
  PositionCostStats,
  RecentTrade,
  StatusPosition
} from './StatusTypes.ts'

const RUNTIME_STATUS_DIR = 'runtime/hyperliquid'
const STATUS_FILE = 'live-status.json'
const KILL_SWITCH_FILE = 'kill-switch.enabled'
const DEFAULT_DEXES = ['', 'xyz'] as const
const COST_LOOKBACK_DAYS = 7
const CLOSED_PNL_LOOKBACK_HOURS = 24
const RECENT_TRADES_LIMIT = 2
const HYPERLIQUID_INFO_URL = 'https://api.hyperliquid.xyz/info'

// Types live in ./types.ts; renderer in ./Render.ts. CrossBucket +
// estimateCrossLiquidationPx live in ./LiqEstimator.ts so they can be
// unit-tested without dragging in the pi-coding-agent runtime imports
// this file pulls in.

async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true })
}

async function readText(path: string, fallback = ''): Promise<string> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return fallback
  }
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const parsed: T = JSON.parse(await readFile(path, 'utf8'))
    return parsed
  } catch {
    return fallback
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await ensureDir(dirname(path))
  await writeFile(path, `${ensureJsonTreeString(value)}\n`, 'utf8')
}

function safeNumber(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function firstLine(text: string): string | null {
  return (
    text
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .find(Boolean) ?? null
  )
}

// 'pending'  — the wallet snapshot file isn't on disk yet (warmed async at
//              startup); the address is loading, not absent.
// 'missing'  — the snapshot exists but holds no usable EVM address.
// 'ready'    — resolved address.
type AccountState =
  | { readonly kind: 'ready'; readonly address: string }
  | { readonly kind: 'pending' }
  | { readonly kind: 'missing' }

async function resolveAccountState(cwd: string): Promise<AccountState> {
  // .tribes/privy-wallets.json is written by the tribes wallet-snapshot warmup
  // (`tribes-cli wallet list`), which runs a beat AFTER session start — so an
  // absent/unreadable file means "still loading", not "no account".
  let raw: string
  try {
    raw = await readFile(resolve(cwd, '.tribes/privy-wallets.json'), 'utf8')
  } catch {
    return { kind: 'pending' }
  }
  let wallets: unknown
  try {
    wallets = JSON.parse(raw)
  } catch {
    return { kind: 'pending' }
  }
  // Array of wallet pairs from the wallet CLI (`evmWalletAddress` + `solWalletAddress`).
  if (Array.isArray(wallets)) {
    for (const row of wallets) {
      if (!isRecord(row)) continue
      const wallet = row.evmWalletAddress
      if (typeof wallet === 'string' && /^0x[0-9a-fA-F]{40}$/u.test(wallet)) {
        return { kind: 'ready', address: wallet }
      }
    }
  }
  return { kind: 'missing' }
}

async function hyperliquidInfo<T>(
  body: { type: string } & Record<string, unknown>,
  options: { cacheTtlMs?: number } = {}
): Promise<T> {
  return await infoRequest<T>(body, options)
}

async function infoRequest<T>(
  body: { type: string } & Record<string, unknown>,
  _options: { cacheTtlMs?: number } = {}
): Promise<T> {
  const response = await fetch(HYPERLIQUID_INFO_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: ensureJsonTreeString(body)
  })
  const text = await response.text()
  const parsed: unknown = text.length > 0 ? JSON.parse(text) : null
  if (!response.ok) {
    throw new Error(`Hyperliquid info ${response.status}: ${ensureJsonTreeString(parsed)}`)
  }
  const normalized: T = JSON.parse(ensureJsonTreeString(parsed))
  return normalized
}

function resolveStatusDir(cwd: string): string {
  return resolve(cwd, RUNTIME_STATUS_DIR)
}

function resolveStatusPath(cwd: string): string {
  return resolve(resolveStatusDir(cwd), STATUS_FILE)
}

function resolveKillSwitchPath(cwd: string): string {
  return resolve(resolveStatusDir(cwd), KILL_SWITCH_FILE)
}

async function readKillSwitch(
  cwd: string
): Promise<{ readonly enabled: boolean; readonly reason: string | null }> {
  const text = await readText(resolveKillSwitchPath(cwd), '')
  return { enabled: text.length > 0, reason: text.length > 0 ? firstLine(text) : null }
}

async function readMarketContexts(dex: string): Promise<Map<string, MarketContext>> {
  const body: { type: 'metaAndAssetCtxs' } & Record<string, unknown> = { type: 'metaAndAssetCtxs' }
  if (dex.length > 0) body.dex = dex
  // Funding rates don't move fast; the 60s widget refresh tolerates a 60s cache.
  const data = await hyperliquidInfo<unknown>(body, { cacheTtlMs: 60_000 })
  if (!Array.isArray(data) || data.length < 2 || !isRecord(data[0]) || !Array.isArray(data[1]))
    return new Map()
  const universe = Array.isArray(data[0].universe) ? data[0].universe : []
  const ctxs = data[1]
  // Main DEX funding is 8-hour rate; xyz DEX funding is 1-hour rate.
  // Normalize both to hourly for consistent display.
  const fundingIntervalHours = dex.length > 0 ? 1 : 8
  const contexts = new Map<string, MarketContext>()
  universe.forEach((raw, index) => {
    if (!isRecord(raw)) return
    const ctx = isRecord(ctxs[index]) ? ctxs[index] : {}
    const name = typeof raw.name === 'string' ? raw.name : null
    const markPrice = nullableNumber(ctx.markPx ?? ctx.midPx ?? ctx.oraclePx)
    const rawFunding = nullableNumber(ctx.funding)
    const fundingRateHourly = rawFunding !== null ? rawFunding / fundingIntervalHours : null
    if (name) contexts.set(name, { markPrice, fundingRateHourly })
  })
  return contexts
}

function projectedFundingCostUsdPerDay(
  position: {
    readonly side: 'long' | 'short'
    readonly notionalUsd: number
  },
  fundingRateHourly: number | null
): number | null {
  if (fundingRateHourly === null) return null
  const sideSign = position.side === 'long' ? 1 : -1
  return position.notionalUsd * fundingRateHourly * 24 * sideSign
}

function annualizedFundingAprPct(
  position: { readonly side: 'long' | 'short' },
  fundingRateHourly: number | null
): number | null {
  if (fundingRateHourly === null) return null
  const sideSign = position.side === 'long' ? 1 : -1
  return fundingRateHourly * 24 * 365 * 100 * sideSign
}

function emptyPositionCostStats(): PositionCostStats {
  return { feesUsd: 0, fundingNetUsd: 0, netCostUsd: 0, tradedNotionalUsd: 0, fills: 0 }
}

/**
 * Estimate liq price for a cross-margin position when HL returns null.
 *
 * Hyperliquid liquidates a cross sub-account when `equity ≤ maintenanceMargin`.
 * Holding every other cross position flat at its current mark, the equity
 * delta from this position is `signedSize * (mark - liqMark)` for a long
 * (`signedSize > 0`) and `signedSize * (mark - liqMark)` for a short
 * (`signedSize < 0`, sign flips naturally). Solving for `liqMark`:
 *
 *   liqMark = mark - (equity - maintenanceMargin) / signedSize
 *
 * Returns null when the inputs are unusable, when the estimate is negative
 * (long can't liq below 0 — position is "safe"), or when the estimate is
 * within ε of the mark (numerically meaningless).
 */
function normalizePosition(
  raw: unknown,
  dex: string,
  contexts: ReadonlyMap<string, MarketContext>,
  costs: ReadonlyMap<string, PositionCostStats>,
  cross: CrossBucket | null
): StatusPosition | null {
  if (!isRecord(raw) || !isRecord(raw.position)) return null
  const position = raw.position
  const signedSize = safeNumber(position.szi, 0)
  if (signedSize === 0) return null
  const rawCoin = String(position.coin ?? '')
  const symbol = dex.length > 0 && !rawCoin.startsWith(`${dex}:`) ? `${dex}:${rawCoin}` : rawCoin
  const leverage = isRecord(position.leverage) ? position.leverage : {}
  const leverageType = typeof leverage.type === 'string' ? leverage.type : null
  const side = signedSize < 0 ? 'short' : 'long'
  const notionalUsd = Math.abs(safeNumber(position.positionValue, 0))
  const market = contexts.get(rawCoin) ?? { markPrice: null, fundingRateHourly: null }
  const recentCost = costs.get(symbol) ?? costs.get(rawCoin) ?? emptyPositionCostStats()
  const markPrice = market.markPrice ?? nullableNumber(position.markPx)
  const liquidationPrice = nullableNumber(position.liquidationPx)
  // Only fill in an estimate when HL itself didn't return one AND the position
  // is cross-margin (isolated positions always have a deterministic HL liq).
  const estimatedLiquidationPrice =
    liquidationPrice === null && leverageType === 'cross'
      ? estimateCrossLiquidationPx(signedSize, markPrice, cross)
      : null
  return {
    symbol,
    dex,
    side,
    size: Math.abs(signedSize),
    signedSize,
    notionalUsd,
    leverage: nullableNumber(leverage.value),
    leverageType,
    entryPrice: nullableNumber(position.entryPx),
    markPrice,
    liquidationPrice,
    estimatedLiquidationPrice,
    marginUsedUsd: nullableNumber(position.marginUsed),
    unrealizedPnlUsd: nullableNumber(position.unrealizedPnl),
    returnOnEquity: nullableNumber(position.returnOnEquity),
    fundingRateHourly: market.fundingRateHourly,
    fundingCostUsdPerDay: projectedFundingCostUsdPerDay(
      { side, notionalUsd },
      market.fundingRateHourly
    ),
    fundingAprPct: annualizedFundingAprPct({ side }, market.fundingRateHourly),
    recentFeesUsd: recentCost.feesUsd,
    recentFundingNetUsd: recentCost.fundingNetUsd,
    recentCostUsd: recentCost.netCostUsd
  }
}

async function readAccounts(
  user: string,
  dexes: readonly string[],
  costs: ReadonlyMap<string, PositionCostStats>
): Promise<{
  readonly accounts: readonly AccountSummary[]
  readonly positions: readonly StatusPosition[]
  readonly error: string | null
}> {
  const accounts: AccountSummary[] = []
  const positions: StatusPosition[] = []
  const errors: string[] = []

  for (const dex of dexes) {
    try {
      const contexts = await readMarketContexts(dex).catch(() => new Map<string, MarketContext>())
      const body: { type: 'clearinghouseState' } & Record<string, unknown> = {
        type: 'clearinghouseState',
        user
      }
      if (dex.length > 0) body.dex = dex
      const state = await hyperliquidInfo<Record<string, unknown>>(body)
      const marginSummary = isRecord(state.marginSummary) ? state.marginSummary : {}
      accounts.push({
        dex,
        equityUsd: safeNumber(marginSummary.accountValue, 0),
        withdrawableUsd: safeNumber(state.withdrawable, 0),
        grossExposureUsd: safeNumber(marginSummary.totalNtlPos, 0),
        marginUsedUsd: safeNumber(marginSummary.totalMarginUsed, 0)
      })

      // Cross sub-account snapshot for synthesizing liq prices on cross
      // positions that HL declines to compute (positions it considers
      // unreachable given the rest of the cross book).
      const crossSummary = isRecord(state.crossMarginSummary) ? state.crossMarginSummary : null
      const crossEquity = crossSummary === null ? null : nullableNumber(crossSummary.accountValue)
      const crossMaintenanceMargin = nullableNumber(state.crossMaintenanceMarginUsed)
      const cross: CrossBucket | null =
        crossEquity !== null && crossMaintenanceMargin !== null
          ? { equityUsd: crossEquity, maintenanceMarginUsd: crossMaintenanceMargin }
          : null

      const rawPositions = Array.isArray(state.assetPositions) ? state.assetPositions : []
      for (const rawPosition of rawPositions) {
        const normalized = normalizePosition(rawPosition, dex, contexts, costs, cross)
        if (normalized) positions.push(normalized)
      }
    } catch (error) {
      errors.push(`${dex || 'main'}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return { accounts, positions, error: errors.length > 0 ? errors.join('; ') : null }
}

function isPnlEntry(row: unknown, key: string): row is [string, { pnlHistory?: unknown[] }] {
  return Array.isArray(row) && row.length >= 2 && row[0] === key && isRecord(row[1])
}

function readPnLForTimeframe(data: unknown, key: string): number {
  if (!Array.isArray(data)) return 0
  const entry = data.find((row): row is [string, { pnlHistory?: unknown[] }] =>
    isPnlEntry(row, key)
  )
  const history = entry?.[1].pnlHistory
  if (!Array.isArray(history) || history.length === 0) return 0
  const last = history.at(-1)
  return Array.isArray(last) ? safeNumber(last[1], 0) : 0
}

async function readPortfolioPnl(
  user: string
): Promise<{ readonly daily: number; readonly allTime: number }> {
  const data = await hyperliquidInfo<unknown>({ type: 'portfolio', user })
  return {
    daily: readPnLForTimeframe(data, 'day'),
    allTime: readPnLForTimeframe(data, 'allTime')
  }
}

function positionCostKey(coin: string): string {
  return coin
}

function addCostStats(
  map: Map<string, PositionCostStats>,
  key: string,
  patch: Partial<PositionCostStats>
): void {
  const current = map.get(key) ?? emptyPositionCostStats()
  const next = {
    feesUsd: current.feesUsd + (patch.feesUsd ?? 0),
    fundingNetUsd: current.fundingNetUsd + (patch.fundingNetUsd ?? 0),
    netCostUsd: current.netCostUsd + (patch.netCostUsd ?? 0),
    tradedNotionalUsd: current.tradedNotionalUsd + (patch.tradedNotionalUsd ?? 0),
    fills: current.fills + (patch.fills ?? 0)
  }
  map.set(key, next)
}

async function readCostSummary(
  user: string,
  lookbackDays = COST_LOOKBACK_DAYS
): Promise<CostSummary> {
  const startTime = Date.now() - lookbackDays * 24 * 60 * 60 * 1000
  const byCoin = new Map<string, PositionCostStats>()
  let tradingFeesPaidUsd = 0
  let tradedNotionalUsd = 0
  let fundingPaidUsd = 0
  let fundingReceivedUsd = 0
  let error: string | null = null

  try {
    const fills = await hyperliquidInfo<unknown[]>({ type: 'userFillsByTime', user, startTime })
    if (Array.isArray(fills)) {
      for (const rawFill of fills) {
        if (!isRecord(rawFill)) continue
        const coin = typeof rawFill.coin === 'string' ? rawFill.coin : null
        if (!coin) continue
        const fee = safeNumber(rawFill.fee, 0)
        const px = safeNumber(rawFill.px, 0)
        const sz = safeNumber(rawFill.sz, 0)
        const notional = Math.abs(px * sz)
        tradingFeesPaidUsd += fee
        tradedNotionalUsd += notional
        addCostStats(byCoin, positionCostKey(coin), {
          feesUsd: fee,
          netCostUsd: fee,
          tradedNotionalUsd: notional,
          fills: 1
        })
      }
    }
  } catch (caught) {
    error = `fills: ${caught instanceof Error ? caught.message : String(caught)}`
  }

  try {
    const funding = await hyperliquidInfo<unknown[]>({ type: 'userFunding', user, startTime })
    if (Array.isArray(funding)) {
      for (const rawFunding of funding) {
        if (!isRecord(rawFunding) || !isRecord(rawFunding.delta)) continue
        const coin = typeof rawFunding.delta.coin === 'string' ? rawFunding.delta.coin : null
        if (!coin) continue
        const usdc = safeNumber(rawFunding.delta.usdc, 0)
        if (usdc < 0) fundingPaidUsd += Math.abs(usdc)
        if (usdc > 0) fundingReceivedUsd += usdc
        addCostStats(byCoin, positionCostKey(coin), {
          fundingNetUsd: usdc,
          netCostUsd: -usdc
        })
      }
    }
  } catch (caught) {
    const message = `funding: ${caught instanceof Error ? caught.message : String(caught)}`
    error = error ? `${error}; ${message}` : message
  }

  const fundingNetUsd = fundingReceivedUsd - fundingPaidUsd
  return {
    lookbackDays,
    startTime,
    tradingFeesPaidUsd,
    fundingPaidUsd,
    fundingReceivedUsd,
    fundingNetUsd,
    netCostUsd: tradingFeesPaidUsd + fundingPaidUsd - fundingReceivedUsd,
    tradedNotionalUsd,
    feeBpsOnTradedNotional:
      tradedNotionalUsd > 0 ? (tradingFeesPaidUsd / tradedNotionalUsd) * 10_000 : null,
    byCoin: Object.fromEntries([...byCoin.entries()].sort(([a], [b]) => a.localeCompare(b))),
    error
  }
}

async function readClosedPnlSummary(
  user: string,
  lookbackHours = CLOSED_PNL_LOOKBACK_HOURS
): Promise<ClosedPnlSummary> {
  const startTime = Date.now() - lookbackHours * 60 * 60 * 1000
  const byCoin = new Map<string, ClosedTradeStats>()
  let totalClosedPnlUsd = 0
  let totalFeesUsd = 0
  let closingFills = 0
  let error: string | null = null

  try {
    const fills = await hyperliquidInfo<unknown[]>({ type: 'userFillsByTime', user, startTime })
    if (Array.isArray(fills)) {
      for (const rawFill of fills) {
        if (!isRecord(rawFill)) continue
        const closedPnl = safeNumber(rawFill.closedPnl, 0)
        if (closedPnl === 0) continue
        const coin = typeof rawFill.coin === 'string' ? rawFill.coin : null
        if (!coin) continue
        const fee = safeNumber(rawFill.fee, 0)
        const time = safeNumber(rawFill.time, 0)
        const current = byCoin.get(coin) ?? {
          closedPnlUsd: 0,
          feesUsd: 0,
          fills: 0,
          lastTime: 0
        }
        byCoin.set(coin, {
          closedPnlUsd: current.closedPnlUsd + closedPnl,
          feesUsd: current.feesUsd + fee,
          fills: current.fills + 1,
          lastTime: Math.max(current.lastTime, time)
        })
        totalClosedPnlUsd += closedPnl
        totalFeesUsd += fee
        closingFills += 1
      }
    }
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught)
  }

  return {
    lookbackHours,
    startTime,
    totalClosedPnlUsd,
    totalFeesUsd,
    closingFills,
    byCoin: Object.fromEntries(
      [...byCoin.entries()].sort(
        ([, a], [, b]) => Math.abs(b.closedPnlUsd) - Math.abs(a.closedPnlUsd)
      )
    ),
    error
  }
}

async function readRecentTrades(
  user: string,
  limit = RECENT_TRADES_LIMIT
): Promise<readonly RecentTrade[]> {
  // `userFills` returns the account's most recent fills regardless of age, so
  // the "last N trades" are available even when nothing traded recently.
  const fills = await hyperliquidInfo<unknown[]>({ type: 'userFills', user })
  if (!Array.isArray(fills)) return []
  const rows = fills.filter(isRecord)

  // Hyperliquid fills carry no "hold time" field, so reconstruct it: walk the
  // fills in chronological order, track the signed position per coin, and
  // remember when the current position segment opened (from flat, or after a
  // sign flip). A fill that reduces the position closes part of that segment,
  // so its hold time = fillTime - segmentOpenTime. Keyed by trade id (tid).
  const holdByTid = new Map<number, number>()
  const entryByTid = new Map<number, number>()
  const exitByTid = new Map<number, number>()
  const segmentOpenByCoin = new Map<string, number>()
  const segmentEntryByCoin = new Map<string, number>()
  const chronological = [...rows].sort((a, b) => safeNumber(a.time, 0) - safeNumber(b.time, 0))
  for (const fill of chronological) {
    const coin = typeof fill.coin === 'string' ? fill.coin : null
    if (!coin) continue
    const tid = safeNumber(fill.tid, 0)
    const time = safeNumber(fill.time, 0)
    const px = safeNumber(fill.px, 0)
    const before = safeNumber(fill.startPosition, 0)
    const signedSize = fill.side === 'B' ? safeNumber(fill.sz, 0) : -safeNumber(fill.sz, 0)
    const after = before + signedSize
    const reduces = Math.abs(after) < Math.abs(before)
    const segmentOpen = segmentOpenByCoin.get(coin)
    if (reduces) {
      // Closing (part of) a segment: entry is the segment's average basis, exit
      // is this fill's price, hold is the elapsed time since the segment opened.
      entryByTid.set(tid, segmentEntryByCoin.get(coin) ?? px)
      exitByTid.set(tid, px)
      if (segmentOpen !== undefined) holdByTid.set(tid, time - segmentOpen)
    } else {
      // Opening or adding to a position: this fill's own price is its entry.
      entryByTid.set(tid, px)
    }
    const flipped = before !== 0 && after !== 0 && Math.sign(before) !== Math.sign(after)
    if (Math.abs(after) < 1e-9) {
      segmentOpenByCoin.delete(coin)
      segmentEntryByCoin.delete(coin)
    } else if (before === 0 || flipped) {
      segmentOpenByCoin.set(coin, time)
      segmentEntryByCoin.set(coin, px)
    } else if (Math.abs(after) > Math.abs(before)) {
      // Increased same-direction exposure: blend the segment's average entry.
      const priorEntry = segmentEntryByCoin.get(coin) ?? px
      const blended = (priorEntry * Math.abs(before) + px * Math.abs(signedSize)) / Math.abs(after)
      segmentEntryByCoin.set(coin, blended)
      if (!segmentOpenByCoin.has(coin)) segmentOpenByCoin.set(coin, time)
    } else {
      if (!segmentOpenByCoin.has(coin)) segmentOpenByCoin.set(coin, time)
      if (!segmentEntryByCoin.has(coin)) segmentEntryByCoin.set(coin, px)
    }
  }

  const trades: RecentTrade[] = []
  for (const rawFill of rows) {
    const coin = typeof rawFill.coin === 'string' ? rawFill.coin : null
    if (!coin) continue
    const tid = safeNumber(rawFill.tid, 0)
    const dir =
      typeof rawFill.dir === 'string' && rawFill.dir.length > 0
        ? rawFill.dir
        : rawFill.side === 'B'
          ? 'Buy'
          : 'Sell'
    trades.push({
      coin,
      dir,
      size: safeNumber(rawFill.sz, 0),
      price: safeNumber(rawFill.px, 0),
      time: safeNumber(rawFill.time, 0),
      closedPnlUsd: safeNumber(rawFill.closedPnl, 0),
      holdMs: holdByTid.get(tid) ?? null,
      avgEntryPrice: entryByTid.get(tid) ?? null,
      avgExitPrice: exitByTid.get(tid) ?? null
    })
  }
  return trades.sort((a, b) => b.time - a.time).slice(0, limit)
}

async function buildStatus(cwd: string): Promise<HyperliquidStatus> {
  const accountState = await resolveAccountState(cwd)
  const dexes = DEFAULT_DEXES
  const killSwitch = await readKillSwitch(cwd)

  if (accountState.kind !== 'ready') {
    // 'pending' renders as a loading state (no error, no scary border); only a
    // confirmed-'missing' snapshot says "Missing account address".
    const initializing = accountState.kind === 'pending'
    const status: HyperliquidStatus = {
      ok: false,
      schema: 'hyperliquid-status.v1',
      updatedAt: new Date().toISOString(),
      mode: 'live',
      user: null,
      dexes,
      accountSource: 'unavailable',
      accountError: initializing ? null : 'Missing account address',
      initializing,
      hyperliquidAccounts: [],
      killSwitch: killSwitch.enabled,
      killSwitchReason: killSwitch.reason,
      clear: false,
      equityUsd: null,
      withdrawableUsd: null,
      dailyPnlUsd: 0,
      dailyPnlPct: 0,
      allTimePnlUsd: 0,
      openPositions: 0,
      grossExposureUsd: 0,
      netExposureUsd: 0,
      marginUsedUsd: null,
      positions: [],
      costSummary: null,
      closedPnl24h: null,
      topCandidates: [],
      totalTrades: 0,
      recentTrades: [],
      ...(initializing ? {} : { error: 'Missing account address' })
    }
    await writeJson(resolveStatusPath(cwd), status)
    return status
  }
  const user = accountState.address

  const costSummary = await readCostSummary(user).catch(
    (error) =>
      ({
        lookbackDays: COST_LOOKBACK_DAYS,
        startTime: Date.now() - COST_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
        tradingFeesPaidUsd: 0,
        fundingPaidUsd: 0,
        fundingReceivedUsd: 0,
        fundingNetUsd: 0,
        netCostUsd: 0,
        tradedNotionalUsd: 0,
        feeBpsOnTradedNotional: null,
        byCoin: {},
        error: error instanceof Error ? error.message : String(error)
      }) satisfies CostSummary
  )
  const costByCoin = new Map(Object.entries(costSummary.byCoin))
  const account = await readAccounts(user, dexes, costByCoin)
  const equityUsd = account.accounts.reduce((sum, item) => sum + item.equityUsd, 0)
  const withdrawableUsd = account.accounts.reduce((sum, item) => sum + item.withdrawableUsd, 0)
  const grossExposureUsd = account.accounts.reduce((sum, item) => sum + item.grossExposureUsd, 0)
  const marginUsedUsd = account.accounts.reduce((sum, item) => sum + item.marginUsedUsd, 0)
  const netExposureUsd = account.positions.reduce(
    (sum, position) => sum + (position.side === 'short' ? -1 : 1) * position.notionalUsd,
    0
  )
  const portfolioPnl = await readPortfolioPnl(user).catch(() => ({ daily: 0, allTime: 0 }))
  const dailyPnlUsd = portfolioPnl.daily
  const allTimePnlUsd = portfolioPnl.allTime
  const closedPnl24h = await readClosedPnlSummary(user).catch(
    (error) =>
      ({
        lookbackHours: CLOSED_PNL_LOOKBACK_HOURS,
        startTime: Date.now() - CLOSED_PNL_LOOKBACK_HOURS * 60 * 60 * 1000,
        totalClosedPnlUsd: 0,
        totalFeesUsd: 0,
        closingFills: 0,
        byCoin: {},
        error: error instanceof Error ? error.message : String(error)
      }) satisfies ClosedPnlSummary
  )
  const recentTrades: readonly RecentTrade[] = await readRecentTrades(user).catch(() => [])

  const status: HyperliquidStatus = {
    ok: account.accounts.length > 0,
    initializing: false,
    schema: 'hyperliquid-status.v1',
    updatedAt: new Date().toISOString(),
    mode: 'live',
    user,
    dexes,
    accountSource: account.accounts.length > 0 ? 'hyperliquid-clearinghouse' : 'unavailable',
    accountError: account.error,
    hyperliquidAccounts: account.accounts,
    killSwitch: killSwitch.enabled,
    killSwitchReason: killSwitch.reason,
    clear: !killSwitch.enabled && account.accounts.length > 0,
    equityUsd: account.accounts.length > 0 ? equityUsd : null,
    withdrawableUsd: account.accounts.length > 0 ? withdrawableUsd : null,
    dailyPnlUsd,
    dailyPnlPct: equityUsd - dailyPnlUsd > 0 ? (dailyPnlUsd / (equityUsd - dailyPnlUsd)) * 100 : 0,
    allTimePnlUsd,
    openPositions: account.positions.length,
    grossExposureUsd,
    netExposureUsd,
    marginUsedUsd: account.accounts.length > 0 ? marginUsedUsd : null,
    positions: account.positions,
    costSummary,
    closedPnl24h,
    topCandidates: [],
    totalTrades: 0,
    recentTrades,
    ...(account.accounts.length === 0
      ? { error: account.error ?? 'Hyperliquid account unavailable' }
      : {})
  }
  await writeJson(resolveStatusPath(cwd), status)
  return status
}

async function refreshStatusSnapshot(cwd: string): Promise<HyperliquidStatus> {
  try {
    return await buildStatus(cwd)
  } catch (error) {
    const cached = await readJson<HyperliquidStatus | null>(resolveStatusPath(cwd), null)
    if (cached)
      return {
        ...cached,
        ok: false,
        initializing: false,
        accountError: error instanceof Error ? error.message : String(error),
        error: 'Using cached status after refresh failure'
      }
    const status: HyperliquidStatus = {
      ok: false,
      schema: 'hyperliquid-status.v1',
      updatedAt: new Date().toISOString(),
      mode: 'live',
      user: null,
      dexes: DEFAULT_DEXES,
      accountSource: 'unavailable',
      accountError: error instanceof Error ? error.message : String(error),
      hyperliquidAccounts: [],
      killSwitch: false,
      killSwitchReason: null,
      clear: false,
      equityUsd: null,
      withdrawableUsd: null,
      dailyPnlUsd: 0,
      dailyPnlPct: 0,
      allTimePnlUsd: 0,
      openPositions: 0,
      grossExposureUsd: 0,
      netExposureUsd: 0,
      marginUsedUsd: null,
      positions: [],
      costSummary: null,
      closedPnl24h: null,
      topCandidates: [],
      totalTrades: 0,
      recentTrades: [],
      error: 'Refresh failed'
    }
    await writeJson(resolveStatusPath(cwd), status)
    return status
  }
}

export default function hyperliquidStatus(pi: ExtensionAPI): void {
  let showWidget = true
  let showRecentTrades = false
  let statusTimer: ReturnType<typeof setInterval> | undefined
  let refreshing = false
  let lastStatus: HyperliquidStatus | null = null
  let widgetHandle: TUI | null = null
  let widgetRegistered = false
  let initPollTimer: ReturnType<typeof setTimeout> | undefined

  function requestWidgetRender(): void {
    widgetHandle?.requestRender()
  }

  function syncWidget(ctx: ExtensionContext): void {
    if (!ctx.hasUI) return
    if (!showWidget) {
      ctx.ui.setWidget('hyperliquid-status', undefined)
      widgetHandle = null
      widgetRegistered = false
      return
    }
    if (widgetRegistered) {
      requestWidgetRender()
      return
    }
    ctx.ui.setWidget(
      'hyperliquid-status',
      (tui: TUI, widgetTheme: Theme) => {
        widgetHandle = tui
        return {
          render: (width: number): string[] =>
            lastStatus
              ? renderHyperliquidPositionsWidget(
                  lastStatus,
                  widgetTheme,
                  width,
                  refreshing,
                  showRecentTrades
                )
              : [widgetTheme.fg('dim', 'Hyperliquid Status (loading...)')],
          invalidate: (): void => {}
        }
      },
      { placement: 'belowEditor' }
    )
    widgetRegistered = true
  }

  async function refreshStatus(ctx: ExtensionContext): Promise<void> {
    if (!ctx.hasUI || refreshing) return
    refreshing = true
    syncWidget(ctx)
    requestWidgetRender()
    try {
      lastStatus = await refreshStatusSnapshot(ctx.cwd)
    } finally {
      refreshing = false
      requestWidgetRender()
    }
  }

  // The wallet snapshot lands a beat after startup, so the first refresh sees
  // 'pending' (loading). Poll briefly so the widget flips to real data within a
  // second or two of the snapshot appearing; after a grace window with still no
  // snapshot, stop loading and show it as genuinely missing.
  const INIT_POLL_MS = 1_500
  const INIT_GRACE_MS = 25_000

  function scheduleInitPoll(ctx: ExtensionContext, deadlineMs: number): void {
    initPollTimer = setTimeout(() => {
      void (async () => {
        await refreshStatus(ctx)
        if (!lastStatus?.initializing) return
        if (Date.now() >= deadlineMs) {
          lastStatus = {
            ...lastStatus,
            initializing: false,
            accountSource: 'unavailable',
            accountError: 'Missing account address',
            error: 'Missing account address'
          }
          requestWidgetRender()
          return
        }
        scheduleInitPoll(ctx, deadlineMs)
      })()
    }, INIT_POLL_MS)
  }

  pi.on('session_start', async (_event, ctx) => {
    const cached = await readJson<HyperliquidStatus | null>(resolveStatusPath(ctx.cwd), null)
    if (cached) lastStatus = cached
    syncWidget(ctx)
    await refreshStatus(ctx)
    if (lastStatus?.initializing) scheduleInitPoll(ctx, Date.now() + INIT_GRACE_MS)
    statusTimer = setInterval(() => {
      void refreshStatus(ctx)
    }, 60_000)

    pi.events.on('wallet:changed', () => {
      void refreshStatus(ctx)
    })
  })

  pi.on('session_shutdown', async () => {
    if (statusTimer) clearInterval(statusTimer)
    statusTimer = undefined
    if (initPollTimer) clearTimeout(initPollTimer)
    initPollTimer = undefined
  })

  pi.registerCommand('hl-status', {
    description: 'Toggle Hyperliquid detailed status widget',
    handler: async (_args, ctx) => {
      showWidget = !showWidget
      if (!lastStatus) lastStatus = await refreshStatusSnapshot(ctx.cwd)
      syncWidget(ctx)
      ctx.ui.notify(
        showWidget ? 'Hyperliquid status widget shown' : 'Hyperliquid status widget hidden',
        'info'
      )
    }
  })

  pi.registerCommand('hl-trades', {
    description: 'Toggle the recent trades list in the Hyperliquid status widget',
    handler: async (_args, ctx) => {
      showRecentTrades = !showRecentTrades
      requestWidgetRender()
      ctx.ui.notify(showRecentTrades ? 'Recent trades shown' : 'Recent trades hidden', 'info')
    }
  })

  pi.registerCommand('hl-refresh', {
    description: 'Fetch fresh Hyperliquid account status and update widget',
    handler: async (_args, ctx) => {
      await refreshStatus(ctx)
      ctx.ui.notify('Hyperliquid status refreshed', 'info')
    }
  })

  pi.registerCommand('hl-kill', {
    description: 'Enable Hyperliquid status kill-switch after confirmation',
    handler: async (_args, ctx) => {
      const ok = await ctx.ui.confirm(
        'Enable kill-switch?',
        'This marks Hyperliquid status as blocked until /hl-unkill is run.'
      )
      if (!ok) return
      await ensureDir(resolveStatusDir(ctx.cwd))
      await writeFile(
        resolveKillSwitchPath(ctx.cwd),
        `enabled by /hl-kill at ${new Date().toISOString()}\n`,
        'utf8'
      )
      await refreshStatus(ctx)
      ctx.ui.notify('Hyperliquid kill-switch enabled', 'warning')
    }
  })

  pi.registerCommand('hl-unkill', {
    description: 'Clear the Hyperliquid status kill-switch',
    handler: async (_args, ctx) => {
      await rm(resolveKillSwitchPath(ctx.cwd), { force: true })
      await refreshStatus(ctx)
      ctx.ui.notify('Hyperliquid kill-switch cleared', 'info')
    }
  })
}
