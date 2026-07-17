import { requireApiKey } from '../../core/config.js';
import { NotSupportedError, ValidationError } from '../../core/errors.js';
import { HttpClient, type HttpResponse, type QueryValue } from '../../core/http.js';
import type { RateLimitConfig } from '../../core/ratelimit.js';
import { nowIso, toUtcIso } from '../../core/time.js';
import type { Chain, DataSource, LineageStep, QualityFlag } from '../../schemas/common.js';
import {
  DexPairSchema,
  TokenPriceSchema,
  TransferBatchSchema,
  WalletBalancesSchema,
  type DexPair,
  type TokenPrice,
  type TransferBatch,
  type WalletBalances,
} from '../../schemas/onchain.js';
import { BaseAdapter } from '../base.js';
import type {
  DexPairsSource,
  ProviderMeta,
  TokenPriceSource,
  TokenQuery,
  TransfersSource,
  WalletBalancesSource,
} from '../types.js';
import type {
  MoralisErc20PriceResponse,
  MoralisSolanaPortfolioResponse,
  MoralisSolanaTokenPriceResponse,
  MoralisTokenPairsResponse,
  MoralisWalletHistoryResponse,
  MoralisWalletTokensResponse,
} from './types.js';

/**
 * Moralis adapter (docs reviewed 2026-07-17, see
 * docs/research/providers/moralis.json).
 *
 * - EVM Web3 Data API v2.2 at https://deep-index.moralis.io/api/v2.2
 * - Solana Data API at https://solana-gateway.moralis.io (price + portfolio
 *   only — the only Solana endpoints documented in the research record)
 * - Auth: X-API-Key header on every request.
 * - Prices/pairs are DEX-derived onchain data (near real-time, p50 < 4s
 *   block freshness per official docs) — never consolidated exchange tape.
 */

const EVM_BASE_URL = 'https://deep-index.moralis.io/api/v2.2';
const SOLANA_BASE_URL = 'https://solana-gateway.moralis.io';

/**
 * Conservative client-side throttle. Documented limits: Free/Starter
 * 40 rps, evaluated over a rolling 4-second window. We cap well below at
 * a burst of 10 and 10 sustained rps, shared across both Moralis hosts.
 */
const RATE_LIMIT: RateLimitConfig = { capacity: 10, refillPerSecond: 10 };

/**
 * Moralis chain identifiers exactly as documented on the supported-chains
 * page (hex chain ids). Chains outside this map are not supported by this
 * adapter.
 */
const EVM_CHAIN_PARAM: Partial<Record<Chain, string>> = {
  ethereum: '0x1',
  polygon: '0x89',
  bsc: '0x38',
  arbitrum: '0xa4b1',
  base: '0x2105',
  optimism: '0xa',
  avalanche: '0xa86a',
};

/** Bounded drain for wallet balances (no cursor in the capability API). */
const MAX_BALANCE_PAGES = 10;

function toNum(value: string | number | null | undefined): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function toInt(value: string | number | null | undefined): number | undefined {
  const n = toNum(value);
  return n === undefined ? undefined : Math.trunc(n);
}

function optStr(value: string | null | undefined): string | undefined {
  return value === null || value === undefined || value === '' ? undefined : value;
}

function step(
  name: string,
  description: string,
  params?: Record<string, unknown>,
): LineageStep {
  return {
    step: name,
    description,
    at: nowIso(),
    ...(params !== undefined ? { params } : {}),
  };
}

function dedupe(flags: QualityFlag[]): QualityFlag[] {
  return [...new Set(flags)];
}

export class MoralisAdapter
  extends BaseAdapter
  implements WalletBalancesSource, TransfersSource, TokenPriceSource, DexPairsSource
{
  readonly id = 'moralis' as const;

  readonly meta: ProviderMeta = {
    id: 'moralis',
    name: 'Moralis',
    docsUrl: 'https://docs.moralis.com',
    docsReviewDate: '2026-07-17',
    apiVersion: 'EVM v2.2; Solana unversioned (solana-gateway)',
    envVar: 'MORALIS_API_KEY',
  };

  private evmClient: HttpClient | undefined;
  private solanaClient: HttpClient | undefined;

  constructor(private readonly opts: { fetchImpl?: typeof fetch } = {}) {
    super();
  }

  /** Lazy: never constructs a client or reads the key at import/construct time. */
  private evmHttp(): HttpClient {
    if (!this.evmClient) {
      this.evmClient = new HttpClient({
        provider: this.id,
        baseUrl: EVM_BASE_URL,
        defaultHeaders: { 'X-API-Key': requireApiKey(this.id) },
        rateLimit: RATE_LIMIT,
        ...(this.opts.fetchImpl ? { fetchImpl: this.opts.fetchImpl } : {}),
      });
    }
    return this.evmClient;
  }

  private solanaHttp(): HttpClient {
    if (!this.solanaClient) {
      this.solanaClient = new HttpClient({
        provider: this.id,
        baseUrl: SOLANA_BASE_URL,
        defaultHeaders: { 'X-API-Key': requireApiKey(this.id) },
        rateLimit: RATE_LIMIT,
        ...(this.opts.fetchImpl ? { fetchImpl: this.opts.fetchImpl } : {}),
      });
    }
    return this.solanaClient;
  }

  protected async liveProbe(): Promise<void> {
    // Documented endpoint (docs/research/providers/moralis.json:
    // GET /erc20/{address}/price); WETH on eth as a stable, minimal probe.
    // The previously used /web3-api-version was NOT in the research record
    // and 400s live (observed 2026-07-17).
    await this.evmHttp().getJson('/erc20/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/price', {
      chain: 'eth',
    });
  }

  private evmChain(chain: Chain, operation: string): string {
    const param = EVM_CHAIN_PARAM[chain];
    if (param === undefined) {
      throw new NotSupportedError(
        `[moralis] ${operation} is not supported on chain "${chain}" ` +
          '(documented EVM chains + solana only; see docs/research/providers/moralis.json)',
        { details: { provider: this.id, chain, operation } },
      );
    }
    return param;
  }

  private sourceFor(
    endpoint: string,
    res: HttpResponse<unknown>,
    apiVersion: string,
  ): DataSource {
    return {
      provider: this.id,
      endpoint,
      apiVersion,
      requestedAt: res.requestedAt,
      receivedAt: res.receivedAt,
      cacheHit: false,
      // Registry: near real-time onchain data (blocks p50 < 4s), classified
      // "realtime" for all four moralis capabilities.
      freshness: 'realtime',
    };
  }

  /* ----------------------------- token price ----------------------------- */

  async getTokenPrice(params: { token: TokenQuery }): Promise<TokenPrice> {
    const { token } = params;
    const chain: Chain = token.chain ?? 'ethereum';
    const address = token.address ?? token.providerId;
    if (!address) {
      throw new ValidationError(
        '[moralis] getTokenPrice requires a contract/mint address — bare symbols are ambiguous and never used as identifiers',
        { details: { provider: this.id, token } },
      );
    }
    if (chain === 'solana') return this.getSolanaTokenPrice(address);

    const chainParam = this.evmChain(chain, 'getTokenPrice');
    const res = await this.evmHttp().getJson<MoralisErc20PriceResponse>(
      `/erc20/${address}/price`,
      { chain: chainParam },
    );
    const raw = res.data;
    const tokenAddress = optStr(raw.tokenAddress) ?? address;
    const quality: QualityFlag[] = ['realtime'];
    if (raw.verifiedContract === false || raw.possibleSpam === true) quality.push('unverified');

    return TokenPriceSchema.parse({
      source: this.sourceFor('/erc20/{address}/price', res, 'v2.2'),
      quality: dedupe(quality),
      lineage: [
        step(
          'map_fields',
          'mapped Moralis ERC20 price response to TokenPrice (usdPrice -> price, pairTotalLiquidityUsd -> liquidityUsd)',
          { chain: chainParam, exchange: optStr(raw.exchangeName), pairAddress: optStr(raw.pairAddress) },
        ),
        step(
          'numeric_coercion',
          'coerced provider numerics that may be serialized as strings (tokenDecimals, pairTotalLiquidityUsd) to numbers',
        ),
        step(
          'as_of_from_receipt',
          'response carries no observation timestamp; asOf set to HTTP receivedAt (DEX-derived near real-time price)',
        ),
      ],
      token: {
        chain,
        address: tokenAddress,
        symbol: optStr(raw.tokenSymbol),
        name: optStr(raw.tokenName),
        decimals: toInt(raw.tokenDecimals),
        providerIds: { moralis: tokenAddress },
      },
      price: toNum(raw.usdPrice),
      currency: 'USD',
      asOf: res.receivedAt,
      liquidityUsd: toNum(raw.pairTotalLiquidityUsd),
    });
  }

  private async getSolanaTokenPrice(mint: string): Promise<TokenPrice> {
    const res = await this.solanaHttp().getJson<MoralisSolanaTokenPriceResponse>(
      `/token/mainnet/${mint}/price`,
    );
    const raw = res.data;
    const tokenAddress = optStr(raw.tokenAddress) ?? mint;
    const quality: QualityFlag[] = ['realtime'];
    if (raw.isVerifiedContract === false) quality.push('unverified');

    return TokenPriceSchema.parse({
      source: this.sourceFor('/token/mainnet/{address}/price', res, 'solana-gateway'),
      quality: dedupe(quality),
      lineage: [
        step(
          'map_fields',
          'mapped Moralis Solana token price response to TokenPrice (usdPrice -> price)',
          { network: 'mainnet', exchange: optStr(raw.exchangeName), pairAddress: optStr(raw.pairAddress) },
        ),
        step(
          'as_of_from_receipt',
          'response carries no observation timestamp; asOf set to HTTP receivedAt (DEX-derived near real-time price)',
        ),
      ],
      token: {
        chain: 'solana',
        address: tokenAddress,
        symbol: optStr(raw.symbol),
        name: optStr(raw.name),
        providerIds: { moralis: tokenAddress },
      },
      price: toNum(raw.usdPrice),
      currency: 'USD',
      asOf: res.receivedAt,
    });
  }

  /* ---------------------------- wallet balances --------------------------- */

  async getWalletBalances(params: { chain: Chain; address: string }): Promise<WalletBalances> {
    const { chain, address } = params;
    if (chain === 'solana') return this.getSolanaWalletBalances(address);
    const chainParam = this.evmChain(chain, 'getWalletBalances');

    // The capability API exposes no cursor, so drain a bounded number of
    // pages; flag the payload incomplete if the wallet has more.
    const pages: HttpResponse<MoralisWalletTokensResponse>[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_BALANCE_PAGES; page += 1) {
      const res = await this.evmHttp().getJson<MoralisWalletTokensResponse>(
        `/wallets/${address}/tokens`,
        { chain: chainParam, ...(cursor !== undefined ? { cursor } : {}) },
      );
      pages.push(res);
      cursor = optStr(res.data.cursor);
      if (cursor === undefined || (res.data.result ?? []).length === 0) {
        cursor = undefined;
        break;
      }
    }
    const truncated = cursor !== undefined;
    const first = pages[0];
    if (first === undefined) {
      throw new ValidationError('[moralis] getWalletBalances fetched no pages', {
        details: { provider: this.id, chain, address },
      });
    }
    const last = pages[pages.length - 1] ?? first;

    const balances = pages.flatMap((page) =>
      (page.data.result ?? []).map((item) => {
        const contract = optStr(item.token_address);
        return {
          token: {
            chain,
            // Schema convention: address absent for the chain-native asset.
            address: item.native_token === true ? undefined : contract,
            symbol: optStr(item.symbol),
            name: optStr(item.name),
            decimals: toInt(item.decimals),
            providerIds: contract !== undefined ? { moralis: contract } : {},
          },
          rawAmount: item.balance,
          amount: toNum(item.balance_formatted),
          valueUsd: toNum(item.usd_value),
        };
      }),
    );

    const quality: QualityFlag[] = ['realtime'];
    if (truncated) quality.push('incomplete');

    return WalletBalancesSchema.parse({
      source: {
        ...this.sourceFor('/wallets/{address}/tokens', first, 'v2.2'),
        receivedAt: last.receivedAt,
      },
      quality: dedupe(quality),
      lineage: [
        step(
          'cursor_drain',
          `drained ${pages.length} cursor page(s) of token balances (bounded at ${MAX_BALANCE_PAGES}); ` +
            (truncated ? 'more pages remained — payload flagged incomplete' : 'no further pages'),
          { pages: pages.length, blockNumber: first.data.block_number ?? null },
        ),
        step(
          'map_fields',
          'mapped result items to TokenBalance: balance -> rawAmount (raw integer string), provider-computed balance_formatted -> amount, usd_value -> valueUsd; spam filtering NOT applied (exclude_spam not sent)',
          { chain: chainParam },
        ),
        step(
          'as_of_from_receipt',
          'asOf set to HTTP receivedAt of the last page (near real-time indexed balances)',
        ),
      ],
      chain,
      address,
      asOf: last.receivedAt,
      balances,
    });
  }

  private async getSolanaWalletBalances(address: string): Promise<WalletBalances> {
    const res = await this.solanaHttp().getJson<MoralisSolanaPortfolioResponse>(
      `/account/mainnet/${address}/portfolio`,
    );
    const raw = res.data;

    const balances: unknown[] = [];
    const lamports = optStr(raw.nativeBalance?.lamports);
    if (lamports !== undefined) {
      balances.push({
        token: {
          chain: 'solana' as const,
          symbol: 'SOL',
          name: 'Solana',
          decimals: 9,
          providerIds: {},
        },
        rawAmount: lamports,
        amount: toNum(raw.nativeBalance?.solana),
      });
    }
    for (const t of raw.tokens ?? []) {
      const mint = optStr(t.mint);
      balances.push({
        token: {
          chain: 'solana' as const,
          address: mint,
          symbol: optStr(t.symbol),
          name: optStr(t.name),
          decimals: toInt(t.decimals),
          providerIds: mint !== undefined ? { moralis: mint } : {},
        },
        rawAmount: t.amountRaw,
        amount: toNum(t.amount),
      });
    }

    return WalletBalancesSchema.parse({
      source: this.sourceFor('/account/mainnet/{address}/portfolio', res, 'solana-gateway'),
      quality: ['realtime'],
      lineage: [
        step(
          'map_fields',
          'mapped Solana portfolio to TokenBalance[]: nativeBalance.lamports -> rawAmount (1 SOL = 1e9 lamports, chain constant), tokens[].amountRaw -> rawAmount, provider-computed amount kept as display amount; no USD values documented on this endpoint',
          { network: 'mainnet' },
        ),
        step(
          'as_of_from_receipt',
          'asOf set to HTTP receivedAt (near real-time account state)',
        ),
      ],
      chain: 'solana',
      address,
      asOf: res.receivedAt,
      balances,
    });
  }

  /* ------------------------------- transfers ------------------------------ */

  async getTransfers(params: {
    chain: Chain;
    address: string;
    limit?: number;
    cursor?: string;
  }): Promise<TransferBatch> {
    const { chain, address, limit, cursor } = params;
    if (chain === 'solana') {
      throw new NotSupportedError(
        '[moralis] getTransfers is not supported on solana (no Solana history endpoint in the research record)',
        { details: { provider: this.id, chain } },
      );
    }
    const chainParam = this.evmChain(chain, 'getTransfers');
    const query: Record<string, QueryValue> = { chain: chainParam };
    if (limit !== undefined) query.limit = limit;
    if (cursor !== undefined) query.cursor = cursor;

    const res = await this.evmHttp().getJson<MoralisWalletHistoryResponse>(
      `/wallets/${address}/history`,
      query,
    );

    const transfers: unknown[] = [];
    for (const tx of res.data.result ?? []) {
      const base = {
        chain,
        txHash: tx.hash ?? '',
        blockNumber: toInt(tx.block_number),
        timestamp: tx.block_timestamp ? toUtcIso(tx.block_timestamp) : undefined,
        category: optStr(tx.category),
      };
      const erc20s = tx.erc20_transfers ?? [];
      const natives = tx.native_transfers ?? [];
      for (const t of erc20s) {
        const contract = optStr(t.address);
        transfers.push({
          ...base,
          from: t.from_address ?? '',
          to: t.to_address ?? '',
          token: {
            chain,
            address: contract,
            symbol: optStr(t.token_symbol),
            name: optStr(t.token_name),
            decimals: toInt(t.token_decimals),
            providerIds: contract !== undefined ? { moralis: contract } : {},
          },
          rawAmount: optStr(t.value),
          amount: toNum(t.value_formatted),
        });
      }
      for (const t of natives) {
        transfers.push({
          ...base,
          from: t.from_address ?? '',
          to: t.to_address ?? '',
          token: {
            chain,
            symbol: optStr(t.token_symbol),
            providerIds: {},
          },
          rawAmount: optStr(t.value),
          amount: toNum(t.value_formatted),
        });
      }
      if (erc20s.length === 0 && natives.length === 0) {
        // Keep the transaction itself visible (native value in wei).
        transfers.push({
          ...base,
          from: tx.from_address ?? '',
          to: tx.to_address ?? '',
          rawAmount: optStr(tx.value),
        });
      }
    }

    return TransferBatchSchema.parse({
      source: this.sourceFor('/wallets/{address}/history', res, 'v2.2'),
      quality: ['realtime'],
      lineage: [
        step(
          'flatten_history',
          'flattened decoded wallet-history transactions into one Transfer per erc20_transfer/native_transfer; transactions without sub-transfers emitted once with tx-level from/to/value (wei); missing counterparty addresses mapped to empty string',
          { chain: chainParam, transactions: (res.data.result ?? []).length },
        ),
        step(
          'timestamp_to_utc_iso',
          'converted block_timestamp to UTC ISO-8601 via toUtcIso',
        ),
        step(
          'map_fields',
          'raw integer amounts preserved as rawAmount strings; provider-computed value_formatted -> amount (decimal-adjusted by Moralis, not recomputed)',
        ),
      ],
      chain,
      address,
      transfers,
      nextCursor: optStr(res.data.cursor),
    });
  }

  /* ------------------------------- DEX pairs ------------------------------ */

  async getDexPairs(params: {
    chain: Chain;
    tokenAddress: string;
    limit?: number;
  }): Promise<DexPair[]> {
    const { chain, tokenAddress, limit } = params;
    if (chain === 'solana') {
      throw new NotSupportedError(
        '[moralis] getDexPairs is not supported on solana (no Solana token-pairs endpoint in the research record)',
        { details: { provider: this.id, chain } },
      );
    }
    const chainParam = this.evmChain(chain, 'getDexPairs');
    const query: Record<string, QueryValue> = { chain: chainParam };
    if (limit !== undefined) query.limit = limit;

    const res = await this.evmHttp().getJson<MoralisTokenPairsResponse>(
      `/erc20/${tokenAddress}/pairs`,
      query,
    );

    return (res.data.pairs ?? []).map((item) => {
      const nested = item.pair ?? [];
      const byAddress = (addr: string | null | undefined) =>
        addr
          ? nested.find((t) => t.token_address?.toLowerCase() === addr.toLowerCase())
          : undefined;
      const baseRaw = byAddress(item.base_token) ?? nested[0];
      const quoteRaw = byAddress(item.quote_token) ?? nested[1];

      const toRef = (
        tok: typeof baseRaw,
        fallbackAddress: string | null | undefined,
      ) => {
        const addr = optStr(tok?.token_address) ?? optStr(fallbackAddress);
        return {
          chain,
          address: addr,
          symbol: optStr(tok?.token_symbol),
          name: optStr(tok?.token_name),
          decimals: toInt(tok?.token_decimals),
          providerIds: addr !== undefined ? { moralis: addr } : {},
        };
      };

      const quality: QualityFlag[] = ['realtime'];
      // Pairs without 24h volume are flagged inactive by Moralis — their
      // derived price is not a current observation.
      if (item.inactive_pair === true) quality.push('stale');

      return DexPairSchema.parse({
        source: this.sourceFor('/erc20/{token_address}/pairs', res, 'v2.2'),
        quality: dedupe(quality),
        lineage: [
          step(
            'map_fields',
            'mapped Moralis pair item to DexPair: pair_address, exchange_name -> dex, usd_price -> priceUsd, liquidity_usd -> liquidityUsd, volume_24h_usd -> volume24hUsd',
            { chain: chainParam, pairLabel: optStr(item.pair_label) },
          ),
          step(
            'resolve_pair_tokens',
            'resolved base/quote TokenRefs by matching base_token/quote_token address strings against nested pair[] token objects (case-insensitive), falling back to array order',
          ),
          step(
            'as_of_from_receipt',
            'response carries no observation timestamp; asOf set to HTTP receivedAt',
          ),
        ],
        chain,
        pairAddress: item.pair_address ?? '',
        dex: optStr(item.exchange_name),
        baseToken: toRef(baseRaw, item.base_token),
        quoteToken: quoteRaw !== undefined || optStr(item.quote_token) !== undefined
          ? toRef(quoteRaw, item.quote_token)
          : undefined,
        priceUsd: toNum(item.usd_price),
        liquidityUsd: toNum(item.liquidity_usd),
        volume24hUsd: toNum(item.volume_24h_usd),
        asOf: res.receivedAt,
      });
    });
  }
}
