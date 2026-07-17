import { requireApiKey } from '../../core/config.js';
import { NotSupportedError, ProviderError, ValidationError } from '../../core/errors.js';
import { HttpClient, type HttpResponse, type QueryValue } from '../../core/http.js';
import { nowIso, toUtcIso, type Frequency } from '../../core/time.js';
import type { Chain, DataSource, LineageStep } from '../../schemas/common.js';
import { PriceSeriesSchema, type PriceSeries } from '../../schemas/market.js';
import {
  DexPairSchema,
  TokenPriceSchema,
  WalletBalancesSchema,
  type DexPair,
  type TokenPrice,
  type WalletBalances,
} from '../../schemas/onchain.js';
import { BaseAdapter } from '../base.js';
import type {
  DexPairsSource,
  ProviderMeta,
  TokenOhlcvSource,
  TokenPriceSource,
  TokenQuery,
  WalletBalancesSource,
} from '../types.js';
import type {
  BirdeyeEnvelope,
  BirdeyeMarketsData,
  BirdeyeMarketTokenSide,
  BirdeyeNetworksData,
  BirdeyeOhlcvData,
  BirdeyePriceData,
  BirdeyeWalletTokenListData,
} from './types.js';

/**
 * Birdeye Data Services adapter — on-chain DEX market data by contract
 * address (token prices, OHLCV, markets/pairs) plus Solana wallet
 * portfolio. Research record: docs/research/providers/birdeye.json.
 *
 * LICENSING: Birdeye's public ToS restricts storing/redistributing data —
 * this adapter performs NO disk caching, and outputs must stay internal
 * absent an enterprise agreement.
 *
 * Freshness: Birdeye claims "real-time" but documents no latency SLA;
 * source.freshness is stamped "realtime" per the registry entry and the
 * registry notes carry the caveat.
 */

const BASE_URL = 'https://public-api.birdeye.so';

/**
 * Platform Chain -> Birdeye x-chain header value, restricted to the
 * intersection of the platform Chain enum and the documented 17-value
 * x-chain enum. bitcoin/other have no Birdeye equivalent.
 */
const CHAIN_MAP: Partial<Record<Chain, string>> = {
  solana: 'solana',
  ethereum: 'ethereum',
  polygon: 'polygon',
  arbitrum: 'arbitrum',
  optimism: 'optimism',
  base: 'base',
  bsc: 'bsc',
  avalanche: 'avalanche',
};

/**
 * /defi/v3/ohlcv documents an x-chain subset (solana, bsc, base, ethereum,
 * monad, fogo, mantle, hyperevm, megaeth, robinhood). Intersection with the
 * platform Chain enum:
 */
const OHLCV_CHAINS: ReadonlySet<Chain> = new Set(['solana', 'ethereum', 'bsc', 'base']);

/**
 * Platform Frequency -> documented Birdeye OHLCV interval string
 * (only intervals present in the research record are mapped).
 */
const OHLCV_INTERVALS: Partial<Record<Frequency, { type: string; seconds: number }>> = {
  '1m': { type: '1m', seconds: 60 },
  '5m': { type: '5m', seconds: 300 },
  '15m': { type: '15m', seconds: 900 },
  '30m': { type: '30m', seconds: 1800 },
  '1h': { type: '1H', seconds: 3_600 },
  '4h': { type: '4H', seconds: 14_400 },
  '1d': { type: '1D', seconds: 86_400 },
  '1w': { type: '1W', seconds: 604_800 },
  '1mo': { type: '1M', seconds: 2_592_000 },
};

/** Default window when the caller gives neither `from` nor `limit`. */
const DEFAULT_BAR_COUNT = 500;

/** /defi/v2/markets documents limit 1-20 (default 10). */
const MARKETS_MAX_LIMIT = 20;

function epochSeconds(iso: string): number {
  return Math.floor(new Date(toUtcIso(iso)).getTime() / 1000);
}

function lineageStep(
  step: string,
  description: string,
  params?: Record<string, unknown>,
): LineageStep {
  return { step, description, at: nowIso(), ...(params !== undefined ? { params } : {}) };
}

/**
 * Raw integer balance. Official reference examples show a JSON number on
 * Solana and a digit string on EVM chains — a digit string is preserved
 * exactly (no float round-trip). Numeric values above 2^53 have already
 * lost precision at the provider's JSON layer; we still render a plain
 * decimal string (never scientific notation) for the rawAmount contract.
 */
function rawAmountString(balance: number | string): string {
  if (typeof balance === 'string') {
    if (!/^\d+$/.test(balance)) {
      throw new ValidationError(
        `Birdeye wallet balance string is not a non-negative integer: ${balance}`,
      );
    }
    return balance;
  }
  if (!Number.isFinite(balance) || balance < 0) {
    throw new ValidationError(`Birdeye wallet balance is not a non-negative number: ${balance}`);
  }
  if (Number.isSafeInteger(balance)) return balance.toString(10);
  return BigInt(Math.round(balance)).toString(10);
}

export class BirdeyeAdapter
  extends BaseAdapter
  implements TokenPriceSource, TokenOhlcvSource, DexPairsSource, WalletBalancesSource
{
  readonly id = 'birdeye' as const;

  readonly meta: ProviderMeta = {
    id: 'birdeye',
    name: 'Birdeye Data Services',
    docsUrl: 'https://docs.birdeye.so/',
    docsReviewDate: '2026-07-17',
    apiVersion: 'mixed per-endpoint (/defi/*, /defi/v2/*, /defi/v3/*, /v1/wallet/*)',
    envVar: 'BIRDEYE_API_KEY',
  };

  private readonly opts: { fetchImpl?: typeof fetch };
  private http: HttpClient | undefined;

  constructor(opts: { fetchImpl?: typeof fetch } = {}) {
    super();
    this.opts = opts;
  }

  /**
   * Lazily built so importing/constructing the adapter never reads the API
   * key. Rate limit is conservative: the documented free Standard tier is
   * 1 rps (paid tiers allow 15-150 rps; the wallet v1 group is additionally
   * capped at 30 rpm per the rate-limiting doc).
   */
  private client(): HttpClient {
    if (!this.http) {
      this.http = new HttpClient({
        provider: this.id,
        baseUrl: BASE_URL,
        defaultHeaders: { 'X-API-KEY': requireApiKey(this.id) },
        rateLimit: { capacity: 1, refillPerSecond: 1 },
        ...(this.opts.fetchImpl ? { fetchImpl: this.opts.fetchImpl } : {}),
      });
    }
    return this.http;
  }

  /** GET + Birdeye success/message envelope check. */
  private async get<T>(
    path: string,
    query: Record<string, QueryValue>,
    birdeyeChain?: string,
  ): Promise<{ res: HttpResponse<BirdeyeEnvelope<T>>; data: T }> {
    const res = await this.client().request<BirdeyeEnvelope<T>>({
      method: 'GET',
      path,
      query,
      ...(birdeyeChain !== undefined ? { headers: { 'x-chain': birdeyeChain } } : {}),
    });
    const body = res.data;
    if (
      typeof body !== 'object' ||
      body === null ||
      body.success !== true ||
      body.data === undefined ||
      body.data === null
    ) {
      const message = body && typeof body === 'object' ? body.message : undefined;
      throw new ProviderError(
        this.id,
        `provider reported failure at ${path}${message ? `: ${message}` : ''}`,
        { endpoint: path, status: res.status },
      );
    }
    return { res, data: body.data };
  }

  private sourceFrom(res: HttpResponse<unknown>, endpoint: string): DataSource {
    return {
      provider: this.id,
      endpoint,
      requestedAt: res.requestedAt,
      receivedAt: res.receivedAt,
      cacheHit: false,
      freshness: 'realtime',
    };
  }

  private mapChain(chain: Chain): string {
    const mapped = CHAIN_MAP[chain];
    if (mapped === undefined) {
      throw new NotSupportedError(
        `[${this.id}] chain "${chain}" has no Birdeye x-chain equivalent (supported: ${Object.keys(CHAIN_MAP).join(', ')})`,
      );
    }
    return mapped;
  }

  /**
   * Birdeye is keyed by contract/mint address per chain; bare symbols are
   * ambiguous and never used as a join key. The provider-native id IS the
   * contract address, so providerId is accepted as an alias.
   */
  private resolveToken(token: TokenQuery): {
    chain: Chain;
    birdeyeChain: string;
    address: string;
  } {
    const address = token.address ?? token.providerId;
    if (!address) {
      throw new ValidationError(
        `[${this.id}] token lookups require a contract/mint address (token.address or token.providerId); bare symbols are not accepted`,
      );
    }
    const chain: Chain = token.chain ?? 'solana'; // documented x-chain default
    return { chain, birdeyeChain: this.mapChain(chain), address };
  }

  /** One minimal-quota documented request: GET /defi/networks (utils-tier). */
  protected async liveProbe(): Promise<void> {
    await this.get<BirdeyeNetworksData>('/defi/networks', {});
  }

  /* ------------------------------ token price ----------------------------- */

  async getTokenPrice(params: { token: TokenQuery }): Promise<TokenPrice> {
    const endpoint = '/defi/price';
    const { chain, birdeyeChain, address } = this.resolveToken(params.token);
    const { res, data } = await this.get<BirdeyePriceData>(
      endpoint,
      { address, include_liquidity: true },
      birdeyeChain,
    );
    const asOf = toUtcIso(data.updateUnixTime);
    return TokenPriceSchema.parse({
      token: {
        chain,
        address,
        ...(params.token.symbol !== undefined ? { symbol: params.token.symbol } : {}),
        providerIds: { birdeye: address },
      },
      price: data.value,
      currency: 'USD',
      asOf,
      ...(typeof data.liquidity === 'number' ? { liquidityUsd: data.liquidity } : {}),
      source: this.sourceFrom(res, endpoint),
      quality: [],
      lineage: [
        lineageStep(
          'map_fields',
          'mapped Birdeye /defi/price fields: value -> price (USD), liquidity -> liquidityUsd',
          { chain: birdeyeChain, address },
        ),
        lineageStep(
          'convert_timestamp',
          'converted updateUnixTime (epoch seconds) to UTC ISO asOf',
          { updateUnixTime: data.updateUnixTime, asOf },
        ),
      ],
    });
  }

  /* -------------------------------- OHLCV --------------------------------- */

  async getTokenOhlcv(params: {
    token: TokenQuery;
    interval: Frequency;
    from?: string;
    to?: string;
    limit?: number;
  }): Promise<PriceSeries> {
    const endpoint = '/defi/v3/ohlcv';
    const { chain, birdeyeChain, address } = this.resolveToken(params.token);
    if (!OHLCV_CHAINS.has(chain)) {
      throw new NotSupportedError(
        `[${this.id}] /defi/v3/ohlcv documents chain support for ${[...OHLCV_CHAINS].join(', ')} only (got "${chain}")`,
      );
    }
    const mapped = OHLCV_INTERVALS[params.interval];
    if (!mapped) {
      throw new NotSupportedError(
        `[${this.id}] interval "${params.interval}" has no documented Birdeye OHLCV type (supported: ${Object.keys(OHLCV_INTERVALS).join(', ')})`,
      );
    }
    if (params.limit !== undefined && (!Number.isInteger(params.limit) || params.limit < 1)) {
      throw new ValidationError(
        `[${this.id}] OHLCV limit must be a positive integer (got ${params.limit})`,
      );
    }
    const timeTo = params.to !== undefined ? epochSeconds(params.to) : Math.floor(Date.now() / 1000);
    const barsBack = params.limit ?? DEFAULT_BAR_COUNT;
    const timeFrom =
      params.from !== undefined ? epochSeconds(params.from) : timeTo - barsBack * mapped.seconds;
    if (timeFrom >= timeTo) {
      throw new ValidationError(`[${this.id}] OHLCV window is empty: from >= to`);
    }

    const { res, data } = await this.get<BirdeyeOhlcvData>(
      endpoint,
      { address, type: mapped.type, time_from: timeFrom, time_to: timeTo, currency: 'usd' },
      birdeyeChain,
    );

    let items = data.items ?? [];
    const truncated = params.limit !== undefined && items.length > params.limit;
    if (truncated && params.limit !== undefined) items = items.slice(-params.limit);

    const lineage: LineageStep[] = [
      lineageStep(
        'map_interval',
        `mapped platform frequency "${params.interval}" to Birdeye OHLCV type "${mapped.type}"`,
        { interval: params.interval, type: mapped.type },
      ),
      lineageStep(
        'convert_timestamp',
        'converted candle unix_time (epoch seconds) to UTC ISO bar open time t',
      ),
      lineageStep(
        'map_fields',
        'mapped candle o/h/l/c to USD bar prices; bar volume uses Birdeye "v" (base-token units, not v_usd)',
        { currencyParam: 'usd' },
      ),
    ];
    if (params.from === undefined) {
      lineage.push(
        lineageStep(
          'derive_window',
          `time_from derived as time_to - ${barsBack} x ${mapped.seconds}s (no "from" given)`,
          { time_from: timeFrom, time_to: timeTo },
        ),
      );
    }
    if (truncated) {
      lineage.push(
        lineageStep('truncate', `kept the most recent ${params.limit} of ${data.items?.length ?? 0} candles`, {
          limit: params.limit,
        }),
      );
    }

    return PriceSeriesSchema.parse({
      instrument: {
        symbol: params.token.symbol ?? address,
        assetClass: 'crypto',
        currency: 'USD',
        providerIds: { birdeye: address },
      },
      frequency: params.interval,
      timezone: 'UTC',
      currency: 'USD',
      adjustment: 'raw',
      bars: items.map((item) => ({
        t: toUtcIso(item.unix_time),
        o: item.o,
        h: item.h,
        l: item.l,
        c: item.c,
        v: item.v,
      })),
      source: this.sourceFrom(res, endpoint),
      quality: [],
      lineage,
    });
  }

  /* ------------------------------- DEX pairs ------------------------------ */

  async getDexPairs(params: {
    chain: Chain;
    tokenAddress: string;
    limit?: number;
  }): Promise<DexPair[]> {
    const endpoint = '/defi/v2/markets';
    const birdeyeChain = this.mapChain(params.chain);
    const limit = Math.min(Math.max(params.limit ?? 10, 1), MARKETS_MAX_LIMIT);
    const { res, data } = await this.get<BirdeyeMarketsData>(
      endpoint,
      {
        address: params.tokenAddress,
        sort_by: 'liquidity',
        sort_type: 'desc',
        offset: 0,
        limit,
      },
      birdeyeChain,
    );
    const source = this.sourceFrom(res, endpoint);
    const tokenSide = (side: BirdeyeMarketTokenSide | undefined) =>
      side === undefined
        ? undefined
        : {
            chain: params.chain,
            ...(side.address !== undefined ? { address: side.address } : {}),
            ...(side.symbol !== undefined ? { symbol: side.symbol } : {}),
            ...(side.decimals !== undefined ? { decimals: side.decimals } : {}),
            providerIds: side.address !== undefined ? { birdeye: side.address } : {},
          };
    const lineage: LineageStep[] = [
      lineageStep(
        'map_fields',
        'mapped Birdeye /defi/v2/markets item: address -> pairAddress, source -> dex, base/quote token objects -> baseToken/quoteToken, liquidity -> liquidityUsd, volume24h -> volume24hUsd',
        { tokenAddress: params.tokenAddress, chain: birdeyeChain, sort_by: 'liquidity' },
      ),
      lineageStep(
        'stamp_as_of',
        'asOf set to response receivedAt: endpoint reports current market stats without an update timestamp',
      ),
    ];
    return (data.items ?? []).map((item) =>
      DexPairSchema.parse({
        chain: params.chain,
        pairAddress: item.address,
        ...(item.source !== undefined ? { dex: item.source } : {}),
        baseToken: tokenSide(item.base) ?? { chain: params.chain, providerIds: {} },
        ...(item.quote !== undefined ? { quoteToken: tokenSide(item.quote) } : {}),
        ...(typeof item.price === 'number' ? { priceUsd: item.price } : {}),
        ...(item.liquidity !== undefined ? { liquidityUsd: item.liquidity } : {}),
        ...(item.volume24h !== undefined ? { volume24hUsd: item.volume24h } : {}),
        asOf: source.receivedAt,
        source,
        quality: [],
        lineage,
      }),
    );
  }

  /* ---------------------------- wallet balances --------------------------- */

  async getWalletBalances(params: { chain: Chain; address: string }): Promise<WalletBalances> {
    const endpoint = '/v1/wallet/token_list';
    if (params.chain !== 'solana') {
      throw new NotSupportedError(
        `[${this.id}] /v1/wallet/token_list documents x-chain "solana" only (got "${params.chain}")`,
      );
    }
    const { res, data } = await this.get<BirdeyeWalletTokenListData>(
      endpoint,
      { wallet: params.address },
      'solana',
    );
    const source = this.sourceFrom(res, endpoint);
    const balances = (data.items ?? []).map((item) => ({
      token: {
        chain: 'solana' as const,
        address: item.address,
        ...(item.symbol !== undefined ? { symbol: item.symbol } : {}),
        ...(item.name !== undefined ? { name: item.name } : {}),
        ...(item.decimals !== undefined ? { decimals: item.decimals } : {}),
        providerIds: { birdeye: item.address },
      },
      rawAmount: rawAmountString(item.balance),
      ...(item.uiAmount !== undefined ? { amount: item.uiAmount } : {}),
      ...(item.valueUsd !== undefined ? { valueUsd: item.valueUsd } : {}),
    }));
    return WalletBalancesSchema.parse({
      chain: params.chain,
      address: params.address,
      asOf: source.receivedAt,
      balances,
      source,
      quality: [],
      lineage: [
        lineageStep(
          'map_fields',
          'mapped Birdeye /v1/wallet/token_list items: balance (raw integer) -> rawAmount decimal string, uiAmount -> amount (decimals-adjusted by provider), valueUsd -> valueUsd',
          { wallet: params.address },
        ),
        lineageStep(
          'stamp_as_of',
          'asOf set to response receivedAt: portfolio snapshot carries no timestamp',
        ),
      ],
    });
  }
}
