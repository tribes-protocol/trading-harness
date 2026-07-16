import { cachedProviderJson } from '@/helpers/ProviderCache'
import {
  BIRDEYE_CHAIN_SLUGS,
  COINGECKO_ONCHAIN_NETWORK_SLUGS,
  MORALIS_EVM_CHAIN_SLUGS
} from '@/helpers/ProviderChains'
import { providerFetchJson } from '@/helpers/ProviderHttp'
import type { ChainId, EvmChainId } from '@/types/ChainId'
import type {
  BirdeyeOhlcvInterval,
  TokenHolders,
  TokenOhlcv,
  TokenOverview,
  TokenPrice,
  TokenSecurity,
  TokenTrending
} from '@/types/TokenData'
import {
  BirdeyeEnvelopeSchema,
  BirdeyeHolderDataSchema,
  BirdeyeOhlcvDataSchema,
  BirdeyePriceDataSchema,
  BirdeyeTokenOverviewDataSchema,
  BirdeyeTokenSecurityDataSchema,
  BirdeyeTrendingDataSchema,
  CoinGeckoOnchainTokenResponseSchema,
  MoralisEvmTokenPriceSchema,
  MoralisSolanaTokenPriceSchema,
  MoralisTokenOwnersResponseSchema,
  TokenHoldersSchema,
  TokenOhlcvSchema,
  TokenOverviewSchema,
  TokenPriceSchema,
  TokenSecuritySchema,
  TokenTrendingSchema
} from '@/types/TokenData'
import { isNullish } from '@/utils/Lang'

// Deterministic per-token on-chain market data (`token price|overview|ohlcv|
// security|holders|trending`).
// Primary provider: Birdeye (X-API-KEY header + x-chain header per chain).
// Fallbacks: Moralis (price, EVM holders) and CoinGecko onchain (overview).
// Fallback rule: try Birdeye when configured; on ANY Birdeye failure
// (unconfigured, HTTP error, success:false envelope, missing data, parse
// error) fall through to the fallback provider when configured; when every
// provider fails, throw one error naming each provider's failure reason
// (messages are already secret-redacted by providerFetchJson).
// Timestamps are unix seconds throughout.

const BIRDEYE_BASE_URL = 'https://public-api.birdeye.so'
const MORALIS_EVM_BASE_URL = 'https://deep-index.moralis.io'
const MORALIS_EVM_API_PREFIX = '/api/v2.2'
const MORALIS_SOLANA_BASE_URL = 'https://solana-gateway.moralis.io'
const COINGECKO_BASE_URL = 'https://pro-api.coingecko.com'

const PRICE_TTL_MS = 60 * 1000
const OVERVIEW_TTL_MS = 5 * 60 * 1000
const OHLCV_TTL_MS = 5 * 60 * 1000
const SECURITY_TTL_MS = 60 * 60 * 1000
const HOLDERS_TTL_MS = 10 * 60 * 1000
const TRENDING_TTL_MS = 10 * 60 * 1000

const OHLCV_INTERVAL_SECONDS: Readonly<Record<BirdeyeOhlcvInterval, number>> = {
  '1m': 60,
  '3m': 3 * 60,
  '5m': 5 * 60,
  '15m': 15 * 60,
  '30m': 30 * 60,
  '1H': 60 * 60,
  '2H': 2 * 60 * 60,
  '4H': 4 * 60 * 60,
  '6H': 6 * 60 * 60,
  '8H': 8 * 60 * 60,
  '12H': 12 * 60 * 60,
  '1D': 24 * 60 * 60,
  '3D': 3 * 24 * 60 * 60,
  '1W': 7 * 24 * 60 * 60,
  '1M': 30 * 24 * 60 * 60
}

type TokenDataServiceParams = {
  readonly birdeyeApiKey: string
  readonly moralisApiKey: string
  readonly coinGeckoProApiKey: string
}

type TokenLookupParams = {
  readonly address: string
  readonly chainId: ChainId
}

type TokenOhlcvParams = {
  readonly address: string
  readonly chainId: ChainId
  readonly interval: BirdeyeOhlcvInterval
  readonly limit: number
  readonly timeFrom: number | null | undefined
  readonly timeTo: number | null | undefined
}

type TokenHoldersParams = {
  readonly address: string
  readonly chainId: ChainId
  readonly limit: number
}

type TokenTrendingParams = {
  readonly chainId: ChainId
  readonly limit: number
}

type BirdeyeGetParams = {
  readonly path: string
  readonly chainId: ChainId
  readonly search: Readonly<Record<string, string>>
  readonly cacheKey: string
  readonly ttlMs: number
}

export class TokenDataService {
  private readonly birdeyeApiKey: string
  private readonly moralisApiKey: string
  private readonly coinGeckoProApiKey: string

  constructor(params: TokenDataServiceParams) {
    this.birdeyeApiKey = params.birdeyeApiKey
    this.moralisApiKey = params.moralisApiKey
    this.coinGeckoProApiKey = params.coinGeckoProApiKey
  }

  isConfigured(): boolean {
    return this.isBirdeyeConfigured() || this.isMoralisConfigured() || this.isCoinGeckoConfigured()
  }

  private isBirdeyeConfigured(): boolean {
    return this.birdeyeApiKey.length > 0
  }

  private ensureBirdeyeConfigured(): void {
    if (!this.isBirdeyeConfigured()) {
      throw new Error('BIRDEYE_API_KEY is not set; Birdeye token data lookups are disabled')
    }
  }

  private isMoralisConfigured(): boolean {
    return this.moralisApiKey.length > 0
  }

  private ensureMoralisConfigured(): void {
    if (!this.isMoralisConfigured()) {
      throw new Error('MORALIS_API_KEY is not set; Moralis token data lookups are disabled')
    }
  }

  private isCoinGeckoConfigured(): boolean {
    return this.coinGeckoProApiKey.length > 0
  }

  // Spot price with liquidity. Birdeye primary; Moralis fallback (EVM
  // /erc20/{address}/price, Solana gateway /token/mainnet/{address}/price).
  async getPrice(params: TokenLookupParams): Promise<TokenPrice> {
    const failures: string[] = []

    if (this.isBirdeyeConfigured()) {
      try {
        return await this.birdeyePrice(params)
      } catch (error: unknown) {
        failures.push(describeFailure('birdeye', error))
      }
    } else {
      failures.push('birdeye: BIRDEYE_API_KEY is not set')
    }

    if (this.isMoralisConfigured()) {
      try {
        return await this.moralisPrice(params)
      } catch (error: unknown) {
        failures.push(describeFailure('moralis', error))
      }
    } else {
      failures.push('moralis: MORALIS_API_KEY is not set')
    }

    throw new Error(
      `token price lookup failed for ${params.address} on chain ${params.chainId}: ` +
        failures.join('; ')
    )
  }

  // Token overview (name/symbol/marketcap/volume/holders). Birdeye primary;
  // CoinGecko onchain fallback (no holder count, no 24h price change there).
  async getOverview(params: TokenLookupParams): Promise<TokenOverview> {
    const failures: string[] = []

    if (this.isBirdeyeConfigured()) {
      try {
        return await this.birdeyeOverview(params)
      } catch (error: unknown) {
        failures.push(describeFailure('birdeye', error))
      }
    } else {
      failures.push('birdeye: BIRDEYE_API_KEY is not set')
    }

    if (this.isCoinGeckoConfigured()) {
      try {
        return await this.coinGeckoOverview(params)
      } catch (error: unknown) {
        failures.push(describeFailure('coingecko-onchain', error))
      }
    } else {
      failures.push('coingecko-onchain: COIN_GECKO_PRO_API_KEY is not set')
    }

    throw new Error(
      `token overview lookup failed for ${params.address} on chain ${params.chainId}: ` +
        failures.join('; ')
    )
  }

  // OHLCV candles. Birdeye only — CoinGecko's onchain OHLCV endpoint is
  // Analyst-plan-gated and pool-scoped (it charts the single most liquid pool,
  // not the token aggregate), so a silent fallback would change the data's
  // meaning; no fallback is offered.
  async getOhlcv(params: TokenOhlcvParams): Promise<TokenOhlcv> {
    this.ensureBirdeyeConfigured()

    // Birdeye requires time_from/time_to (unix seconds). When the caller omits
    // them, derive a window that covers `limit` candles ending now; the default
    // end is floored to the minute so repeat calls can hit the cache.
    const timeTo = params.timeTo ?? Math.floor(Date.now() / 1000 / 60) * 60
    const timeFrom =
      params.timeFrom ?? timeTo - OHLCV_INTERVAL_SECONDS[params.interval] * params.limit
    const chainSlug = BIRDEYE_CHAIN_SLUGS[params.chainId]

    const data = await this.birdeyeGet({
      path: '/defi/ohlcv',
      chainId: params.chainId,
      search: {
        address: params.address,
        type: params.interval,
        currency: 'usd',
        time_from: String(timeFrom),
        time_to: String(timeTo)
      },
      cacheKey:
        `birdeye:ohlcv:${chainSlug}:${params.address}:${params.interval}:` +
        `${timeFrom}:${timeTo}`,
      ttlMs: OHLCV_TTL_MS
    })
    if (isNullish(data)) {
      throw new Error(`birdeye has no OHLCV data for ${params.address}`)
    }
    const parsed = BirdeyeOhlcvDataSchema.parse(data)
    const candles = (parsed.items ?? [])
      .map((item) => ({
        time_s: item.unixTime,
        open: item.o,
        high: item.h,
        low: item.l,
        close: item.c,
        volume: item.v ?? null
      }))
      .sort((left, right) => left.time_s - right.time_s)
      // Birdeye has no documented row-limit param on /defi/ohlcv; the window
      // above targets `limit` candles and this slice enforces it exactly.
      .slice(-params.limit)
    return TokenOhlcvSchema.parse({
      source: 'birdeye',
      address: params.address,
      chain_id: params.chainId,
      interval: params.interval,
      candles
    })
  }

  // Security / rug-risk audit. Birdeye only (no comparable fallback endpoint).
  // The raw shape differs per chain, so the result carries a best-effort common
  // core where chain-inapplicable checks stay null.
  async getSecurity(params: TokenLookupParams): Promise<TokenSecurity> {
    this.ensureBirdeyeConfigured()
    const chainSlug = BIRDEYE_CHAIN_SLUGS[params.chainId]
    const data = await this.birdeyeGet({
      path: '/defi/token_security',
      chainId: params.chainId,
      search: { address: params.address },
      cacheKey: `birdeye:token-security:${chainSlug}:${params.address}`,
      ttlMs: SECURITY_TTL_MS
    })
    if (isNullish(data)) {
      throw new Error(`birdeye has no security data for ${params.address}`)
    }
    const raw = BirdeyeTokenSecurityDataSchema.parse(data)
    return TokenSecuritySchema.parse({
      source: 'birdeye',
      address: params.address,
      chain_id: params.chainId,
      checks: {
        freezeable: raw.freezeable ?? null,
        freeze_authority: raw.freezeAuthority ?? null,
        transfer_fee_enable: raw.transferFeeEnable ?? null,
        non_transferable: raw.nonTransferable ?? null,
        mutable_metadata: raw.mutableMetadata ?? null,
        top10_holder_percent: raw.top10HolderPercent ?? null,
        owner_address: raw.ownerAddress ?? null,
        owner_percentage: toFiniteNumber(raw.ownerPercentage),
        creator_address: raw.creatorAddress ?? null,
        creator_percentage: toFiniteNumber(raw.creatorPercentage),
        is_honeypot: goPlusFlag(raw.isHoneypot),
        buy_tax: toFiniteNumber(raw.buyTax),
        sell_tax: toFiniteNumber(raw.sellTax),
        is_mintable: goPlusFlag(raw.isMintable),
        is_proxy: goPlusFlag(raw.isProxy),
        is_open_source: goPlusFlag(raw.isOpenSource),
        can_take_back_ownership: goPlusFlag(raw.canTakeBackOwnership),
        hidden_owner: goPlusFlag(raw.hiddenOwner)
      }
    })
  }

  // Top holders. Chain-routed rather than fallback-chained: Birdeye's
  // /defi/v3/token/holder is documented Solana-only, and Moralis owns the EVM
  // path via /erc20/{address}/owners.
  async getHolders(params: TokenHoldersParams): Promise<TokenHolders> {
    const { chainId } = params
    if (chainId === 'solana') {
      this.ensureBirdeyeConfigured()
      return this.birdeyeSolanaHolders(params)
    }
    this.ensureMoralisConfigured()
    return this.moralisEvmHolders({ address: params.address, chainId, limit: params.limit })
  }

  // Trending tokens for one chain, ranked ascending. Birdeye only.
  async getTrending(params: TokenTrendingParams): Promise<TokenTrending> {
    this.ensureBirdeyeConfigured()
    const chainSlug = BIRDEYE_CHAIN_SLUGS[params.chainId]
    const data = await this.birdeyeGet({
      path: '/defi/token_trending',
      chainId: params.chainId,
      search: {
        sort_by: 'rank',
        sort_type: 'asc',
        offset: '0',
        limit: String(params.limit)
      },
      cacheKey: `birdeye:token-trending:${chainSlug}:${params.limit}`,
      ttlMs: TRENDING_TTL_MS
    })
    if (isNullish(data)) {
      throw new Error(`birdeye returned no trending tokens for chain ${params.chainId}`)
    }
    const parsed = BirdeyeTrendingDataSchema.parse(data)
    return TokenTrendingSchema.parse({
      source: 'birdeye',
      chain_id: params.chainId,
      tokens: (parsed.tokens ?? []).map((token) => ({
        rank: token.rank ?? null,
        address: token.address,
        name: token.name ?? null,
        symbol: token.symbol ?? null,
        price_usd: token.price ?? null,
        volume_24h_usd: token.volume24hUSD ?? null,
        liquidity_usd: token.liquidity ?? null
      }))
    })
  }

  // -------------------------------------------------------------------------
  // Birdeye internals

  // Cached Birdeye GET. The {success, data} envelope is checked inside fetchFn
  // (success:false arrives on HTTP 200 too) so failed responses are never
  // cached, then re-parsed after cache retrieval so corrupt entries fail
  // loudly. Returns the envelope's `data` as unknown.
  private async birdeyeGet(params: BirdeyeGetParams): Promise<unknown> {
    const payload = await cachedProviderJson({
      cacheKey: params.cacheKey,
      ttlMs: params.ttlMs,
      fetchFn: async () => {
        const url = new URL(params.path, BIRDEYE_BASE_URL)
        for (const [key, value] of Object.entries(params.search)) {
          url.searchParams.set(key, value)
        }
        const raw = await providerFetchJson({
          provider: 'birdeye',
          url,
          headers: {
            'X-API-KEY': this.birdeyeApiKey,
            'x-chain': BIRDEYE_CHAIN_SLUGS[params.chainId]
          },
          secrets: [this.birdeyeApiKey]
        })
        ensureBirdeyeSuccess(raw, params.path)
        return raw
      }
    })
    ensureBirdeyeSuccess(payload, params.path)
    return BirdeyeEnvelopeSchema.parse(payload).data
  }

  private async birdeyePrice(params: TokenLookupParams): Promise<TokenPrice> {
    const chainSlug = BIRDEYE_CHAIN_SLUGS[params.chainId]
    const data = await this.birdeyeGet({
      path: '/defi/price',
      chainId: params.chainId,
      search: { address: params.address, include_liquidity: 'true' },
      cacheKey: `birdeye:price:${chainSlug}:${params.address}`,
      ttlMs: PRICE_TTL_MS
    })
    // success:true with data:null is Birdeye's normal miss for unknown tokens.
    if (isNullish(data)) {
      throw new Error(`birdeye has no price for ${params.address}`)
    }
    const parsed = BirdeyePriceDataSchema.parse(data)
    return TokenPriceSchema.parse({
      source: 'birdeye',
      address: params.address,
      chain_id: params.chainId,
      price_usd: parsed.value,
      liquidity_usd: parsed.liquidity ?? null,
      updated_at: parsed.updateUnixTime ?? null
    })
  }

  private async birdeyeOverview(params: TokenLookupParams): Promise<TokenOverview> {
    const chainSlug = BIRDEYE_CHAIN_SLUGS[params.chainId]
    const data = await this.birdeyeGet({
      path: '/defi/token_overview',
      chainId: params.chainId,
      search: { address: params.address },
      cacheKey: `birdeye:token-overview:${chainSlug}:${params.address}`,
      ttlMs: OVERVIEW_TTL_MS
    })
    if (isNullish(data)) {
      throw new Error(`birdeye has no overview for ${params.address}`)
    }
    const parsed = BirdeyeTokenOverviewDataSchema.parse(data)
    return TokenOverviewSchema.parse({
      source: 'birdeye',
      address: params.address,
      chain_id: params.chainId,
      name: parsed.name ?? null,
      symbol: parsed.symbol ?? null,
      decimals: parsed.decimals ?? null,
      price_usd: parsed.price ?? null,
      market_cap_usd: parsed.marketCap ?? null,
      fdv_usd: parsed.fdv ?? null,
      liquidity_usd: parsed.liquidity ?? null,
      volume_24h_usd: parsed.v24hUSD ?? null,
      price_change_24h_pct: parsed.priceChange24hPercent ?? null,
      holders: parsed.holder ?? null
    })
  }

  private async birdeyeSolanaHolders(params: TokenHoldersParams): Promise<TokenHolders> {
    const data = await this.birdeyeGet({
      path: '/defi/v3/token/holder',
      chainId: params.chainId,
      search: { address: params.address, offset: '0', limit: String(params.limit) },
      cacheKey: `birdeye:token-holders:solana:${params.address}:${params.limit}`,
      ttlMs: HOLDERS_TTL_MS
    })
    if (isNullish(data)) {
      throw new Error(`birdeye has no holder data for ${params.address}`)
    }
    const parsed = BirdeyeHolderDataSchema.parse(data)
    return TokenHoldersSchema.parse({
      source: 'birdeye',
      address: params.address,
      chain_id: params.chainId,
      holders: (parsed.items ?? []).slice(0, params.limit).map((item, index) => ({
        rank: index + 1,
        owner_address: item.owner,
        amount: item.ui_amount ?? null,
        // Birdeye's holder endpoint does not report supply share.
        pct_of_supply: null
      }))
    })
  }

  // -------------------------------------------------------------------------
  // Moralis internals

  private async moralisPrice(params: TokenLookupParams): Promise<TokenPrice> {
    const { chainId } = params
    if (chainId === 'solana') {
      return this.moralisSolanaPrice(params.address)
    }
    return this.moralisEvmPrice({ address: params.address, chainId })
  }

  private async moralisEvmPrice(params: {
    readonly address: string
    readonly chainId: EvmChainId
  }): Promise<TokenPrice> {
    const chainSlug = MORALIS_EVM_CHAIN_SLUGS[params.chainId]
    const payload = await cachedProviderJson({
      cacheKey: `moralis:erc20-price:${chainSlug}:${params.address}`,
      ttlMs: PRICE_TTL_MS,
      fetchFn: async () => {
        const url = new URL(
          `${MORALIS_EVM_API_PREFIX}/erc20/${encodeURIComponent(params.address)}/price`,
          MORALIS_EVM_BASE_URL
        )
        url.searchParams.set('chain', chainSlug)
        return providerFetchJson({
          provider: 'moralis',
          url,
          headers: { 'X-API-Key': this.moralisApiKey },
          secrets: [this.moralisApiKey]
        })
      }
    })
    const parsed = MoralisEvmTokenPriceSchema.parse(payload)
    return TokenPriceSchema.parse({
      source: 'moralis',
      address: params.address,
      chain_id: params.chainId,
      price_usd: parsed.usdPrice,
      liquidity_usd: toFiniteNumber(parsed.pairTotalLiquidityUsd),
      // Moralis does not report a quote timestamp.
      updated_at: null
    })
  }

  private async moralisSolanaPrice(address: string): Promise<TokenPrice> {
    const payload = await cachedProviderJson({
      cacheKey: `moralis:solana-price:mainnet:${address}`,
      ttlMs: PRICE_TTL_MS,
      fetchFn: async () => {
        const url = new URL(
          `/token/mainnet/${encodeURIComponent(address)}/price`,
          MORALIS_SOLANA_BASE_URL
        )
        return providerFetchJson({
          provider: 'moralis',
          url,
          headers: { 'X-API-Key': this.moralisApiKey },
          secrets: [this.moralisApiKey]
        })
      }
    })
    const parsed = MoralisSolanaTokenPriceSchema.parse(payload)
    return TokenPriceSchema.parse({
      source: 'moralis',
      address,
      chain_id: 'solana',
      price_usd: parsed.usdPrice,
      // The Solana price endpoint reports neither liquidity nor a timestamp.
      liquidity_usd: null,
      updated_at: null
    })
  }

  private async moralisEvmHolders(params: {
    readonly address: string
    readonly chainId: EvmChainId
    readonly limit: number
  }): Promise<TokenHolders> {
    const chainSlug = MORALIS_EVM_CHAIN_SLUGS[params.chainId]
    const payload = await cachedProviderJson({
      cacheKey: `moralis:erc20-owners:${chainSlug}:${params.address}:${params.limit}`,
      ttlMs: HOLDERS_TTL_MS,
      fetchFn: async () => {
        const url = new URL(
          `${MORALIS_EVM_API_PREFIX}/erc20/${encodeURIComponent(params.address)}/owners`,
          MORALIS_EVM_BASE_URL
        )
        url.searchParams.set('chain', chainSlug)
        url.searchParams.set('order', 'DESC')
        url.searchParams.set('limit', String(params.limit))
        return providerFetchJson({
          provider: 'moralis',
          url,
          headers: { 'X-API-Key': this.moralisApiKey },
          secrets: [this.moralisApiKey]
        })
      }
    })
    const parsed = MoralisTokenOwnersResponseSchema.parse(payload)
    return TokenHoldersSchema.parse({
      source: 'moralis',
      address: params.address,
      chain_id: params.chainId,
      holders: (parsed.result ?? []).slice(0, params.limit).map((owner, index) => ({
        rank: index + 1,
        owner_address: owner.owner_address,
        amount: toFiniteNumber(owner.balance_formatted),
        pct_of_supply: owner.percentage_relative_to_total_supply ?? null
      }))
    })
  }

  // -------------------------------------------------------------------------
  // CoinGecko onchain internals

  private async coinGeckoOverview(params: TokenLookupParams): Promise<TokenOverview> {
    const networkSlug = COINGECKO_ONCHAIN_NETWORK_SLUGS[params.chainId]
    const payload = await cachedProviderJson({
      cacheKey: `coingecko:onchain-token:${networkSlug}:${params.address}`,
      ttlMs: OVERVIEW_TTL_MS,
      fetchFn: async () => {
        const url = new URL(
          `/api/v3/onchain/networks/${networkSlug}/tokens/` + encodeURIComponent(params.address),
          COINGECKO_BASE_URL
        )
        return providerFetchJson({
          provider: 'coingecko-onchain',
          url,
          headers: { 'x-cg-pro-api-key': this.coinGeckoProApiKey },
          secrets: [this.coinGeckoProApiKey]
        })
      }
    })
    // JSON:API shape: every numeric attribute arrives as a STRING (and
    // market_cap_usd/price_usd are nullable) — parse them into numbers here.
    const attributes = CoinGeckoOnchainTokenResponseSchema.parse(payload).data.attributes
    return TokenOverviewSchema.parse({
      source: 'coingecko-onchain',
      address: params.address,
      chain_id: params.chainId,
      name: attributes.name ?? null,
      symbol: attributes.symbol ?? null,
      decimals: attributes.decimals ?? null,
      price_usd: toFiniteNumber(attributes.price_usd),
      market_cap_usd: toFiniteNumber(attributes.market_cap_usd),
      fdv_usd: toFiniteNumber(attributes.fdv_usd),
      // total_reserve_in_usd is the closest onchain analogue to liquidity.
      liquidity_usd: toFiniteNumber(attributes.total_reserve_in_usd),
      volume_24h_usd: toFiniteNumber(attributes.volume_usd?.h24),
      // Not reported by the onchain token endpoint.
      price_change_24h_pct: null,
      // Holder count is Birdeye-only.
      holders: null
    })
  }
}

// Throws when a Birdeye payload is not a success envelope; used both before
// caching (so failures are never persisted) and after retrieval.
function ensureBirdeyeSuccess(payload: unknown, path: string): void {
  const envelope = BirdeyeEnvelopeSchema.parse(payload)
  if (!envelope.success) {
    const detail = envelope.message ?? 'no error message'
    throw new Error(`birdeye ${path} returned success=false: ${detail}`)
  }
}

function describeFailure(provider: string, error: unknown): string {
  const message = error instanceof Error ? error.message : 'unknown error'
  return `${provider}: ${message}`
}

// Provider string-numbers ('123.45') and plain numbers to a finite number;
// empty strings, non-numeric strings, and nullish inputs become null.
function toFiniteNumber(value: string | number | null | undefined): number | null {
  if (isNullish(value)) {
    return null
  }
  if (typeof value === 'string' && value.trim() === '') {
    return null
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

// GoPlus-style EVM security flags arrive as '0'/'1' strings; anything else
// (missing, empty, unexpected) is unknown → null.
function goPlusFlag(value: string | null | undefined): boolean | null {
  if (value === '1') {
    return true
  }
  if (value === '0') {
    return false
  }
  return null
}
