/**
 * Pure helper: estimate the liquidation price of a cross-margin position
 * when Hyperliquid's clearinghouse returns `liquidationPx: null`.
 *
 * Hyperliquid liquidates a cross sub-account when
 *   equity ≤ totalMaintenanceMargin.
 * Holding every other cross position flat at its current mark, the only
 * input to the equity balance from THIS position is `signedSize * mark`.
 * Setting equity to the maintenance-margin floor and solving for the
 * mark gives:
 *
 *   liqMark = mark - (equity − maintenanceMargin) / signedSize
 *
 * - `signedSize > 0` (long): liqMark < mark when the buffer is positive.
 * - `signedSize < 0` (short): liqMark > mark when the buffer is positive.
 *
 * Returns `null` when:
 *   - cross bucket data is missing (no synthetic estimate possible),
 *   - the mark or size inputs are unusable,
 *   - the computed liq is at or below zero (long can't liquidate below 0;
 *     position is effectively "safe"),
 *   - the buffer is negative — equity already ≤ maintenance — which makes
 *     the long-side formula yield liq > mark, meaning the account would
 *     have been liquidated already. Returning null lets the renderer fall
 *     back to "safe"/"—" rather than display a misleading number.
 *
 * This intentionally does NOT model per-asset maintenance-margin rates
 * (we don't have them at this layer). For BRENTOIL-style positions HL
 * provides its own liq value which we prefer over our estimate; this
 * helper exists for the cross longs where HL returns null and we'd
 * otherwise show "—".
 */

export interface CrossBucket {
  readonly equityUsd: number
  readonly maintenanceMarginUsd: number
}

export function estimateCrossLiquidationPx(
  signedSize: number,
  markPrice: number | null,
  cross: CrossBucket | null
): number | null {
  if (cross === null) return null
  if (markPrice === null || !Number.isFinite(markPrice) || markPrice <= 0) return null
  if (!Number.isFinite(signedSize) || signedSize === 0) return null
  const buffer = cross.equityUsd - cross.maintenanceMarginUsd
  if (!Number.isFinite(buffer)) return null
  const liqMark = markPrice - buffer / signedSize
  if (!Number.isFinite(liqMark) || liqMark <= 0) return null
  if (signedSize > 0 && liqMark >= markPrice) return null
  if (signedSize < 0 && liqMark <= markPrice) return null
  return liqMark
}
