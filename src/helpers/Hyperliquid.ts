import { HttpTransport, InfoClient } from '@nktkas/hyperliquid'

import type { OhlcvTimeframe, UnifiedCandle } from '@/types/Candles'
import { toFiniteNumber, toHyperliquidInterval } from '@/utils/Candles'
import { isNullish } from '@/utils/Lang'

type HyperliquidCandle = {
  readonly t: number
  readonly o: string
  readonly h: string
  readonly l: string
  readonly c: string
  readonly v: string
}

export class HyperliquidCandlesHelper {
  private readonly infoClient: InfoClient

  constructor(infoClient?: InfoClient) {
    // Candle data is public — no wallet/auth needed.
    this.infoClient = infoClient ?? new InfoClient({ transport: new HttpTransport() })
  }

  // Perp OHLCV via Hyperliquid candleSnapshot. `coin` is passed verbatim,
  // preserving any HIP-3 dex prefix (e.g. `xyz:MSFT`).
  async fetchPerpCandles(params: {
    coin: string
    timeframe: OhlcvTimeframe
    timeFrom: number
    timeTo: number
  }): Promise<UnifiedCandle[]> {
    const interval = toHyperliquidInterval(params.timeframe)
    const snapshot = await this.infoClient.candleSnapshot({
      coin: params.coin,
      interval,
      startTime: params.timeFrom * 1000,
      endTime: params.timeTo * 1000
    })

    const candles: UnifiedCandle[] = []
    for (const raw of snapshot) {
      const candle = toCandle(raw)
      if (!isNullish(candle)) {
        candles.push(candle)
      }
    }
    return candles.sort((left, right) => left.timestamp - right.timestamp)
  }
}

function toCandle(raw: HyperliquidCandle): UnifiedCandle | null {
  const open = toFiniteNumber(raw.o)
  const high = toFiniteNumber(raw.h)
  const low = toFiniteNumber(raw.l)
  const close = toFiniteNumber(raw.c)
  const volume = toFiniteNumber(raw.v)
  if (isNullish(open) || isNullish(high) || isNullish(low) || isNullish(close)) {
    return null
  }
  return {
    timestamp: Math.floor(raw.t / 1000),
    open,
    high,
    low,
    close,
    volume: volume ?? 0
  }
}
