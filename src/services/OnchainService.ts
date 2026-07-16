import { cachedProviderJson } from '@/helpers/ProviderCache'
import {
  ALCHEMY_NETWORK_SLUGS,
  ALCHEMY_TRANSFERS_CHAIN_IDS,
  MORALIS_EVM_CHAIN_SLUGS
} from '@/helpers/ProviderChains'
import { providerFetchJson, ProviderHttpError, redactSecrets } from '@/helpers/ProviderHttp'
import type { ChainId, EvmChainId } from '@/types/ChainId'
import { SUPPORTED_EVM_CHAIN_IDS } from '@/types/ChainId'
import type {
  AlchemyAssetTransfer,
  HeliusAsset,
  HeliusEnhancedTransaction,
  HeliusNativeBalance,
  MoralisHistoryItem,
  MoralisSolanaToken,
  MoralisWalletToken,
  OnchainAsset,
  OnchainBalances,
  OnchainDirection,
  OnchainNetWorth,
  OnchainProvider,
  OnchainTransfer,
  OnchainTransfers
} from '@/types/Onchain'
import {
  AlchemyAssetTransfersResultSchema,
  AlchemyTokenBalancesResultSchema,
  AlchemyTokenMetadataResultSchema,
  HeliusEnhancedTransactionsResponseSchema,
  HeliusSearchAssetsResultSchema,
  JsonRpcResponseSchema,
  MoralisHistoryResponseSchema,
  MoralisNetWorthResponseSchema,
  MoralisSolanaPortfolioResponseSchema,
  MoralisWalletTokensResponseSchema,
  OnchainBalancesSchema,
  OnchainNetWorthSchema,
  OnchainTransfersSchema
} from '@/types/Onchain'
import { chunkArray, compactMap, isNullish } from '@/utils/Lang'

// Third-party wallet forensics: token balances, net worth, and transfer history
// for arbitrary addresses via Moralis, Alchemy, and Helius.
// Routing:
// - EVM balances: Moralis (prices included) -> Alchemy fallback (no prices).
// - Solana balances: Helius DAS (prices included) -> Moralis portfolio fallback.
// - Net worth: Moralis only (EVM chains only).
// - EVM transfers: Alchemy where alchemy_getAssetTransfers is supported,
//   Moralis wallet history elsewhere (BNB). Solana transfers: Helius Enhanced.
// Auth: Moralis X-API-Key header; Alchemy key is a URL path segment (the URL is
// secret-bearing, so cache keys are built from logical parts and errors are
// re-redacted); Helius api-key query param.

const MORALIS_EVM_BASE_URL = 'https://deep-index.moralis.io'
const MORALIS_EVM_API_PREFIX = '/api/v2.2'
const MORALIS_SOLANA_BASE_URL = 'https://solana-gateway.moralis.io'
const HELIUS_RPC_BASE_URL = 'https://mainnet.helius-rpc.com'
const HELIUS_ENHANCED_BASE_URL = 'https://api-mainnet.helius-rpc.com'

const BALANCES_CACHE_TTL_MS = 60 * 1000
const NET_WORTH_CACHE_TTL_MS = 60 * 1000
const TRANSFERS_CACHE_TTL_MS = 60 * 1000
// Token name/symbol/decimals are immutable in practice; cache far longer.
const TOKEN_METADATA_CACHE_TTL_MS = 60 * 60 * 1000

const ALCHEMY_TOKEN_BALANCES_MAX_COUNT = 100
// The 'erc20' token spec returns every contract the wallet ever touched
// (including zero balances and spam) in pages of maxCount — follow pageKey a
// bounded number of pages so real holdings beyond page one are not dropped.
const ALCHEMY_TOKEN_BALANCES_MAX_PAGES = 5
// Metadata lookups fan out per token; keep concurrency low to respect the
// free tier's CU/s throughput instead of firing 100 calls at once.
const ALCHEMY_METADATA_CONCURRENCY = 5
const LAMPORTS_PER_SOL = 1_000_000_000
const SOLANA_NATIVE_DECIMALS = 9

type OnchainServiceParams = {
  readonly moralisApiKey: string
  readonly alchemyApiKey: string
  readonly heliusApiKey: string
}

type GetBalancesParams = {
  readonly address: string
  readonly chainId: ChainId
  readonly limit: number
}

type GetNetWorthParams = {
  readonly address: string
  readonly chainIds: readonly EvmChainId[]
}

type GetTransfersParams = {
  readonly address: string
  readonly chainId: ChainId
  readonly limit: number
}

type EvmLookupParams = {
  readonly address: string
  readonly chainId: EvmChainId
  readonly limit: number
}

type SolanaLookupParams = {
  readonly address: string
  readonly limit: number
}

export class OnchainService {
  private readonly moralisApiKey: string
  private readonly alchemyApiKey: string
  private readonly heliusApiKey: string

  constructor(params: OnchainServiceParams) {
    this.moralisApiKey = params.moralisApiKey
    this.alchemyApiKey = params.alchemyApiKey
    this.heliusApiKey = params.heliusApiKey
  }

  isConfigured(): boolean {
    return this.isMoralisConfigured() || this.isAlchemyConfigured() || this.isHeliusConfigured()
  }

  private isMoralisConfigured(): boolean {
    return this.moralisApiKey.length > 0
  }

  private isAlchemyConfigured(): boolean {
    return this.alchemyApiKey.length > 0
  }

  private isHeliusConfigured(): boolean {
    return this.heliusApiKey.length > 0
  }

  private ensureMoralisConfigured(capability: string): void {
    if (!this.isMoralisConfigured()) {
      throw new Error(`MORALIS_API_KEY is not set; ${capability} is disabled`)
    }
  }

  private ensureAlchemyConfigured(capability: string): void {
    if (!this.isAlchemyConfigured()) {
      throw new Error(`ALCHEMY_API_KEY is not set; ${capability} is disabled`)
    }
  }

  private ensureHeliusConfigured(capability: string): void {
    if (!this.isHeliusConfigured()) {
      throw new Error(`HELIUS_API_KEY is not set; ${capability} is disabled`)
    }
  }

  // Token balances (native + fungible) with USD values where the provider has
  // them; sorted by usd_value descending (nulls last), truncated to limit.
  async getBalances(params: GetBalancesParams): Promise<OnchainBalances> {
    const { address, limit } = params
    const chainId = params.chainId
    if (chainId === 'solana') {
      return this.fetchWithFallback({
        primaryConfigured: this.isHeliusConfigured(),
        fallbackConfigured: this.isMoralisConfigured(),
        unconfiguredMessage:
          'HELIUS_API_KEY and MORALIS_API_KEY are not set; onchain Solana balances are disabled',
        primary: () => this.getSolanaBalancesFromHelius({ address, limit }),
        fallback: () => this.getSolanaBalancesFromMoralis({ address, limit })
      })
    }
    return this.fetchWithFallback({
      primaryConfigured: this.isMoralisConfigured(),
      fallbackConfigured: this.isAlchemyConfigured(),
      unconfiguredMessage:
        'MORALIS_API_KEY and ALCHEMY_API_KEY are not set; onchain EVM balances are disabled',
      primary: () => this.getEvmBalancesFromMoralis({ address, chainId, limit }),
      fallback: () => this.getEvmBalancesFromAlchemy({ address, chainId, limit })
    })
  }

  // Total wallet net worth in USD across EVM chains (Moralis only).
  async getNetWorth(params: GetNetWorthParams): Promise<OnchainNetWorth> {
    this.ensureMoralisConfigured('onchain net-worth')
    const slugs = params.chainIds.map((chainId) => MORALIS_EVM_CHAIN_SLUGS[chainId])
    const url = new URL(
      `${MORALIS_EVM_API_PREFIX}/wallets/${params.address}/net-worth`,
      MORALIS_EVM_BASE_URL
    )
    url.searchParams.set('exclude_spam', 'true')
    url.searchParams.set('exclude_unverified_contracts', 'true')
    slugs.forEach((slug, index) => url.searchParams.set(`chains[${index}]`, slug))
    const data = await this.moralisGet({
      url,
      cacheKey: `moralis:net-worth:${params.address.toLowerCase()}:${slugs.join(',')}`,
      ttlMs: NET_WORTH_CACHE_TTL_MS
    })
    const parsed = MoralisNetWorthResponseSchema.parse(data)
    const chains = compactMap(
      (parsed.chains ?? []).map((chainEntry) => {
        const chainId = MORALIS_SLUG_TO_EVM_CHAIN_ID[chainEntry.chain]
        const networthUsd = toFiniteNumber(chainEntry.networth_usd)
        if (isNullish(chainId) || isNullish(networthUsd)) {
          return null
        }
        return { chain_id: chainId, networth_usd: networthUsd }
      })
    )
    const total =
      toFiniteNumber(parsed.total_networth_usd) ??
      chains.reduce((sum, chainEntry) => sum + chainEntry.networth_usd, 0)
    return OnchainNetWorthSchema.parse({
      source: 'moralis',
      address: params.address,
      total_networth_usd: total,
      chains
    })
  }

  // Latest transfers for an address, newest first, truncated to limit.
  async getTransfers(params: GetTransfersParams): Promise<OnchainTransfers> {
    const { address, limit } = params
    const chainId = params.chainId
    if (chainId === 'solana') {
      return this.getSolanaTransfersFromHelius({ address, limit })
    }
    if (ALCHEMY_TRANSFERS_CHAIN_IDS.includes(chainId)) {
      return this.getEvmTransfersFromAlchemy({ address, chainId, limit })
    }
    // alchemy_getAssetTransfers is not documented for this chain (BNB): use
    // Moralis decoded wallet history instead.
    return this.getEvmTransfersFromMoralis({ address, chainId, limit })
  }

  // --- balances providers ------------------------------------------------------

  private async getEvmBalancesFromMoralis(params: EvmLookupParams): Promise<OnchainBalances> {
    this.ensureMoralisConfigured('onchain EVM balances')
    const slug = MORALIS_EVM_CHAIN_SLUGS[params.chainId]
    const url = new URL(
      `${MORALIS_EVM_API_PREFIX}/wallets/${params.address}/tokens`,
      MORALIS_EVM_BASE_URL
    )
    url.searchParams.set('chain', slug)
    url.searchParams.set('exclude_spam', 'true')
    const data = await this.moralisGet({
      url,
      cacheKey: `moralis:wallet-tokens:${slug}:${params.address.toLowerCase()}`,
      ttlMs: BALANCES_CACHE_TTL_MS
    })
    const parsed = MoralisWalletTokensResponseSchema.parse(data)
    const assets = compactMap((parsed.result ?? []).map(toAssetFromMoralisEvmToken))
    return finalizeBalances({
      source: 'moralis',
      address: params.address,
      chainId: params.chainId,
      assets,
      limit: params.limit
    })
  }

  private async getEvmBalancesFromAlchemy(params: EvmLookupParams): Promise<OnchainBalances> {
    this.ensureAlchemyConfigured('onchain EVM balances')
    const slug = ALCHEMY_NETWORK_SLUGS[params.chainId]
    const addressKey = params.address.toLowerCase()
    const balancesResult = await cachedProviderJson({
      cacheKey: `alchemy:token-balances:${slug}:${addressKey}:${params.limit}`,
      ttlMs: BALANCES_CACHE_TTL_MS,
      fetchFn: async () => {
        // Follow pageKey until enough nonzero balances are collected; a page
        // full of zero/spam entries must not hide real holdings further on.
        const collected: unknown[] = []
        let nonzeroCount = 0
        let pageKey: string | undefined
        for (let page = 0; page < ALCHEMY_TOKEN_BALANCES_MAX_PAGES; page += 1) {
          const options: Record<string, unknown> = { maxCount: ALCHEMY_TOKEN_BALANCES_MAX_COUNT }
          if (!isNullish(pageKey)) {
            options.pageKey = pageKey
          }
          const pageResult = await this.alchemyRpcUncached({
            chainId: params.chainId,
            method: 'alchemy_getTokenBalances',
            rpcParams: [params.address, 'erc20', options]
          })
          const parsedPage = AlchemyTokenBalancesResultSchema.parse(pageResult)
          const pageBalances = parsedPage.tokenBalances ?? []
          collected.push(...pageBalances)
          nonzeroCount += compactMap(pageBalances.map((entry) => toNonzeroToken(entry))).length
          pageKey = parsedPage.pageKey ?? undefined
          if (isNullish(pageKey) || nonzeroCount >= params.limit) {
            break
          }
        }
        return { tokenBalances: collected }
      }
    })
    const parsed = AlchemyTokenBalancesResultSchema.parse(balancesResult)
    // Balances are hex strings of raw base units; drop zero/unreadable entries
    // and cap metadata lookups at the requested limit.
    const nonzeroTokens = compactMap(
      (parsed.tokenBalances ?? []).map((entry) => toNonzeroToken(entry))
    ).slice(0, params.limit)
    // Bounded concurrency; a token whose metadata lookup fails is dropped (its
    // amount cannot be scaled without decimals) instead of failing the call —
    // unless every lookup failed, which indicates a provider outage.
    const assets: OnchainAsset[] = []
    let metadataFailures = 0
    for (const batch of chunkArray([...nonzeroTokens], ALCHEMY_METADATA_CONCURRENCY)) {
      const batchAssets = await Promise.all(
        batch.map(async (token) => {
          let metadataResult: unknown
          try {
            metadataResult = await this.alchemyRpc({
              chainId: params.chainId,
              method: 'alchemy_getTokenMetadata',
              rpcParams: [token.contractAddress],
              cacheKey: `alchemy:token-metadata:${slug}:${token.contractAddress.toLowerCase()}`,
              ttlMs: TOKEN_METADATA_CACHE_TTL_MS
            })
          } catch {
            metadataFailures += 1
            return null
          }
          const metadata = AlchemyTokenMetadataResultSchema.parse(metadataResult)
          if (isNullish(metadata.decimals)) {
            return null
          }
          return {
            token_address: token.contractAddress,
            symbol: metadata.symbol ?? null,
            name: metadata.name ?? null,
            decimals: metadata.decimals,
            amount: scaleRawAmount(token.rawBalance, metadata.decimals),
            // The Alchemy token API has no prices; never fabricate one.
            usd_value: null
          }
        })
      )
      assets.push(...compactMap(batchAssets))
    }
    if (nonzeroTokens.length > 0 && metadataFailures === nonzeroTokens.length) {
      throw new Error('alchemy token metadata lookups failed for every token')
    }
    return finalizeBalances({
      source: 'alchemy',
      address: params.address,
      chainId: params.chainId,
      assets,
      limit: params.limit
    })
  }

  private async getSolanaBalancesFromHelius(params: SolanaLookupParams): Promise<OnchainBalances> {
    this.ensureHeliusConfigured('onchain Solana balances')
    const result = await this.heliusRpc({
      method: 'searchAssets',
      rpcParams: {
        ownerAddress: params.address,
        tokenType: 'fungible',
        displayOptions: { showNativeBalance: true }
      },
      // Solana addresses are case-sensitive: do not lowercase.
      cacheKey: `helius:search-assets:fungible:${params.address}`,
      ttlMs: BALANCES_CACHE_TTL_MS
    })
    const parsed = HeliusSearchAssetsResultSchema.parse(result)
    const payload = parsed.assets ?? parsed
    const tokenAssets = compactMap((payload.items ?? []).map(toAssetFromHeliusItem))
    const assets = compactMap([
      toAssetFromHeliusNativeBalance(payload.nativeBalance),
      ...tokenAssets
    ])
    return finalizeBalances({
      source: 'helius',
      address: params.address,
      chainId: 'solana',
      assets,
      limit: params.limit
    })
  }

  private async getSolanaBalancesFromMoralis(params: SolanaLookupParams): Promise<OnchainBalances> {
    this.ensureMoralisConfigured('onchain Solana balances')
    const url = new URL(`/account/mainnet/${params.address}/portfolio`, MORALIS_SOLANA_BASE_URL)
    const data = await this.moralisGet({
      url,
      cacheKey: `moralis:solana-portfolio:${params.address}`,
      ttlMs: BALANCES_CACHE_TTL_MS
    })
    const parsed = MoralisSolanaPortfolioResponseSchema.parse(data)
    const tokenAssets = compactMap((parsed.tokens ?? []).map(toAssetFromMoralisSolanaToken))
    const nativeAmount =
      toFiniteNumber(parsed.nativeBalance?.solana) ??
      scaleRawText(parsed.nativeBalance?.lamports, SOLANA_NATIVE_DECIMALS)
    const nativeAsset: OnchainAsset | null = isNullish(nativeAmount)
      ? null
      : {
          token_address: null,
          symbol: 'SOL',
          name: 'Solana',
          decimals: SOLANA_NATIVE_DECIMALS,
          amount: nativeAmount,
          // Moralis' Solana portfolio has no USD prices; never fabricate one.
          usd_value: null
        }
    return finalizeBalances({
      source: 'moralis',
      address: params.address,
      chainId: 'solana',
      assets: compactMap([nativeAsset, ...tokenAssets]),
      limit: params.limit
    })
  }

  // --- transfers providers -----------------------------------------------------

  private async getEvmTransfersFromAlchemy(params: EvmLookupParams): Promise<OnchainTransfers> {
    this.ensureAlchemyConfigured('onchain transfers on this chain')
    const slug = ALCHEMY_NETWORK_SLUGS[params.chainId]
    const addressKey = params.address.toLowerCase()
    const baseFilter = {
      category: ['external', 'erc20'],
      order: 'desc',
      withMetadata: true,
      maxCount: `0x${params.limit.toString(16)}`
    }
    // alchemy_getAssetTransfers ANDs fromAddress and toAddress filters, so a
    // single call cannot return both sides: query each direction and merge.
    const [outResult, inResult] = await Promise.all([
      this.alchemyRpc({
        chainId: params.chainId,
        method: 'alchemy_getAssetTransfers',
        rpcParams: [{ ...baseFilter, fromAddress: params.address }],
        cacheKey: `alchemy:asset-transfers:${slug}:${addressKey}:from:${params.limit}`,
        ttlMs: TRANSFERS_CACHE_TTL_MS
      }),
      this.alchemyRpc({
        chainId: params.chainId,
        method: 'alchemy_getAssetTransfers',
        rpcParams: [{ ...baseFilter, toAddress: params.address }],
        cacheKey: `alchemy:asset-transfers:${slug}:${addressKey}:to:${params.limit}`,
        ttlMs: TRANSFERS_CACHE_TTL_MS
      })
    ])
    const outTransfers = AlchemyAssetTransfersResultSchema.parse(outResult).transfers ?? []
    const inTransfers = AlchemyAssetTransfersResultSchema.parse(inResult).transfers ?? []
    const merged = new Map<string, { blockNumber: number; transfer: OnchainTransfer }>()
    const addTransfers = (
      transfers: readonly AlchemyAssetTransfer[],
      direction: OnchainDirection
    ): void => {
      for (const transfer of transfers) {
        if (merged.has(transfer.uniqueId)) {
          continue
        }
        merged.set(transfer.uniqueId, {
          blockNumber: parseHexBlockNumber(transfer.blockNum),
          transfer: toTransferFromAlchemy({ transfer, direction })
        })
      }
    }
    addTransfers(outTransfers, 'out')
    addTransfers(inTransfers, 'in')
    const transfers = Array.from(merged.values())
      .sort((a, b) => b.blockNumber - a.blockNumber)
      .slice(0, params.limit)
      .map((entry) => entry.transfer)
    return OnchainTransfersSchema.parse({
      source: 'alchemy',
      address: params.address,
      chain_id: params.chainId,
      transfers
    })
  }

  private async getEvmTransfersFromMoralis(params: EvmLookupParams): Promise<OnchainTransfers> {
    this.ensureMoralisConfigured('onchain transfers on this chain')
    const slug = MORALIS_EVM_CHAIN_SLUGS[params.chainId]
    const url = new URL(
      `${MORALIS_EVM_API_PREFIX}/wallets/${params.address}/history`,
      MORALIS_EVM_BASE_URL
    )
    url.searchParams.set('chain', slug)
    url.searchParams.set('order', 'DESC')
    url.searchParams.set('limit', String(params.limit))
    const data = await this.moralisGet({
      url,
      cacheKey: `moralis:wallet-history:${slug}:${params.address.toLowerCase()}:${params.limit}`,
      ttlMs: TRANSFERS_CACHE_TTL_MS
    })
    const parsed = MoralisHistoryResponseSchema.parse(data)
    const walletAddressLower = params.address.toLowerCase()
    const transfers = (parsed.result ?? [])
      .slice(0, params.limit)
      .map((item) => toTransferFromMoralisHistoryItem({ item, walletAddressLower }))
    return OnchainTransfersSchema.parse({
      source: 'moralis',
      address: params.address,
      chain_id: params.chainId,
      transfers
    })
  }

  private async getSolanaTransfersFromHelius(
    params: SolanaLookupParams
  ): Promise<OnchainTransfers> {
    this.ensureHeliusConfigured('onchain Solana transfers')
    const url = new URL(`/v0/addresses/${params.address}/transactions`, HELIUS_ENHANCED_BASE_URL)
    url.searchParams.set('api-key', this.heliusApiKey)
    url.searchParams.set('limit', String(params.limit))
    const data = await cachedProviderJson({
      cacheKey: `helius:address-transactions:${params.address}:${params.limit}`,
      ttlMs: TRANSFERS_CACHE_TTL_MS,
      fetchFn: async () =>
        providerFetchJson({ provider: 'helius', url, secrets: [this.heliusApiKey] })
    })
    const parsed = HeliusEnhancedTransactionsResponseSchema.parse(data)
    const transfers = parsed
      .slice(0, params.limit)
      .map((transaction) =>
        toTransferFromHeliusTransaction({ transaction, walletAddress: params.address })
      )
    return OnchainTransfersSchema.parse({
      source: 'helius',
      address: params.address,
      chain_id: 'solana',
      transfers
    })
  }

  // --- provider plumbing ---------------------------------------------------------

  private async moralisGet(params: {
    readonly url: URL
    readonly cacheKey: string
    readonly ttlMs: number
  }): Promise<unknown> {
    return cachedProviderJson({
      cacheKey: params.cacheKey,
      ttlMs: params.ttlMs,
      fetchFn: async () =>
        providerFetchJson({
          provider: 'moralis',
          url: params.url,
          headers: { 'X-API-Key': this.moralisApiKey },
          secrets: [this.moralisApiKey]
        })
    })
  }

  // Alchemy's key is a path segment, so the request URL itself is a secret:
  // build it only inside the fetch closure, keep cache keys logical, and
  // re-redact thrown errors (whose pathname would otherwise echo the key).
  private async alchemyRpc(params: {
    readonly chainId: EvmChainId
    readonly method: string
    readonly rpcParams: readonly unknown[]
    readonly cacheKey: string
    readonly ttlMs: number
  }): Promise<unknown> {
    // The JSON-RPC envelope is validated INSIDE fetchFn: providers return
    // method-level errors as HTTP 200 + {error}, and validating after caching
    // would poison the cache with failures for the full TTL. Only the unwrapped
    // `result` value is ever cached.
    return cachedProviderJson({
      cacheKey: params.cacheKey,
      ttlMs: params.ttlMs,
      fetchFn: async () =>
        this.alchemyRpcUncached({
          chainId: params.chainId,
          method: params.method,
          rpcParams: params.rpcParams
        })
    })
  }

  // One uncached Alchemy JSON-RPC call with envelope validation and key
  // redaction; used directly by multi-page loops that cache their own
  // combined payload.
  private async alchemyRpcUncached(params: {
    readonly chainId: EvmChainId
    readonly method: string
    readonly rpcParams: readonly unknown[]
  }): Promise<unknown> {
    const slug = ALCHEMY_NETWORK_SLUGS[params.chainId]
    const url = new URL(`/v2/${this.alchemyApiKey}`, `https://${slug}.g.alchemy.com`)
    try {
      const data = await providerFetchJson({
        provider: 'alchemy',
        url,
        method: 'POST',
        jsonBody: { jsonrpc: '2.0', id: 1, method: params.method, params: params.rpcParams },
        secrets: [this.alchemyApiKey]
      })
      return ensureJsonRpcResult({
        provider: 'alchemy',
        method: params.method,
        data,
        secrets: [this.alchemyApiKey]
      })
    } catch (error: unknown) {
      throw toRedactedError(error, [this.alchemyApiKey])
    }
  }

  private async heliusRpc(params: {
    readonly method: string
    readonly rpcParams: unknown
    readonly cacheKey: string
    readonly ttlMs: number
  }): Promise<unknown> {
    // Envelope validated inside fetchFn — see alchemyRpc for the rationale.
    return cachedProviderJson({
      cacheKey: params.cacheKey,
      ttlMs: params.ttlMs,
      fetchFn: async () => {
        const url = new URL('/', HELIUS_RPC_BASE_URL)
        url.searchParams.set('api-key', this.heliusApiKey)
        const data = await providerFetchJson({
          provider: 'helius',
          url,
          method: 'POST',
          jsonBody: { jsonrpc: '2.0', id: 1, method: params.method, params: params.rpcParams },
          secrets: [this.heliusApiKey]
        })
        return ensureJsonRpcResult({
          provider: 'helius',
          method: params.method,
          data,
          secrets: [this.heliusApiKey]
        })
      }
    })
  }

  // Try the configured primary provider, degrade to the fallback both when the
  // primary is unconfigured and when it fails at runtime.
  private async fetchWithFallback<T>(params: {
    readonly primaryConfigured: boolean
    readonly fallbackConfigured: boolean
    readonly unconfiguredMessage: string
    readonly primary: () => Promise<T>
    readonly fallback: () => Promise<T>
  }): Promise<T> {
    if (params.primaryConfigured) {
      try {
        return await params.primary()
      } catch (error: unknown) {
        if (!params.fallbackConfigured) {
          throw error
        }
        const primaryReason = error instanceof Error ? error.message : 'unknown error'
        try {
          return await params.fallback()
        } catch (fallbackError: unknown) {
          const fallbackReason =
            fallbackError instanceof Error ? fallbackError.message : 'unknown error'
          throw new Error(`all providers failed: [${primaryReason}]; [${fallbackReason}]`)
        }
      }
    }
    if (params.fallbackConfigured) {
      return params.fallback()
    }
    throw new Error(params.unconfiguredMessage)
  }
}

// --- normalization helpers -------------------------------------------------------

function buildMoralisSlugToEvmChainId(): Readonly<Record<string, EvmChainId>> {
  const map: Record<string, EvmChainId> = {}
  for (const chainId of SUPPORTED_EVM_CHAIN_IDS) {
    map[MORALIS_EVM_CHAIN_SLUGS[chainId]] = chainId
  }
  return map
}

const MORALIS_SLUG_TO_EVM_CHAIN_ID = buildMoralisSlugToEvmChainId()

function finalizeBalances(params: {
  readonly source: OnchainProvider
  readonly address: string
  readonly chainId: ChainId
  readonly assets: readonly OnchainAsset[]
  readonly limit: number
}): OnchainBalances {
  const sorted = [...params.assets].sort((a, b) => {
    if (isNullish(a.usd_value)) {
      return isNullish(b.usd_value) ? 0 : 1
    }
    if (isNullish(b.usd_value)) {
      return -1
    }
    return b.usd_value - a.usd_value
  })
  return OnchainBalancesSchema.parse({
    source: params.source,
    address: params.address,
    chain_id: params.chainId,
    assets: sorted.slice(0, params.limit)
  })
}

function toAssetFromMoralisEvmToken(token: MoralisWalletToken): OnchainAsset | null {
  const amount =
    toFiniteNumber(token.balance_formatted) ?? scaleRawText(token.balance, token.decimals)
  if (isNullish(amount)) {
    return null
  }
  const isNative = token.native_token === true
  return {
    // Moralis reports the wrapped-native contract on the native entry; the
    // normalized shape uses null for native assets.
    token_address: isNative ? null : (token.token_address ?? null),
    symbol: token.symbol ?? null,
    name: token.name ?? null,
    decimals: token.decimals ?? null,
    amount,
    usd_value: token.usd_value ?? null
  }
}

function toAssetFromMoralisSolanaToken(token: MoralisSolanaToken): OnchainAsset | null {
  const amount = toFiniteNumber(token.amount) ?? scaleRawText(token.amountRaw, token.decimals)
  if (isNullish(amount)) {
    return null
  }
  return {
    token_address: token.mint ?? null,
    symbol: token.symbol ?? null,
    name: token.name ?? null,
    decimals: token.decimals ?? null,
    amount,
    usd_value: null
  }
}

function toAssetFromHeliusItem(item: HeliusAsset): OnchainAsset | null {
  const tokenInfo = item.token_info
  if (isNullish(tokenInfo) || isNullish(tokenInfo.balance) || isNullish(tokenInfo.decimals)) {
    return null
  }
  return {
    token_address: item.id,
    symbol: tokenInfo.symbol ?? item.content?.metadata?.symbol ?? null,
    name: item.content?.metadata?.name ?? null,
    decimals: tokenInfo.decimals,
    // token_info.balance is raw base units.
    amount: tokenInfo.balance / 10 ** tokenInfo.decimals,
    usd_value: tokenInfo.price_info?.total_price ?? null
  }
}

function toAssetFromHeliusNativeBalance(
  nativeBalance: HeliusNativeBalance | null | undefined
): OnchainAsset | null {
  if (isNullish(nativeBalance) || isNullish(nativeBalance.lamports)) {
    return null
  }
  return {
    token_address: null,
    symbol: 'SOL',
    name: 'Solana',
    decimals: SOLANA_NATIVE_DECIMALS,
    amount: nativeBalance.lamports / LAMPORTS_PER_SOL,
    usd_value: nativeBalance.total_price ?? null
  }
}

function toTransferFromAlchemy(params: {
  readonly transfer: AlchemyAssetTransfer
  readonly direction: OnchainDirection
}): OnchainTransfer {
  const { transfer, direction } = params
  return {
    hash: transfer.hash,
    timestamp: transfer.metadata?.blockTimestamp ?? null,
    direction,
    counterparty: direction === 'out' ? (transfer.to ?? null) : (transfer.from ?? null),
    asset: transfer.asset ?? transfer.rawContract?.address ?? null,
    amount: transfer.value ?? null,
    category: transfer.category
  }
}

function toTransferFromMoralisHistoryItem(params: {
  readonly item: MoralisHistoryItem
  readonly walletAddressLower: string
}): OnchainTransfer {
  const { item, walletAddressLower } = params
  const fromLower = item.from_address?.toLowerCase() ?? null
  const toLower = item.to_address?.toLowerCase() ?? null
  const direction: OnchainDirection | null =
    fromLower === walletAddressLower ? 'out' : toLower === walletAddressLower ? 'in' : null
  const counterparty =
    direction === 'out'
      ? (item.to_address ?? null)
      : direction === 'in'
        ? (item.from_address ?? null)
        : null
  const erc20Transfer = item.erc20_transfers?.[0]
  const nativeTransfer = item.native_transfers?.[0]
  const asset = erc20Transfer?.token_symbol ?? nativeTransfer?.token_symbol ?? null
  const amount = toFiniteNumber(erc20Transfer?.value_formatted ?? nativeTransfer?.value_formatted)
  return {
    hash: item.hash,
    timestamp: item.block_timestamp ?? null,
    direction,
    counterparty,
    asset,
    amount,
    category: item.category ?? 'unknown'
  }
}

function toTransferFromHeliusTransaction(params: {
  readonly transaction: HeliusEnhancedTransaction
  readonly walletAddress: string
}): OnchainTransfer {
  const { transaction, walletAddress } = params
  const tokenTransfer = (transaction.tokenTransfers ?? []).find(
    (transfer) =>
      transfer.fromUserAccount === walletAddress || transfer.toUserAccount === walletAddress
  )
  const nativeTransfer = isNullish(tokenTransfer)
    ? (transaction.nativeTransfers ?? []).find(
        (transfer) =>
          transfer.fromUserAccount === walletAddress || transfer.toUserAccount === walletAddress
      )
    : undefined
  let direction: OnchainDirection | null = null
  let counterparty: string | null = null
  let asset: string | null = null
  let amount: number | null = null
  if (!isNullish(tokenTransfer)) {
    direction = tokenTransfer.fromUserAccount === walletAddress ? 'out' : 'in'
    counterparty =
      direction === 'out'
        ? (tokenTransfer.toUserAccount ?? null)
        : (tokenTransfer.fromUserAccount ?? null)
    asset = tokenTransfer.mint ?? null
    amount = tokenTransfer.tokenAmount ?? null
  } else if (!isNullish(nativeTransfer)) {
    direction = nativeTransfer.fromUserAccount === walletAddress ? 'out' : 'in'
    counterparty =
      direction === 'out'
        ? (nativeTransfer.toUserAccount ?? null)
        : (nativeTransfer.fromUserAccount ?? null)
    asset = 'SOL'
    amount = isNullish(nativeTransfer.amount) ? null : nativeTransfer.amount / LAMPORTS_PER_SOL
  }
  return {
    hash: transaction.signature,
    timestamp: isNullish(transaction.timestamp)
      ? null
      : new Date(transaction.timestamp * 1000).toISOString(),
    direction,
    counterparty,
    asset,
    amount,
    category: transaction.type ?? 'UNKNOWN'
  }
}

// --- parsing helpers ---------------------------------------------------------------

function ensureJsonRpcResult(params: {
  readonly provider: string
  readonly method: string
  readonly data: unknown
  readonly secrets: readonly string[]
}): unknown {
  const envelope = JsonRpcResponseSchema.parse(params.data)
  if (!isNullish(envelope.error)) {
    const message = envelope.error.message ?? `code ${envelope.error.code ?? 'unknown'}`
    throw new Error(
      `${params.provider} ${params.method} failed: ${redactSecrets(message, params.secrets)}`
    )
  }
  if (isNullish(envelope.result)) {
    throw new Error(`${params.provider} ${params.method} returned an empty result`)
  }
  return envelope.result
}

function toRedactedError(error: unknown, secrets: readonly string[]): Error {
  if (error instanceof ProviderHttpError) {
    return new ProviderHttpError({
      provider: error.provider,
      status: error.status,
      message: redactSecrets(error.message, secrets)
    })
  }
  if (error instanceof Error) {
    return new Error(redactSecrets(error.message, secrets))
  }
  return new Error('unknown provider error')
}

function parseHexBlockNumber(blockNum: string | null | undefined): number {
  if (isNullish(blockNum)) {
    return 0
  }
  const value = Number.parseInt(blockNum, 16)
  return Number.isFinite(value) ? value : 0
}

function toFiniteNumber(text: string | null | undefined): number | null {
  if (isNullish(text) || text.trim().length === 0) {
    return null
  }
  const value = Number(text)
  return Number.isFinite(value) ? value : null
}

function toNonzeroToken(entry: {
  readonly contractAddress: string
  readonly tokenBalance?: string | null
}): { contractAddress: string; rawBalance: bigint } | null {
  if (isNullish(entry.tokenBalance)) {
    return null
  }
  const rawBalance = tryParseBigInt(entry.tokenBalance)
  if (isNullish(rawBalance) || rawBalance === 0n) {
    return null
  }
  return { contractAddress: entry.contractAddress, rawBalance }
}

function tryParseBigInt(text: string): bigint | null {
  try {
    return BigInt(text)
  } catch {
    return null
  }
}

function scaleRawText(
  rawText: string | null | undefined,
  decimals: number | null | undefined
): number | null {
  if (isNullish(rawText) || isNullish(decimals)) {
    return null
  }
  const rawValue = tryParseBigInt(rawText)
  if (isNullish(rawValue)) {
    return null
  }
  return scaleRawAmount(rawValue, decimals)
}

// Decimal-adjust a raw integer amount without losing precision to a premature
// Number() conversion of the full raw value.
function scaleRawAmount(rawValue: bigint, decimals: number): number {
  if (decimals <= 0) {
    return Number(rawValue)
  }
  const divisor = 10n ** BigInt(decimals)
  const whole = rawValue / divisor
  const fraction = rawValue % divisor
  return Number(whole) + Number(fraction) / Number(divisor)
}
