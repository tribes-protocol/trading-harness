import { z } from 'zod'

// Normalized movers/positioning read computed from one dex's perp assets.
// Numbers are parsed once here so downstream skills stop re-deriving them
// from the raw string fields of list-assets output.

const HyperliquidMoverRowSchema = z.object({
  name: z.string(),
  mark_px: z.number(),
  change_24h_pct: z.number(),
  day_ntl_vlm_usd: z.number(),
  open_interest_base: z.number().nullish(),
  // Raw hourly decimal fraction (0.0000125 = 0.00125%/hr) AND the %/hr view,
  // so no caller ever has to remember the 100x conversion again.
  funding_hourly_raw: z.number().nullish(),
  funding_hourly_pct: z.number().nullish()
})
export type HyperliquidMoverRow = z.infer<typeof HyperliquidMoverRowSchema>

export const HyperliquidMoversResultSchema = z.object({
  source: z.literal('hyperliquid'),
  dex: z.string(),
  as_of: z.string(),
  min_volume_usd: z.number(),
  live_asset_count: z.number(),
  skipped_not_live: z.number(),
  movers: HyperliquidMoverRowSchema.array(),
  // Assets whose |raw hourly funding| >= 0.00005 (0.005%/hr, ~4x baseline).
  funding_extremes: HyperliquidMoverRowSchema.array()
})
export type HyperliquidMoversResult = z.infer<typeof HyperliquidMoversResultSchema>

export const HyperliquidMoversCommandOptionsSchema = z.object({
  dex: z.string().trim().min(1).default('main'),
  minVolume: z.coerce.number().min(0).default(1_000_000),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  out: z.string().nullish()
})
export type HyperliquidMoversCommandOptions = z.infer<typeof HyperliquidMoversCommandOptionsSchema>
