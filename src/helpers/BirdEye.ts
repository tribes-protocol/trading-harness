import { fetchJson } from '@/helpers/HttpJson'
import {
  type BirdeyeCandleItem,
  type BirdeyeChain,
  BirdeyeOhlcvResponseSchema,
  BirdeyeSearchResponseSchema,
  type BirdeyeSearchResult,
  type OhlcvTimeframe,
  type UnifiedCandle
} from '@/types/Candles'
import { toFiniteNumber } from '@/utils/Candles'
import { isNullish } from '@/utils/Lang'

const BIRDEYE_BASE_URL = 'https://public-api.birdeye.so'

// Deterministic addresses for majors whose ticker != on-chain symbol (BTC→WBTC,
// ETH→WETH, SOL→wSOL). The tool owns this so callers pass a plain ticker.
const KNOWN_TOKENS: Record<BirdeyeChain, Record<string, string>> = {
  ethereum: {
    BTC: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',
    WBTC: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',
    ETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7'
  },
  solana: {
    SOL: 'So11111111111111111111111111111111111111112',
    WSOL: 'So11111111111111111111111111111111111111112',
    USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
  },
  base: {
    ETH: '0x4200000000000000000000000000000000000006',
    WETH: '0x4200000000000000000000000000000000000006',
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
  },
  bsc: {},
  arbitrum: {
    ETH: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    WETH: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1'
  },
  optimism: {
    ETH: '0x4200000000000000000000000000000000000006',
    WETH: '0x4200000000000000000000000000000000000006'
  },
  polygon: {}
}

function looksLikeAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)
}

export class BirdEyeHelper {
  constructor(private readonly apiKey: string) {}

  private headers(chain?: BirdeyeChain): HeadersInit {
    const headers: Record<string, string> = {
      accept: 'application/json',
      'X-API-KEY': this.apiKey
    }
    if (!isNullish(chain)) {
      headers['x-chain'] = chain
    }
    return headers
  }

  // Resolve a symbol (or pass through an address) to a token address on `chain`.
  // `chain` is a QUERY param on /defi/v3/search (not the x-chain header). Picks
  // the exact-symbol match with the deepest liquidity, else deepest liquidity.
  async resolveTokenAddress(chain: BirdeyeChain, assetOrAddress: string): Promise<string> {
    if (looksLikeAddress(assetOrAddress)) {
      return assetOrAddress
    }
    const known = KNOWN_TOKENS[chain][assetOrAddress.toUpperCase()]
    if (!isNullish(known)) {
      return known
    }
    const url = new URL('/defi/v3/search', BIRDEYE_BASE_URL)
    url.searchParams.set('chain', chain)
    url.searchParams.set('keyword', assetOrAddress)
    url.searchParams.set('target', 'token')
    url.searchParams.set('sort_by', 'liquidity')
    url.searchParams.set('sort_type', 'desc')
    url.searchParams.set('limit', '20')

    const json = await fetchJson(url, { method: 'GET', headers: this.headers() }, 'BirdEye')
    const parsed = BirdeyeSearchResponseSchema.parse(json)

    const results: BirdeyeSearchResult[] = (parsed.data?.items ?? []).flatMap(
      (item) => item.result ?? []
    )
    const withAddress = results.filter((result) => !isNullish(result.address))
    const wanted = assetOrAddress.toUpperCase()
    const exact = withAddress.filter((result) => {
      const symbol = (result.symbol ?? '').toUpperCase()
      return symbol === wanted || symbol === `W${wanted}`
    })
    const pool = exact.length > 0 ? exact : withAddress
    const best = pool.sort((left, right) => (right.liquidity ?? 0) - (left.liquidity ?? 0))[0]

    if (isNullish(best) || isNullish(best.address)) {
      throw new Error(`BirdEye could not resolve "${assetOrAddress}" to a token on ${chain}`)
    }
    return best.address
  }

  async fetchOhlcv(params: {
    chain: BirdeyeChain
    address: string
    timeframe: OhlcvTimeframe
    timeFrom: number
    timeTo: number
  }): Promise<UnifiedCandle[]> {
    const url = new URL('/defi/ohlcv', BIRDEYE_BASE_URL)
    url.searchParams.set('address', params.address)
    url.searchParams.set('type', params.timeframe)
    url.searchParams.set('time_from', String(params.timeFrom))
    url.searchParams.set('time_to', String(params.timeTo))
    url.searchParams.set('ui_amount_mode', 'raw')

    const json = await fetchJson(
      url,
      { method: 'GET', headers: this.headers(params.chain) },
      'BirdEye'
    )
    const parsed = BirdeyeOhlcvResponseSchema.parse(json)

    const candles: UnifiedCandle[] = []
    for (const item of parsed.data?.items ?? []) {
      const candle = toCandle(item)
      if (!isNullish(candle)) {
        candles.push(candle)
      }
    }
    return candles.sort((left, right) => left.timestamp - right.timestamp)
  }
}

function toCandle(item: BirdeyeCandleItem): UnifiedCandle | null {
  const timestamp = toFiniteNumber(item.unixTime)
  const open = toFiniteNumber(item.o)
  const high = toFiniteNumber(item.h)
  const low = toFiniteNumber(item.l)
  const close = toFiniteNumber(item.c)
  const volume = toFiniteNumber(item.v)
  if (
    isNullish(timestamp) ||
    isNullish(open) ||
    isNullish(high) ||
    isNullish(low) ||
    isNullish(close)
  ) {
    return null
  }
  return { timestamp, open, high, low, close, volume: volume ?? 0 }
}
