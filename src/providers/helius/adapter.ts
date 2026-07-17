import { requireApiKey } from '../../core/config.js';
import { NotSupportedError, ProviderError, ValidationError } from '../../core/errors.js';
import { HttpClient, type HttpResponse } from '../../core/http.js';
import { nowIso, toUtcIso } from '../../core/time.js';
import type { Chain, LineageStep, QualityFlag } from '../../schemas/common.js';
import {
  TransferBatchSchema,
  WalletBalancesSchema,
  type TokenBalance,
  type Transfer,
  type TransferBatch,
  type WalletBalances,
} from '../../schemas/onchain.js';
import { BaseAdapter } from '../base.js';
import type { ProviderMeta, TransfersSource, WalletBalancesSource } from '../types.js';
import type {
  HeliusDasAsset,
  HeliusGetAssetsByOwnerResult,
  HeliusGetHealthResult,
  HeliusGetTransfersByAddressResult,
  HeliusNativeBalance,
  HeliusRpcEnvelope,
  HeliusTransferItem,
} from './types.js';

/**
 * Helius adapter — Solana-only on-chain data.
 *
 *  - Wallet balances: DAS getAssetsByOwner (JSON-RPC 2.0). Embedded USD
 *    prices are hourly estimates covering only the top 10,000 tokens by
 *    market cap — the batch is flagged "estimated" whenever they are used.
 *  - Transfers: getTransfersByAddress (Helius-exclusive RPC extension),
 *    the documented reconciled-transfer endpoint that returns parsed
 *    token/native-SOL transfer objects (raw base-unit amount string +
 *    decimals-adjusted uiAmount). Requires Developer plan or higher.
 *    (Enhanced Transactions is legacy; getTransactionsForAddress returns
 *    signatures or raw transactions, not transfer objects.)
 *
 * All endpoint/param/response knowledge comes from
 * docs/research/providers/helius.json (official-docs research record).
 */

const BASE_URL = 'https://mainnet.helius-rpc.com';
const LAMPORTS_PER_SOL = 1_000_000_000;
/** Native SOL mint as rewritten by getTransfersByAddress solMode "merged". */
const NATIVE_SOL_MINT_MERGED = 'So11111111111111111111111111111111111111111';
/** Documented DAS max page size for getAssetsByOwner. */
const DAS_PAGE_LIMIT = 1000;
/** Safety cap: never crawl more than this many DAS pages per call. */
const MAX_BALANCE_PAGES = 10;
/** Documented getTransfersByAddress limit range is 1-100. */
const TRANSFERS_MAX_LIMIT = 100;

/**
 * Format a raw base-unit balance (arriving as a JSON number from DAS) as a
 * plain integer string without exponent notation. Values above 2^53 have
 * already lost precision upstream — noted in lineage.
 */
function rawIntegerString(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    throw new ValidationError(`expected a non-negative raw token amount, got ${String(value)}`);
  }
  return BigInt(Math.trunc(value)).toString();
}

export class HeliusAdapter extends BaseAdapter implements WalletBalancesSource, TransfersSource {
  readonly id = 'helius' as const;

  readonly meta: ProviderMeta = {
    id: 'helius',
    name: 'Helius',
    docsUrl: 'https://www.helius.dev/docs',
    docsReviewDate: '2026-07-17',
    apiVersion: 'JSON-RPC 2.0 (RPC/DAS); REST v0 (enhanced tx, webhooks); REST v1 (wallet)',
    envVar: 'HELIUS_API_KEY',
  };

  private readonly fetchImpl: typeof fetch | undefined;
  private http: HttpClient | undefined;

  constructor(opts: { fetchImpl?: typeof fetch } = {}) {
    super();
    this.fetchImpl = opts.fetchImpl;
  }

  /**
   * Lazily built HTTP client: the API key is read on first request, never
   * at import or construct time. Auth is the documented `api-key` query
   * parameter. Rate limit is the conservative Free-plan floor — DAS and
   * enhanced methods are limited to 2 req/s (research record rateLimits).
   */
  private client(): HttpClient {
    if (this.http === undefined) {
      this.http = new HttpClient({
        provider: this.id,
        baseUrl: BASE_URL,
        defaultQuery: { 'api-key': requireApiKey(this.id) },
        rateLimit: { capacity: 2, refillPerSecond: 2 },
        ...(this.fetchImpl !== undefined ? { fetchImpl: this.fetchImpl } : {}),
      });
    }
    return this.http;
  }

  /** POST a JSON-RPC 2.0 request and unwrap the envelope. */
  private async rpc<T>(
    method: string,
    params: unknown,
  ): Promise<{ result: T; res: HttpResponse<HeliusRpcEnvelope<T>> }> {
    const res = await this.client().postJson<HeliusRpcEnvelope<T>>('/', {
      jsonrpc: '2.0',
      id: `pi-${method}`,
      method,
      params,
    });
    const envelope = res.data;
    if (envelope === null || typeof envelope !== 'object') {
      throw new ProviderError(this.id, `unexpected non-JSON-RPC response for ${method}`, {
        endpoint: method,
      });
    }
    if (envelope.error !== undefined) {
      // Helius publishes no canonical error schema; map the JSON-RPC 2.0
      // error object defensively.
      const code = envelope.error.code;
      throw new ProviderError(
        this.id,
        `JSON-RPC error${code !== undefined ? ` ${code}` : ''} for ${method}: ${envelope.error.message ?? 'unknown error'}`,
        { endpoint: method, details: { jsonRpcErrorCode: code } },
      );
    }
    if (envelope.result === undefined) {
      throw new ProviderError(this.id, `JSON-RPC response missing result for ${method}`, {
        endpoint: method,
      });
    }
    return { result: envelope.result, res };
  }

  private assertSolana(chain: Chain, operation: string): void {
    if (chain !== 'solana') {
      throw new NotSupportedError(
        `[${this.id}] ${operation} supports only chain "solana" (Helius is a Solana-only provider); got "${chain}"`,
        { details: { provider: this.id, operation, chain } },
      );
    }
  }

  /** Minimal-quota live probe: standard RPC getHealth (documented, 1 credit). */
  protected async liveProbe(): Promise<void> {
    await this.rpc<HeliusGetHealthResult>('getHealth', []);
  }

  /* ------------------------- WalletBalancesSource ------------------------ */

  async getWalletBalances(params: { chain: Chain; address: string }): Promise<WalletBalances> {
    this.assertSolana(params.chain, 'getWalletBalances');

    const items: HeliusDasAsset[] = [];
    let nativeBalance: HeliusNativeBalance | undefined;
    let firstRequestedAt: string | undefined;
    let lastReceivedAt: string | undefined;
    let truncated = false;

    for (let page = 1; page <= MAX_BALANCE_PAGES; page += 1) {
      const { result, res } = await this.rpc<HeliusGetAssetsByOwnerResult>('getAssetsByOwner', {
        ownerAddress: params.address,
        page,
        limit: DAS_PAGE_LIMIT,
        options: {
          showFungible: true,
          showNativeBalance: true,
          showZeroBalance: false,
        },
      });
      firstRequestedAt ??= res.requestedAt;
      lastReceivedAt = res.receivedAt;
      if (!Array.isArray(result.items)) {
        throw new ProviderError(
          this.id,
          'unexpected getAssetsByOwner result shape: items is not an array',
          { endpoint: 'getAssetsByOwner' },
        );
      }
      if (page === 1 && result.nativeBalance !== undefined) nativeBalance = result.nativeBalance;
      items.push(...result.items);
      if (result.items.length < DAS_PAGE_LIMIT) break;
      if (page === MAX_BALANCE_PAGES) truncated = true;
    }

    const requestedAt = firstRequestedAt ?? nowIso();
    const receivedAt = lastReceivedAt ?? requestedAt;

    const balances: TokenBalance[] = [];
    if (nativeBalance?.lamports !== undefined) {
      balances.push({
        token: {
          chain: 'solana',
          symbol: 'SOL',
          name: 'Solana',
          decimals: 9,
          providerIds: { helius: 'nativeBalance' },
        },
        rawAmount: rawIntegerString(nativeBalance.lamports),
        amount: nativeBalance.lamports / LAMPORTS_PER_SOL,
        valueUsd: nativeBalance.total_price,
      });
    }
    for (const item of items) {
      const info = item.token_info;
      // Only fungible holdings carry token_info.balance; NFTs and other
      // asset interfaces are out of scope for token balances.
      if (info?.balance === undefined) continue;
      const decimals = info.decimals;
      balances.push({
        token: {
          chain: 'solana',
          address: item.id,
          symbol: info.symbol ?? item.content?.metadata?.symbol,
          name: item.content?.metadata?.name,
          decimals,
          providerIds: { helius: item.id },
        },
        rawAmount: rawIntegerString(info.balance),
        amount: decimals !== undefined ? info.balance / 10 ** decimals : undefined,
        valueUsd: info.price_info?.total_price,
      });
    }

    const hasUsdEstimates = balances.some((b) => b.valueUsd !== undefined);
    const quality: QualityFlag[] = [];
    if (hasUsdEstimates) quality.push('estimated');
    if (truncated) quality.push('incomplete');

    const at = nowIso();
    const lineage: LineageStep[] = [
      {
        step: 'map_das_assets',
        description:
          'Mapped DAS getAssetsByOwner items to TokenBalance: item.id (mint) -> token.address and providerIds.helius; token_info.balance -> rawAmount (raw base-unit integer string); token_info.symbol / content.metadata -> symbol/name. Assets without token_info.balance (NFTs etc.) are excluded.',
        at,
        params: { assetsReturned: items.length, balancesMapped: balances.length },
      },
      {
        step: 'decimal_adjustment',
        description:
          'amount = token_info.balance / 10^token_info.decimals per token; native SOL amount = nativeBalance.lamports / 1e9. Raw balances arrive as JSON numbers; values above 2^53 base units would already have lost precision upstream.',
        at,
        params: { lamportsPerSol: LAMPORTS_PER_SOL },
      },
    ];
    if (hasUsdEstimates) {
      lineage.push({
        step: 'usd_valuation_flagging',
        description:
          'valueUsd taken from DAS price_info.total_price / nativeBalance.total_price: hourly-updated estimates covering only the top 10,000 tokens by market cap, documented by Helius as estimates and not real-time market rates; batch flagged "estimated".',
        at,
      });
    }

    return WalletBalancesSchema.parse({
      chain: 'solana',
      address: params.address,
      asOf: receivedAt,
      balances,
      source: {
        provider: this.id,
        endpoint: 'getAssetsByOwner',
        apiVersion: 'DAS (JSON-RPC 2.0)',
        requestedAt,
        receivedAt,
        freshness: 'realtime',
      },
      quality,
      lineage,
    });
  }

  /* --------------------------- TransfersSource --------------------------- */

  async getTransfers(params: {
    chain: Chain;
    address: string;
    limit?: number;
    cursor?: string;
  }): Promise<TransferBatch> {
    this.assertSolana(params.chain, 'getTransfers');

    const limit = Math.min(Math.max(params.limit ?? TRANSFERS_MAX_LIMIT, 1), TRANSFERS_MAX_LIMIT);
    const config: Record<string, unknown> = {
      limit,
      commitment: 'finalized',
      sortOrder: 'desc',
      solMode: 'merged',
    };
    if (params.cursor !== undefined) config['paginationToken'] = params.cursor;

    const { result, res } = await this.rpc<HeliusGetTransfersByAddressResult>(
      'getTransfersByAddress',
      [params.address, config],
    );

    if (!Array.isArray(result.data)) {
      throw new ProviderError(
        this.id,
        'unexpected getTransfersByAddress result shape: data is not an array',
        { endpoint: 'getTransfersByAddress' },
      );
    }
    const transfers = result.data.map((item) => this.mapTransfer(item));

    const at = nowIso();
    const lineage: LineageStep[] = [
      {
        step: 'map_transfers',
        description:
          'Mapped getTransfersByAddress data[] to Transfer: signature -> txHash, slot -> blockNumber, fromUserAccount/toUserAccount -> from/to (token-account address used when the user account is absent, e.g. some token rows), mint -> token.address and providerIds.helius, type -> category. solMode "merged": native SOL and WSOL are one asset under mint So11111111111111111111111111111111111111111.',
        at,
        params: { count: transfers.length, solMode: 'merged', commitment: 'finalized' },
      },
      {
        step: 'timestamp_conversion',
        description: 'blockTime (Unix epoch seconds, UTC) converted to ISO-8601 UTC timestamps.',
        at,
      },
      {
        step: 'amount_normalization',
        description:
          'rawAmount preserved verbatim from the provider "amount" field (raw base-unit integer string, never re-derived); amount parsed as a number from the provider "uiAmount" field (decimals-adjusted decimal string).',
        at,
      },
    ];

    return TransferBatchSchema.parse({
      chain: 'solana',
      address: params.address,
      transfers,
      nextCursor: result.paginationToken ?? undefined,
      source: {
        provider: this.id,
        endpoint: 'getTransfersByAddress',
        apiVersion: 'JSON-RPC 2.0 (Helius RPC extension)',
        requestedAt: res.requestedAt,
        receivedAt: res.receivedAt,
        freshness: 'realtime',
      },
      quality: [],
      lineage,
    });
  }

  private mapTransfer(item: HeliusTransferItem): Transfer {
    let amount: number | undefined;
    if (item.uiAmount !== undefined) {
      const parsed = Number(item.uiAmount);
      if (Number.isFinite(parsed)) amount = parsed;
    }
    const isNativeSol = item.mint === NATIVE_SOL_MINT_MERGED;
    return {
      chain: 'solana',
      txHash: item.signature,
      blockNumber: item.slot,
      timestamp: item.blockTime !== undefined && item.blockTime !== null
        ? toUtcIso(item.blockTime)
        : undefined,
      from: item.fromUserAccount ?? item.fromTokenAccount ?? '',
      to: item.toUserAccount ?? item.toTokenAccount ?? '',
      token:
        item.mint !== undefined
          ? {
              chain: 'solana',
              address: item.mint,
              symbol: isNativeSol ? 'SOL' : undefined,
              name: isNativeSol ? 'Solana' : undefined,
              decimals: item.decimals,
              providerIds: { helius: item.mint },
            }
          : undefined,
      rawAmount: item.amount,
      amount,
      category: item.type,
    };
  }
}
