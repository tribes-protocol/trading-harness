import type { MarketstackEodBar } from '@/types/Marketstack'

// Marketstack /eod can interleave bars from SECONDARY listings of the same
// ticker (e.g. INTC rows priced in CLP from the Santiago listing, with a null
// exchange_code) among the primary-exchange bars. Mixing currencies corrupts
// any computation over closes, so callers reduce a multi-listing series to the
// dominant currency group first (ties prefer USD), then de-duplicate dates.

export function dominantCurrencyBars(bars: readonly MarketstackEodBar[]): {
  readonly bars: MarketstackEodBar[]
  readonly droppedOtherCurrencies: number
} {
  const groups = new Map<string, MarketstackEodBar[]>()
  for (const bar of bars) {
    const currency = bar.price_currency ?? 'unknown'
    const group = groups.get(currency) ?? []
    group.push(bar)
    groups.set(currency, group)
  }
  let dominant: MarketstackEodBar[] = []
  let dominantCurrency = ''
  for (const [currency, group] of groups) {
    const wins =
      group.length > dominant.length ||
      (group.length === dominant.length && currency === 'USD' && dominantCurrency !== 'USD')
    if (wins) {
      dominant = group
      dominantCurrency = currency
    }
  }
  const seenDates = new Set<string>()
  const deduped: MarketstackEodBar[] = []
  for (const bar of dominant) {
    const day = bar.date.slice(0, 10)
    if (!seenDates.has(day)) {
      seenDates.add(day)
      deduped.push(bar)
    }
  }
  return { bars: deduped, droppedOtherCurrencies: bars.length - dominant.length }
}
