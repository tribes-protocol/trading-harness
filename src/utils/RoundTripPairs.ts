import BigNumber from 'bignumber.js'

import type { HyperliquidFill, HyperliquidFillPair } from '@/types/Hyperliquid'
import { isNullish } from '@/utils/Lang'

/**
 * Detect equal-size buy/sell round-trip pairs in a fills list.
 *
 * The venue's fills feed reports both legs of an open+immediate-flatten
 * honestly; the clearinghouse nets them to a zero position. Each pair is an
 * "open + same-size offset" that leaves NO position — the desk must not re-fire
 * into that class expecting exposure. Deterministic: within a coin, legs are
 * matched in timestamp order, each leg used at most once, buy size must equal
 * sell size and both must fall within `windowMs` of each other.
 */
export function findRoundTripPairs(
  fills: readonly HyperliquidFill[],
  windowMs: number
): HyperliquidFillPair[] {
  const byCoin = new Map<string, HyperliquidFill[]>()
  for (const fill of fills) {
    const key = `${fill.dex}:${fill.coin.toUpperCase()}`
    const bucket = byCoin.get(key)
    if (isNullish(bucket)) byCoin.set(key, [fill])
    else bucket.push(fill)
  }

  const pairs: HyperliquidFillPair[] = []
  for (const bucket of byCoin.values()) {
    const used = new Set<number>()
    // Time order (oldest first) so the earliest leg pairs deterministically.
    const ordered = [...bucket].sort((a, b) => a.timestamp - b.timestamp)
    for (let i = 0; i < ordered.length; i++) {
      const buy = ordered[i]
      if (isNullish(buy) || used.has(i) || buy.side !== 'buy') continue
      const buySize = new BigNumber(buy.size)
      for (let j = 0; j < ordered.length; j++) {
        const sell = ordered[j]
        if (isNullish(sell) || used.has(j) || sell.side !== 'sell') continue
        if (!new BigNumber(sell.size).isEqualTo(buySize)) continue
        const gapMs = Math.abs(sell.timestamp - buy.timestamp)
        if (gapMs > windowMs) continue
        used.add(i)
        used.add(j)
        pairs.push({
          coin: buy.coin,
          dex: buy.dex,
          size: buy.size,
          buyOrderId: buy.orderId,
          sellOrderId: sell.orderId,
          buyPx: buy.price,
          sellPx: sell.price,
          buyTimestamp: buy.timestamp,
          sellTimestamp: sell.timestamp,
          gapMs
        })
        break
      }
    }
  }
  return pairs
}
