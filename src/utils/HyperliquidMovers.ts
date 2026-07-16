import type { HyperliquidPerpAsset } from '@/types/Hyperliquid'
import type { HyperliquidMoverRow, HyperliquidMoversResult } from '@/types/HyperliquidMovers'
import { HyperliquidMoversResultSchema } from '@/types/HyperliquidMovers'
import { compactMap, isNullish } from '@/utils/Lang'

// Movers/positioning read over one dex's perp assets: 24h moves from
// markPx/prevDayPx and funding extremes, with the LIVE filter (not delisted,
// priced, and above a volume floor) applied first so frozen or delisted
// markets can never masquerade as data. This is the computation the
// market-pulse skill's venue leg specifies; keep the two in sync.

// 4x the venue's ~0.00125%/hr baseline; matches the skills' "stretched" line.
const FUNDING_EXTREME_RAW_THRESHOLD = 0.00005

type ComputePerpMoversParams = {
  readonly dex: string
  readonly assets: readonly HyperliquidPerpAsset[]
  readonly minVolumeUsd: number
  readonly limit: number
  readonly asOf: string
}

export function computePerpMovers(params: ComputePerpMoversParams): HyperliquidMoversResult {
  const rows = compactMap(params.assets.map((asset) => toMoverRow(asset, params.minVolumeUsd)))

  const movers = [...rows]
    .sort((a, b) => Math.abs(b.change_24h_pct) - Math.abs(a.change_24h_pct))
    .slice(0, params.limit)

  const fundingExtremes = rows
    .filter(
      (row) =>
        !isNullish(row.funding_hourly_raw) &&
        Math.abs(row.funding_hourly_raw) >= FUNDING_EXTREME_RAW_THRESHOLD
    )
    .sort((a, b) => Math.abs(b.funding_hourly_raw ?? 0) - Math.abs(a.funding_hourly_raw ?? 0))
    .slice(0, params.limit)

  return HyperliquidMoversResultSchema.parse({
    source: 'hyperliquid',
    dex: params.dex,
    as_of: params.asOf,
    min_volume_usd: params.minVolumeUsd,
    live_asset_count: rows.length,
    skipped_not_live: params.assets.length - rows.length,
    movers,
    funding_extremes: fundingExtremes
  })
}

function toMoverRow(asset: HyperliquidPerpAsset, minVolumeUsd: number): HyperliquidMoverRow | null {
  if (asset.isDelisted) {
    return null
  }
  const markPx = toFiniteNumber(asset.markPx)
  const prevDayPx = toFiniteNumber(asset.prevDayPx)
  const dayNtlVlm = toFiniteNumber(asset.dayNtlVlm)
  if (isNullish(markPx) || isNullish(prevDayPx) || prevDayPx === 0) {
    return null
  }
  if (isNullish(dayNtlVlm) || dayNtlVlm < minVolumeUsd) {
    return null
  }
  const fundingRaw = toFiniteNumber(asset.funding)
  return {
    name: asset.name,
    mark_px: markPx,
    change_24h_pct: roundTo((markPx / prevDayPx - 1) * 100, 2),
    day_ntl_vlm_usd: dayNtlVlm,
    open_interest_base: toFiniteNumber(asset.openInterest),
    funding_hourly_raw: fundingRaw,
    funding_hourly_pct: isNullish(fundingRaw) ? null : roundTo(fundingRaw * 100, 5)
  }
}

function toFiniteNumber(text: string | null | undefined): number | null {
  if (isNullish(text) || text === '') {
    return null
  }
  const value = Number(text)
  return Number.isFinite(value) ? value : null
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}
