import { requireApiKey } from '../../core/config.js';
import {
  EntitlementError,
  HttpError,
  NotSupportedError,
  ProviderError,
  RateLimitError,
  TimeoutError,
  ValidationError,
} from '../../core/errors.js';
import { HttpClient, type HttpResponse, type RequestOptions } from '../../core/http.js';
import { nowIso, toUtcIso } from '../../core/time.js';
import type { Chain } from '../../schemas/common.js';
import {
  TokenPriceSchema,
  TransferBatchSchema,
  WalletBalancesSchema,
  type TokenPrice,
  type TransferBatch,
  type WalletBalances,
} from '../../schemas/onchain.js';
import { BaseAdapter } from '../base.js';
import type {
  ProviderMeta,
  TokenPriceSource,
  TokenQuery,
  TransfersSource,
  WalletBalancesSource,
} from '../types.js';
import type {
  AlchemyAssetTransfer,
  AlchemyAssetTransfersResult,
  AlchemyJsonRpcResponse,
  AlchemyPriceEntry,
  AlchemyPricesResponse,
  AlchemyTokensByAddressResponse,
} from './types.js';

/**
 * Alchemy adapter (docs reviewed 2026-07-17; see
 * docs/research/providers/alchemy.json).
 *
 * Capabilities: transfers (alchemy_getAssetTransfers, JSON-RPC v2),
 * wallet balances (Portfolio/Data API v1), token prices (Prices API v1).
 *
 * The API key is embedded in the URL PATH for the node and Data APIs.
 * config.loadEnv registers it as a secret so log/message redaction covers
 * it; additionally, every error leaving this adapter has its `endpoint`
 * replaced with a key-free logical name (HttpClient derives endpoint from
 * url.pathname, which would otherwise contain the key).
 */

/** JSON-RPC mainnet subdomains verified in official per-chain quickstarts. */
const RPC_NETWORKS: Partial<Record<Chain, string>> = {
  ethereum: 'eth-mainnet',
  polygon: 'polygon-mainnet',
  arbitrum: 'arb-mainnet',
  optimism: 'opt-mainnet',
  base: 'base-mainnet',
};

/** Data/Portfolio API network identifiers (note: Polygon is matic-mainnet). */
const DATA_NETWORKS: Partial<Record<Chain, string>> = {
  ethereum: 'eth-mainnet',
  polygon: 'matic-mainnet',
  arbitrum: 'arb-mainnet',
  optimism: 'opt-mainnet',
  base: 'base-mainnet',
  solana: 'solana-mainnet',
};

/**
 * Conservative client-side throttle derived from the documented Free-tier
 * budget: 500 CUPS account-wide with the heaviest documented call at
 * 75 CU (eth_getLogs) — 4 req/s * 75 CU = 300 CUPS worst case. The Prices
 * API additionally has a 300 req/hour Free-tier cap that is NOT enforced
 * here; see docs/providers/alchemy.md.
 */
const RATE_LIMIT = { capacity: 5, refillPerSecond: 4 };

/** Transfer categories requested; supported on all five documented networks
 * ('internal' is limited to Ethereum + Polygon mainnet, so it is omitted). */
const TRANSFER_CATEGORIES = ['external', 'erc20'];

/**
 * Compound cursor for getTransfers. Alchemy accepts one direction
 * (fromAddress OR toAddress) per call, so a full flow scan sequences the
 * outgoing leg, then the incoming leg. `k` is Alchemy's pageKey — it
 * expires after 10 minutes and must never be cached across sessions.
 */
interface TransferCursor {
  d: 'from' | 'to';
  k?: string;
}

function encodeCursor(cursor: TransferCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeCursor(raw: string | undefined): TransferCursor {
  if (raw === undefined) return { d: 'from' };
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as TransferCursor;
    if (
      (parsed.d === 'from' || parsed.d === 'to') &&
      (parsed.k === undefined || typeof parsed.k === 'string')
    ) {
      return parsed;
    }
  } catch {
    // fall through to the ValidationError below
  }
  throw new ValidationError(
    '[alchemy] invalid transfers cursor — cursors are opaque values from nextCursor (Alchemy pageKey TTL is 10 minutes; do not store them)',
  );
}

function rpcNetwork(chain: Chain): string {
  const network = RPC_NETWORKS[chain];
  if (network === undefined) {
    throw new NotSupportedError(
      `[alchemy] no documented JSON-RPC mainnet network for chain "${chain}" (documented: ${Object.keys(RPC_NETWORKS).join(', ')})`,
    );
  }
  return network;
}

function dataNetwork(chain: Chain): string {
  const network = DATA_NETWORKS[chain];
  if (network === undefined) {
    throw new NotSupportedError(
      `[alchemy] no documented Data API network for chain "${chain}" (documented: ${Object.keys(DATA_NETWORKS).join(', ')})`,
    );
  }
  return network;
}

const HEX_RE = /^0x[0-9a-fA-F]+$/;

function hexToInt(hex: string | null | undefined): number | undefined {
  if (typeof hex !== 'string' || !HEX_RE.test(hex)) return undefined;
  return Number.parseInt(hex, 16);
}

/** Raw base-unit amount as decimal string; docs show decimal, hex tolerated. */
function toRawAmount(value: string): { rawAmount: string; convertedFromHex: boolean } {
  if (/^\d+$/.test(value)) return { rawAmount: value, convertedFromHex: false };
  if (HEX_RE.test(value)) return { rawAmount: BigInt(value).toString(), convertedFromHex: true };
  throw new ValidationError(
    '[alchemy] unparseable token balance encoding — expected a decimal or 0x-hex string',
  );
}

function usdEntry(prices: AlchemyPriceEntry[] | null | undefined): AlchemyPriceEntry | undefined {
  if (!Array.isArray(prices)) return undefined;
  return prices.find((p) => typeof p.currency === 'string' && p.currency.toLowerCase() === 'usd');
}

export class AlchemyAdapter
  extends BaseAdapter
  implements TransfersSource, WalletBalancesSource, TokenPriceSource
{
  readonly id = 'alchemy' as const;

  readonly meta: ProviderMeta = {
    id: 'alchemy',
    name: 'Alchemy',
    docsUrl: 'https://www.alchemy.com/docs',
    docsReviewDate: '2026-07-17',
    apiVersion: 'per-product: node v2, NFT v3, Data/Portfolio v1, Prices v1',
    envVar: 'ALCHEMY_API_KEY',
  };

  private readonly opts: { fetchImpl?: typeof fetch };
  private readonly clients = new Map<string, HttpClient>();

  constructor(opts: { fetchImpl?: typeof fetch } = {}) {
    super();
    this.opts = opts;
  }

  /** Lazily build one HttpClient per host; never touches config at import time. */
  private client(host: string): HttpClient {
    const existing = this.clients.get(host);
    if (existing) return existing;
    const created = new HttpClient({
      provider: 'alchemy',
      baseUrl: `https://${host}`,
      rateLimit: RATE_LIMIT,
      ...(this.opts.fetchImpl ? { fetchImpl: this.opts.fetchImpl } : {}),
    });
    this.clients.set(host, created);
    return created;
  }

  /**
   * Run a request and rewrite any thrown ProviderError so its `endpoint`
   * is a key-free logical name (the URL path embeds the API key).
   * Messages/details are already redacted by the error layer.
   */
  private async safeRequest<T>(
    client: HttpClient,
    req: RequestOptions,
    safeEndpoint: string,
  ): Promise<HttpResponse<T>> {
    try {
      return await client.request<T>(req);
    } catch (error) {
      throw sanitizeEndpoint(error, safeEndpoint);
    }
  }

  /** JSON-RPC call; detects error envelopes carried on HTTP 200. */
  private async rpc<T>(
    chain: Chain,
    method: string,
    params: unknown[],
  ): Promise<{ result: T; res: HttpResponse<AlchemyJsonRpcResponse<T>> }> {
    const network = rpcNetwork(chain);
    const key = requireApiKey('alchemy');
    const res = await this.safeRequest<AlchemyJsonRpcResponse<T>>(
      this.client(`${network}.g.alchemy.com`),
      {
        method: 'POST',
        path: `/v2/${key}`,
        body: { jsonrpc: '2.0', id: 1, method, params },
      },
      method,
    );
    const envelope = res.data;
    if (envelope.error) {
      throw new ProviderError(
        'alchemy',
        `JSON-RPC error ${envelope.error.code}: ${envelope.error.message}`,
        { endpoint: method, details: { jsonRpcCode: envelope.error.code } },
      );
    }
    if (envelope.result === undefined) {
      throw new ProviderError('alchemy', 'HTTP 200 JSON-RPC response has neither result nor error', {
        endpoint: method,
      });
    }
    return { result: envelope.result, res };
  }

  /** One minimal-quota documented request: eth_blockNumber (10 CU). */
  protected async liveProbe(): Promise<void> {
    await this.rpc<string>('ethereum', 'eth_blockNumber', []);
  }

  /* ------------------------------ transfers ------------------------------ */

  async getTransfers(params: {
    chain: Chain;
    address: string;
    limit?: number;
    cursor?: string;
  }): Promise<TransferBatch> {
    const { chain, address } = params;
    const cursor = decodeCursor(params.cursor);
    const maxCount = Math.min(Math.max(Math.trunc(params.limit ?? 100), 1), 1000);
    const rpcParams: Record<string, unknown> = {
      category: TRANSFER_CATEGORIES,
      withMetadata: true,
      maxCount: `0x${maxCount.toString(16)}`,
      order: 'asc',
      ...(cursor.d === 'from' ? { fromAddress: address } : { toAddress: address }),
      ...(cursor.k !== undefined ? { pageKey: cursor.k } : {}),
    };
    const { result, res } = await this.rpc<AlchemyAssetTransfersResult>(
      chain,
      'alchemy_getAssetTransfers',
      [rpcParams],
    );

    const at = nowIso();
    const transfers = (result.transfers ?? []).map((t) => normalizeTransfer(chain, t));
    const pageKey =
      typeof result.pageKey === 'string' && result.pageKey.length > 0 ? result.pageKey : undefined;
    const nextCursor =
      pageKey !== undefined
        ? encodeCursor({ d: cursor.d, k: pageKey })
        : cursor.d === 'from'
          ? encodeCursor({ d: 'to' })
          : undefined;

    return TransferBatchSchema.parse({
      source: {
        provider: 'alchemy',
        endpoint: 'alchemy_getAssetTransfers',
        apiVersion: 'v2',
        requestedAt: res.requestedAt,
        receivedAt: res.receivedAt,
        freshness: 'delayed',
      },
      // Indexed pipeline distinct from chain head; lag not quantified in docs.
      quality: ['delayed'],
      lineage: [
        {
          step: 'query-leg',
          description:
            `queried ${cursor.d === 'from' ? 'outgoing (fromAddress)' : 'incoming (toAddress)'} leg; ` +
            'Alchemy accepts one direction per call, so the compound cursor sequences the fromAddress leg then the toAddress leg. ' +
            'pageKey TTL is 10 minutes — resume promptly, never store cursors.',
          at,
          params: { direction: cursor.d, categories: TRANSFER_CATEGORIES, maxCount },
        },
        {
          step: 'normalize-transfers',
          description:
            'hex blockNum -> integer; hex rawContract.value -> decimal-string rawAmount; hex rawContract.decimal -> token decimals; ' +
            'metadata.blockTimestamp -> UTC ISO-8601; asset symbol + contract address mapped to TokenRef',
          at,
        },
      ],
      chain,
      address,
      transfers,
      ...(nextCursor !== undefined ? { nextCursor } : {}),
    });
  }

  /* --------------------------- wallet balances --------------------------- */

  async getWalletBalances(params: { chain: Chain; address: string }): Promise<WalletBalances> {
    const { chain, address } = params;
    const network = dataNetwork(chain);
    const key = requireApiKey('alchemy');
    const endpoint = 'data/v1/assets/tokens/by-address';
    const res = await this.safeRequest<AlchemyTokensByAddressResponse>(
      this.client('api.g.alchemy.com'),
      {
        method: 'POST',
        path: `/data/v1/${key}/assets/tokens/by-address`,
        body: {
          addresses: [{ address, networks: [network] }],
          withMetadata: true,
          withPrices: true,
        },
      },
      endpoint,
    );

    const tokens = res.data?.data?.tokens;
    if (!Array.isArray(tokens)) {
      throw new ProviderError('alchemy', 'malformed Portfolio API response: missing data.tokens', {
        endpoint,
      });
    }

    const at = nowIso();
    let skipped = 0;
    let priced = 0;
    let hexConverted = 0;
    const balances: Record<string, unknown>[] = [];
    for (const item of tokens) {
      if (item.error) {
        skipped += 1;
        continue;
      }
      const { rawAmount, convertedFromHex } = toRawAmount(item.tokenBalance);
      if (convertedFromHex) hexConverted += 1;
      const decimals = item.tokenMetadata?.decimals;
      const hasDecimals = typeof decimals === 'number' && Number.isInteger(decimals) && decimals >= 0;
      const amount = hasDecimals ? Number(rawAmount) / 10 ** decimals : undefined;
      const usd = usdEntry(item.tokenPrices);
      const usdPrice = usd !== undefined ? Number(usd.value) : undefined;
      const valueUsd =
        amount !== undefined && usdPrice !== undefined && Number.isFinite(usdPrice)
          ? amount * usdPrice
          : undefined;
      if (valueUsd !== undefined) priced += 1;
      balances.push({
        token: {
          chain,
          ...(item.tokenAddress ? { address: item.tokenAddress } : {}),
          ...(item.tokenMetadata?.symbol ? { symbol: item.tokenMetadata.symbol } : {}),
          ...(item.tokenMetadata?.name ? { name: item.tokenMetadata.name } : {}),
          ...(hasDecimals ? { decimals } : {}),
          // Preserve the provider-native identifier (network-scoped address).
          providerIds: { alchemy: `${item.network}:${item.tokenAddress ?? 'native'}` },
        },
        rawAmount,
        ...(amount !== undefined ? { amount } : {}),
        ...(valueUsd !== undefined ? { valueUsd } : {}),
      });
    }

    const truncated = typeof res.data.data.pageKey === 'string' && res.data.data.pageKey.length > 0;
    const quality: string[] = [];
    // Embedded tokenPrices freshness is NOT documented — USD values are estimates.
    if (priced > 0) quality.push('estimated');
    if (skipped > 0 || truncated) quality.push('incomplete');

    const lineage: Record<string, unknown>[] = [
      {
        step: 'map-fields',
        description:
          'Portfolio tokens mapped to TokenBalance: tokenBalance -> rawAmount (raw base units, decimal string); ' +
          'tokenMetadata {name, symbol, decimals} -> TokenRef; native token has no address',
        at,
        params: { network },
      },
      {
        step: 'decimal-adjust',
        description:
          'display amount = rawAmount / 10^decimals (lossy Number division; rawAmount remains exact)',
        at,
      },
    ];
    if (hexConverted > 0) {
      lineage.push({
        step: 'convert-hex-balance',
        description: `converted ${hexConverted} hex tokenBalance value(s) to decimal strings via BigInt`,
        at,
      });
    }
    if (priced > 0) {
      lineage.push({
        step: 'usd-valuation',
        description:
          'valueUsd = amount * embedded tokenPrices USD value; embedded price refresh cadence is undocumented — flagged estimated',
        at,
      });
    }
    if (skipped > 0) {
      lineage.push({
        step: 'drop-errored-tokens',
        description: `skipped ${skipped} token entry/entries with a provider-reported per-token error — flagged incomplete`,
        at,
      });
    }
    if (truncated) {
      lineage.push({
        step: 'pagination-truncated',
        description:
          'provider returned data.pageKey (more balances exist beyond this page) — flagged incomplete',
        at,
      });
    }

    return WalletBalancesSchema.parse({
      source: {
        provider: 'alchemy',
        endpoint,
        apiVersion: 'v1',
        requestedAt: res.requestedAt,
        receivedAt: res.receivedAt,
        freshness: 'realtime',
      },
      quality,
      lineage,
      chain,
      address,
      // Balances reflect current state at response time.
      asOf: res.receivedAt,
      balances,
    });
  }

  /* ----------------------------- token price ----------------------------- */

  async getTokenPrice(params: { token: TokenQuery }): Promise<TokenPrice> {
    const q = params.token;
    const key = requireApiKey('alchemy');
    const client = this.client('api.g.alchemy.com');
    const byAddress = q.address !== undefined && q.chain !== undefined;

    let endpoint: string;
    let network: string | undefined;
    let res: HttpResponse<AlchemyPricesResponse>;
    if (byAddress) {
      network = dataNetwork(q.chain as Chain);
      endpoint = 'prices/v1/tokens/by-address';
      res = await this.safeRequest<AlchemyPricesResponse>(
        client,
        {
          method: 'POST',
          path: '/prices/v1/tokens/by-address',
          headers: { authorization: `Bearer ${key}` },
          body: { addresses: [{ network, address: q.address }] },
        },
        endpoint,
      );
    } else if (q.symbol !== undefined && q.symbol.length > 0) {
      endpoint = 'prices/v1/tokens/by-symbol';
      res = await this.safeRequest<AlchemyPricesResponse>(
        client,
        {
          method: 'GET',
          path: '/prices/v1/tokens/by-symbol',
          query: { symbols: q.symbol },
          headers: { authorization: `Bearer ${key}` },
        },
        endpoint,
      );
    } else {
      throw new ValidationError(
        '[alchemy] getTokenPrice requires chain+address (preferred, unambiguous) or a symbol',
      );
    }

    const entry = res.data?.data?.[0];
    if (entry === undefined) {
      throw new ProviderError('alchemy', 'Prices API returned no data for the requested token', {
        endpoint,
      });
    }
    if (entry.error !== undefined && entry.error !== null) {
      throw new ProviderError('alchemy', `Prices API token error: ${String(entry.error)}`, {
        endpoint,
      });
    }
    const usd = usdEntry(entry.prices) ?? (Array.isArray(entry.prices) ? entry.prices[0] : undefined);
    if (usd === undefined) {
      throw new ProviderError('alchemy', 'Prices API returned an empty prices[] for the token', {
        endpoint,
      });
    }
    const price = Number(usd.value);
    if (!Number.isFinite(price)) {
      throw new ProviderError('alchemy', 'Prices API price value is not a finite number', {
        endpoint,
      });
    }

    const at = nowIso();
    const symbol = entry.symbol ?? q.symbol;
    const lineage: Record<string, unknown>[] = [
      {
        step: 'lookup-mode',
        description: byAddress
          ? 'looked up by network+address (unambiguous identifier path; DEX-sourced prices only per docs)'
          : 'looked up by symbol (volume-weighted composite across 10+ CEXes and 100+ DEXes; crypto symbols are ambiguous — prefer chain+address)',
        at,
        params: byAddress ? { network: network as string, address: q.address as string } : { symbols: q.symbol as string },
      },
      {
        step: 'parse-value',
        description: 'price value string parsed to number; currency code uppercased for platform schema',
        at,
      },
      {
        step: 'propagate-asof',
        description:
          'provider lastUpdatedAt propagated to asOf (UTC ISO-8601); refresh cadence is undocumented — flagged unverified with freshness unknown',
        at,
        params: { lastUpdatedAt: usd.lastUpdatedAt },
      },
    ];

    return TokenPriceSchema.parse({
      source: {
        provider: 'alchemy',
        endpoint,
        apiVersion: 'v1',
        requestedAt: res.requestedAt,
        receivedAt: res.receivedAt,
        // Prices API update frequency is NOT documented — never claim better.
        freshness: 'unknown',
      },
      quality: ['unverified'],
      lineage,
      token: {
        chain: q.chain ?? 'other',
        ...(q.address !== undefined ? { address: q.address } : {}),
        ...(symbol ? { symbol } : {}),
        providerIds: {
          alchemy: byAddress ? `${network as string}:${q.address as string}` : `symbol:${q.symbol as string}`,
        },
      },
      price,
      currency: usd.currency.toUpperCase(),
      asOf: toUtcIso(usd.lastUpdatedAt),
    });
  }
}

/* ------------------------------- helpers -------------------------------- */

/** Map one raw Alchemy transfer to the platform Transfer shape (validated
 * downstream by TransferBatchSchema.parse). */
function normalizeTransfer(chain: Chain, t: AlchemyAssetTransfer): Record<string, unknown> {
  const blockNumber = hexToInt(t.blockNum);
  const decimals = hexToInt(t.rawContract?.decimal);
  const contractAddress = t.rawContract?.address ?? undefined;
  const rawValue = t.rawContract?.value;
  const rawAmount =
    typeof rawValue === 'string' && HEX_RE.test(rawValue) ? BigInt(rawValue).toString() : undefined;
  return {
    chain,
    txHash: t.hash,
    ...(blockNumber !== undefined ? { blockNumber } : {}),
    ...(t.metadata?.blockTimestamp ? { timestamp: toUtcIso(t.metadata.blockTimestamp) } : {}),
    from: t.from,
    // `to` is null for contract creation; the schema requires a string.
    to: t.to ?? '',
    token: {
      chain,
      // Absent for native-asset (external/internal) transfers.
      ...(contractAddress !== undefined ? { address: contractAddress } : {}),
      ...(t.asset ? { symbol: t.asset } : {}),
      ...(decimals !== undefined ? { decimals } : {}),
      providerIds: {
        alchemy: `${RPC_NETWORKS[chain] ?? chain}:${contractAddress ?? 'native'}`,
      },
    },
    ...(rawAmount !== undefined ? { rawAmount } : {}),
    ...(typeof t.value === 'number' ? { amount: t.value } : {}),
    ...(t.category ? { category: t.category } : {}),
  };
}

/**
 * Re-create an HttpClient-thrown error with a key-free `endpoint`,
 * preserving its class, status, retryability, and details. Messages and
 * details are already redacted by the platform error layer.
 */
function sanitizeEndpoint(error: unknown, safeEndpoint: string): unknown {
  if (!(error instanceof ProviderError)) return error;
  // Strip the "[provider] " prefix the constructor will re-add.
  const message = error.message.replace(/^\[[^\]]+\]\s*/, '');
  const base = {
    endpoint: safeEndpoint,
    ...(error.status !== undefined ? { status: error.status } : {}),
    details: error.details,
  };
  if (error instanceof RateLimitError) {
    return new RateLimitError(error.provider, message, {
      ...base,
      ...(error.retryAfterMs !== undefined ? { retryAfterMs: error.retryAfterMs } : {}),
    });
  }
  if (error instanceof TimeoutError) {
    return new TimeoutError(error.provider, message, { ...base, timeoutMs: error.timeoutMs });
  }
  if (error instanceof EntitlementError) {
    return new EntitlementError(error.provider, message, base);
  }
  if (error instanceof HttpError) {
    return new HttpError(error.provider, message, { ...base, retryable: error.retryable });
  }
  return new ProviderError(error.provider, message, { ...base, retryable: error.retryable });
}
