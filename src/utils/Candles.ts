import type {
  BirdeyeChain,
  HyperliquidInterval,
  MarketStackPlan,
  OhlcvTimeframe
} from '@/types/Candles'
import type { ChainId } from '@/types/ChainId'
import { isNullish } from '@/utils/Lang'

// BirdEye chain name → harness ChainId (for building a token AssetIdentity).
export const BIRDEYE_CHAIN_TO_CHAIN_ID: Record<BirdeyeChain, ChainId> = {
  ethereum: 1,
  base: 8453,
  bsc: 56,
  arbitrum: 42161,
  optimism: 10,
  polygon: 137,
  solana: 'solana'
}

// ChainId → BirdEye chain name (for the x-chain header on the OHLCV fetch).
const CHAIN_ID_TO_BIRDEYE_CHAIN: Record<ChainId, BirdeyeChain> = {
  1: 'ethereum',
  8453: 'base',
  56: 'bsc',
  42161: 'arbitrum',
  10: 'optimism',
  137: 'polygon',
  solana: 'solana'
}

export function chainIdToBirdeyeChain(chainId: ChainId): BirdeyeChain {
  return CHAIN_ID_TO_BIRDEYE_CHAIN[chainId]
}

// Map a canonical timeframe to a Hyperliquid candleSnapshot interval. Hyperliquid
// has no 6H interval, so that combination is rejected.
export function toHyperliquidInterval(timeframe: OhlcvTimeframe): HyperliquidInterval {
  switch (timeframe) {
    case '1m':
      return '1m'
    case '3m':
      return '3m'
    case '5m':
      return '5m'
    case '15m':
      return '15m'
    case '30m':
      return '30m'
    case '1H':
      return '1h'
    case '2H':
      return '2h'
    case '4H':
      return '4h'
    case '6H':
      throw new Error('Hyperliquid perps do not support the 6H timeframe')
    case '8H':
      return '8h'
    case '12H':
      return '12h'
    case '1D':
      return '1d'
    case '3D':
      return '3d'
    case '1W':
      return '1w'
    case '1M':
      return '1M'
  }
}

// Parse a possibly-string / possibly-null numeric field into a finite number,
// or null when it is missing / non-numeric (e.g. Marketstack's null close).
export function toFiniteNumber(value: number | string | null | undefined): number | null {
  if (isNullish(value) || value === '') {
    return null
  }
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function toMarketStackDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10)
}

// Map a canonical timeframe to a Marketstack source + aggregation plan. Native
// intervals (1min/5min/15min/30min/1hour/6hour/12hour, EOD daily) fetch
// directly; the rest roll up from a finer native interval.
export function toMarketStackPlan(timeframe: OhlcvTimeframe): MarketStackPlan {
  switch (timeframe) {
    case '1m':
      return { sourceKind: 'intraday', interval: '1min' }
    case '3m':
      return { sourceKind: 'intraday', interval: '1min', aggregation: { kind: 'fixed', size: 3 } }
    case '5m':
      return { sourceKind: 'intraday', interval: '5min' }
    case '15m':
      return { sourceKind: 'intraday', interval: '15min' }
    case '30m':
      return { sourceKind: 'intraday', interval: '30min' }
    case '1H':
      return { sourceKind: 'intraday', interval: '1hour' }
    case '2H':
      return { sourceKind: 'intraday', interval: '1hour', aggregation: { kind: 'fixed', size: 2 } }
    case '4H':
      return { sourceKind: 'intraday', interval: '1hour', aggregation: { kind: 'fixed', size: 4 } }
    case '6H':
      return { sourceKind: 'intraday', interval: '6hour' }
    case '8H':
      return { sourceKind: 'intraday', interval: '1hour', aggregation: { kind: 'fixed', size: 8 } }
    case '12H':
      return { sourceKind: 'intraday', interval: '12hour' }
    case '1D':
      return { sourceKind: 'eod' }
    case '3D':
      return { sourceKind: 'eod', aggregation: { kind: 'fixed', size: 3 } }
    case '1W':
      return { sourceKind: 'eod', aggregation: { kind: 'calendar', boundary: 'week' } }
    case '1M':
      return { sourceKind: 'eod', aggregation: { kind: 'calendar', boundary: 'month' } }
  }
}
