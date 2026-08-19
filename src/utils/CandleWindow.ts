import {
  type AssetCandlesCommandOptions,
  type CandleWindow,
  CandleWindowSchema,
  DEFAULT_CANDLE_LIMIT
} from '@/types/Capability'
import type { TaCandle } from '@/types/Ta'
import { isNullish } from '@/utils/Lang'

const MS_PER_SECOND = 1000

// Normalise the CLI's --from/--to/--limit into one canonical window. The option
// schema has already rejected unparseable dates and to-before-from, so parsing
// here cannot fail.
export function resolveCandleWindow(options: AssetCandlesCommandOptions): CandleWindow {
  return CandleWindowSchema.parse({
    from: isNullish(options.from) ? null : Date.parse(options.from),
    to: isNullish(options.to) ? null : Date.parse(options.to),
    limit: options.limit ?? DEFAULT_CANDLE_LIMIT
  })
}

// Providers disagree on units, so each adapter converts from the canonical
// epoch-ms window rather than re-parsing the raw flags.
export function toEpochSeconds(epochMs: number | null | undefined): number | null {
  return isNullish(epochMs) ? null : Math.floor(epochMs / MS_PER_SECOND)
}

export function toIsoDate(epochMs: number | null | undefined): string | null {
  return isNullish(epochMs) ? null : new Date(epochMs).toISOString().slice(0, 10)
}

// Providers honour a window only approximately — GeckoTerminal has a "before"
// cursor but no "after", Marketstack rounds to whole days, and several ignore
// the bar count. Clipping client-side is what makes --from/--to/--limit mean
// the same thing no matter which provider answered. Input is ascending, so the
// tail is the most recent slice.
export function applyCandleWindow(candles: TaCandle[], window: CandleWindow): TaCandle[] {
  const clipped = candles.filter(
    (candle) =>
      (isNullish(window.from) || candle.t >= window.from) &&
      (isNullish(window.to) || candle.t <= window.to)
  )
  return clipped.length <= window.limit ? clipped : clipped.slice(clipped.length - window.limit)
}
