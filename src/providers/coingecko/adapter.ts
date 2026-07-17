import { envVarName, requireApiKey } from '../../core/config.js';
import { NotSupportedError, ValidationError } from '../../core/errors.js';
import { HttpClient, type HttpResponse } from '../../core/http.js';
import { nowIso, toUtcIso, type Frequency } from '../../core/time.js';
import type { Chain, DataSource, LineageStep, QualityFlag } from '../../schemas/common.js';
import {
  PriceSeriesSchema,
  QuoteSchema,
  type PriceSeries,
  type Quote,
} from '../../schemas/market.js';
import {
  DexPairSchema,
  TokenPriceSchema,
  type DexPair,
  type TokenPrice,
} from '../../schemas/onchain.js';
import { BaseAdapter } from '../base.js';
import type {
  DexPairsSource,
  ProviderMeta,
  QuoteSource,
  TokenOhlcvSource,
  TokenPriceSource,
  TokenQuery,
} from '../types.js';
import type {
  CoinOhlcResponse,
  CoinsMarketsResponse,
  OnchainIncludedDex,
  OnchainIncludedToken,
  OnchainPool,
  OnchainRelationshipRef,
  OnchainTokenPoolsResponse,
  SimplePriceEntry,
  SimplePriceResponse,
  SimpleTokenPriceResponse,
} from './types.js';

/**
 * CoinGecko Pro API adapter (docs review 2026-07-17, API v3).
 *
 * All data from this provider is CACHED AGGREGATE data (20s–15min REST
 * cache cadence depending on endpoint), never exchange-direct real-time —
 * every payload is stamped freshness "delayed" and quality ["delayed"].
 *
 * LICENSING:
 *  - Commercial plans must prominently display COINGECKO_ATTRIBUTION with
 *    a hyperlink to COINGECKO_ATTRIBUTION_URL (pricing page + TOS s4.4).
 *  - TOS s6.1/6.2 permit only limited caching (refresh at least every
 *    24 h) and prohibit redistribution/derived storage — this adapter
 *    performs NO persistent caching (no DiskCache; `cacheHit` is always
 *    false); long-term persistence requires an Enterprise agreement.
 *
 * Research record: docs/research/providers/coingecko-pro.json
 */

/**
 * Required attribution on commercial plans: display this text with a
 * hyperlink to COINGECKO_ATTRIBUTION_URL ("Data provided by CoinGecko",
 * per https://www.coingecko.com/en/api/pricing and API TOS s4.4).
 */
export const COINGECKO_ATTRIBUTION = 'Data provided by CoinGecko';
export const COINGECKO_ATTRIBUTION_URL = 'https://www.coingecko.com/en/api';

const BASE_URL = 'https://pro-api.coingecko.com/api/v3';
const AUTH_HEADER = 'x-cg-pro-api-key';

/**
 * Conservative client-side throttle. The lowest documented paid plan
 * (Basic) allows 300 requests/min (5 rps); we cap sustained throughput at
 * 4 rps with a burst of 4 so retries stay under the plan floor. CoinGecko
 * counts failed (4xx/5xx) requests toward the per-minute limit and
 * documents no REST backoff/Retry-After semantics, so headroom matters.
 */
const RATE_LIMIT = { capacity: 4, refillPerSecond: 4 };

/**
 * Chain -> CoinGecko asset platform id (path segment of
 * /simple/token_price/{id}). ONLY chains confirmed in the research record
 * (platformMappings section, verified against the official /onchain/networks
 * and /asset_platforms responses) are mapped; anything else is refused with
 * NotSupportedError — never guessed.
 */
const ASSET_PLATFORM_BY_CHAIN: Partial<Record<Chain, string>> = {
  ethereum: 'ethereum',
  solana: 'solana',
  polygon: 'polygon-pos',
  arbitrum: 'arbitrum-one',
  optimism: 'optimistic-ethereum',
  base: 'base',
  bsc: 'binance-smart-chain',
  avalanche: 'avalanche',
};

/** Chain -> GeckoTerminal onchain network id (see platformMappings). */
const ONCHAIN_NETWORK_BY_CHAIN: Partial<Record<Chain, string>> = {
  ethereum: 'eth',
  solana: 'solana',
  polygon: 'polygon_pos',
  arbitrum: 'arbitrum',
  optimism: 'optimism',
  base: 'base',
  bsc: 'bsc',
  avalanche: 'avax',
};

/**
 * Documented `days` values accepted by /coins/{id}/ohlc PER EXPLICIT
 * interval (paid plans): "interval=daily is available for 1 / 7 / 14 / 30 /
 * 90 / 180 days" and "interval=hourly is available for 1 / 7 / 14 / 30 /
 * 90 days". days=365/max are documented only for auto-granularity (no
 * interval param), which returns 4-day candles — not a platform frequency —
 * so the adapter never requests them with an explicit interval.
 */
const OHLC_DAYS_BY_INTERVAL: Record<'daily' | 'hourly', readonly number[]> = {
  daily: [1, 7, 14, 30, 90, 180],
  hourly: [1, 7, 14, 30, 90],
};

const DELAYED: QualityFlag[] = ['delayed'];

/** Null -> undefined (CoinGecko uses null for absent market fields). */
function opt<T>(value: T | null | undefined): T | undefined {
  return value ?? undefined;
}

/** GeckoTerminal returns numeric values as JSON strings; parse defensively. */
function decimalString(value: string | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseIsoMs(label: string, value: string): number {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    throw new ValidationError(`[coingecko] cannot parse ${label} timestamp: ${value}`);
  }
  return ms;
}

export class CoinGeckoAdapter
  extends BaseAdapter
  implements QuoteSource, TokenPriceSource, TokenOhlcvSource, DexPairsSource
{
  readonly id = 'coingecko' as const;

  readonly meta: ProviderMeta = {
    id: 'coingecko',
    name: 'CoinGecko Pro API',
    docsUrl: 'https://docs.coingecko.com',
    docsReviewDate: '2026-07-17',
    apiVersion: 'v3 (docs v3.0.1)',
    envVar: envVarName('coingecko'),
  };

  private client: HttpClient | undefined;

  constructor(private readonly opts: { fetchImpl?: typeof fetch } = {}) {
    super();
  }

  /**
   * The HttpClient is built lazily on first use — constructing the adapter
   * (or importing this module) never reads the API key.
   */
  private http(): HttpClient {
    if (!this.client) {
      this.client = new HttpClient({
        provider: this.id,
        baseUrl: BASE_URL,
        defaultHeaders: { [AUTH_HEADER]: requireApiKey(this.id) },
        rateLimit: RATE_LIMIT,
        ...(this.opts.fetchImpl ? { fetchImpl: this.opts.fetchImpl } : {}),
      });
    }
    return this.client;
  }

  /** Exactly ONE minimal-quota documented request (1 credit on success). */
  protected async liveProbe(): Promise<void> {
    await this.http().getJson('/simple/price', { ids: 'bitcoin', vs_currencies: 'usd' });
  }

  private makeSource(res: HttpResponse<unknown>, endpoint: string): DataSource {
    return {
      provider: this.id,
      endpoint,
      apiVersion: 'v3',
      requestedAt: res.requestedAt,
      receivedAt: res.receivedAt,
      cacheHit: false,
      // Registry: all CoinGecko operations are cached aggregates -> delayed.
      freshness: 'delayed',
    };
  }

  private step(step: string, description: string, params?: Record<string, unknown>): LineageStep {
    return { step, description, at: nowIso(), ...(params ? { params } : {}) };
  }

  /* ------------------------------ QuoteSource ----------------------------- */

  /**
   * !!! IDENTIFIER SEMANTICS — READ THIS !!!
   * `symbol` is interpreted as a CoinGecko COIN ID (e.g. "bitcoin",
   * "usd-coin"), NOT a ticker symbol. CoinGecko is keyed on its own coin
   * ids; ticker symbols are ambiguous (many coins share "BTC"-style
   * tickers) and are never used as a join key. Resolve tickers to coin ids
   * upstream (e.g. via /coins/list) before calling this method.
   *
   * Endpoint: GET /coins/markets (cached ~30s on paid plans -> "delayed").
   */
  async getQuote(params: { symbol: string }): Promise<Quote> {
    const coinId = params.symbol;
    const endpoint = '/coins/markets';
    const res = await this.http().getJson<CoinsMarketsResponse>(endpoint, {
      vs_currency: 'usd',
      ids: coinId,
      precision: 'full',
    });
    const row = Array.isArray(res.data) ? res.data[0] : undefined;
    if (!row) {
      throw new ValidationError(
        `[coingecko] no market data for coin id "${coinId}" — getQuote expects a CoinGecko coin id (e.g. "bitcoin"), not a ticker symbol`,
        { details: { coinId, endpoint } },
      );
    }
    const lineage: LineageStep[] = [
      this.step(
        'map_fields',
        'mapped /coins/markets row to Quote: current_price->price, total_volume->volume24h, price_change_percentage_24h->change24hPct, market_cap->marketCap; provider coin id preserved in instrument.providerIds.coingecko',
        { coinId },
      ),
      this.step(
        'normalize_symbol',
        'uppercased provider ticker symbol for the platform-canonical instrument symbol (display only — never a join key)',
        { providerSymbol: row.symbol },
      ),
      this.step(
        'normalize_timestamp',
        row.last_updated
          ? 'converted last_updated to UTC ISO-8601 asOf'
          : 'last_updated missing; asOf set to response receivedAt',
      ),
    ];
    return QuoteSchema.parse({
      instrument: {
        symbol: row.symbol.toUpperCase(),
        name: row.name,
        assetClass: 'crypto',
        currency: 'USD',
        providerIds: { coingecko: row.id },
      },
      // A null price is invalid data — NaN is rejected by the zod schema.
      price: row.current_price ?? Number.NaN,
      currency: 'USD',
      asOf: row.last_updated ? toUtcIso(row.last_updated) : res.receivedAt,
      change24hPct: opt(row.price_change_percentage_24h),
      volume24h: opt(row.total_volume),
      marketCap: opt(row.market_cap),
      source: this.makeSource(res, endpoint),
      quality: DELAYED,
      lineage,
    });
  }

  /* --------------------------- TokenPriceSource --------------------------- */

  /**
   * providerId (CoinGecko coin id) -> GET /simple/price;
   * chain + contract address -> GET /simple/token_price/{asset_platform}.
   * Chains without a confirmed platform id mapping throw NotSupportedError.
   */
  async getTokenPrice(params: { token: TokenQuery }): Promise<TokenPrice> {
    const { token } = params;
    if (token.providerId) return this.tokenPriceByCoinId(token, token.providerId);
    if (token.chain && token.address) {
      return this.tokenPriceByContract(token, token.chain, token.address);
    }
    throw new ValidationError(
      '[coingecko] getTokenPrice requires token.providerId (a CoinGecko coin id) or token.chain + token.address — bare symbols are never used as identifiers',
    );
  }

  private async tokenPriceByCoinId(token: TokenQuery, coinId: string): Promise<TokenPrice> {
    const endpoint = '/simple/price';
    const res = await this.http().getJson<SimplePriceResponse>(endpoint, {
      ids: coinId,
      vs_currencies: 'usd',
      include_market_cap: true,
      include_24hr_vol: true,
      include_last_updated_at: true,
      precision: 'full',
    });
    const entry = res.data[coinId];
    if (!entry || entry.usd === undefined) {
      throw new ValidationError(
        `[coingecko] /simple/price returned no usd price for coin id "${coinId}"`,
        { details: { coinId, endpoint } },
      );
    }
    const lineage: LineageStep[] = [
      this.step(
        'map_fields',
        'mapped /simple/price entry to TokenPrice: usd->price, usd_market_cap->marketCapUsd, usd_24h_vol->volume24hUsd; coin id preserved in token.providerIds.coingecko',
        { coinId },
      ),
      this.step(
        'normalize_timestamp',
        entry.last_updated_at !== undefined
          ? 'converted last_updated_at (UNIX seconds) to UTC ISO-8601 asOf'
          : 'last_updated_at missing; asOf set to response receivedAt',
      ),
    ];
    if (!token.chain) {
      lineage.push(
        this.step(
          'default_chain',
          "no chain supplied with the coin-id query; TokenRef.chain set to 'other' — CoinGecko coin ids are chain-agnostic aggregates",
        ),
      );
    }
    return TokenPriceSchema.parse({
      token: {
        chain: token.chain ?? 'other',
        ...(token.address ? { address: token.address } : {}),
        ...(token.symbol ? { symbol: token.symbol } : {}),
        providerIds: { coingecko: coinId },
      },
      price: entry.usd,
      currency: 'USD',
      asOf: entry.last_updated_at !== undefined ? toUtcIso(entry.last_updated_at) : res.receivedAt,
      volume24hUsd: opt(entry.usd_24h_vol),
      marketCapUsd: opt(entry.usd_market_cap),
      source: this.makeSource(res, endpoint),
      quality: DELAYED,
      lineage,
    });
  }

  private async tokenPriceByContract(
    token: TokenQuery,
    chain: Chain,
    address: string,
  ): Promise<TokenPrice> {
    const platform = ASSET_PLATFORM_BY_CHAIN[chain];
    if (!platform) {
      throw new NotSupportedError(
        `[coingecko] chain "${chain}" has no confirmed CoinGecko asset platform id (see research record platformMappings) — refusing to guess`,
        { details: { chain, supported: Object.keys(ASSET_PLATFORM_BY_CHAIN) } },
      );
    }
    const endpoint = `/simple/token_price/${platform}`;
    const res = await this.http().getJson<SimpleTokenPriceResponse>(endpoint, {
      contract_addresses: address,
      vs_currencies: 'usd',
      include_market_cap: true,
      include_24hr_vol: true,
      include_last_updated_at: true,
      precision: 'full',
    });
    // Response is keyed by contract address (docs show lowercased keys);
    // match case-insensitively and ignore any non-data keys starting with "_".
    let entry: SimplePriceEntry | undefined = res.data[address];
    if (!entry) {
      const wanted = address.toLowerCase();
      for (const [key, value] of Object.entries(res.data)) {
        if (key.startsWith('_')) continue;
        if (key.toLowerCase() === wanted) {
          entry = value;
          break;
        }
      }
    }
    if (!entry || entry.usd === undefined) {
      throw new ValidationError(
        `[coingecko] /simple/token_price/${platform} returned no usd price for address "${address}"`,
        { details: { chain, platform, address, endpoint } },
      );
    }
    const lineage: LineageStep[] = [
      this.step(
        'map_platform',
        'mapped platform chain to CoinGecko asset platform id (verified mapping from research record platformMappings)',
        { chain, platform },
      ),
      this.step(
        'map_fields',
        'mapped /simple/token_price entry to TokenPrice: usd->price, usd_market_cap->marketCapUsd, usd_24h_vol->volume24hUsd; contract address preserved verbatim in token.address',
        { address },
      ),
      this.step(
        'normalize_timestamp',
        entry.last_updated_at !== undefined
          ? 'converted last_updated_at (UNIX seconds) to UTC ISO-8601 asOf'
          : 'last_updated_at missing; asOf set to response receivedAt',
      ),
    ];
    return TokenPriceSchema.parse({
      token: {
        chain,
        address,
        ...(token.symbol ? { symbol: token.symbol } : {}),
        providerIds: { coingecko_asset_platform: platform },
      },
      price: entry.usd,
      currency: 'USD',
      asOf: entry.last_updated_at !== undefined ? toUtcIso(entry.last_updated_at) : res.receivedAt,
      volume24hUsd: opt(entry.usd_24h_vol),
      marketCapUsd: opt(entry.usd_market_cap),
      source: this.makeSource(res, endpoint),
      quality: DELAYED,
      lineage,
    });
  }

  /* --------------------------- TokenOhlcvSource --------------------------- */

  /**
   * GET /coins/{id}/ohlc — requires token.providerId (a CoinGecko COIN ID;
   * see getQuote identifier semantics). Only daily/hourly intervals are
   * documented (interval=daily|hourly, paid plans). The endpoint has no
   * from/to parameters, only a `days` bucket — the adapter picks the
   * smallest documented bucket for the interval (daily: max 180, hourly:
   * max 90) covering the request and filters client-side. Requests beyond
   * the documented maximum are truncated to it and stamped 'incomplete'
   * (undocumented days/interval combinations are never sent). OHLC
   * responses carry no volume (v is omitted).
   */
  async getTokenOhlcv(params: {
    token: TokenQuery;
    interval: Frequency;
    from?: string;
    to?: string;
    limit?: number;
  }): Promise<PriceSeries> {
    const { token, interval, from, to, limit } = params;
    const coinId = token.providerId;
    if (!coinId) {
      throw new ValidationError(
        '[coingecko] getTokenOhlcv requires token.providerId (a CoinGecko coin id, e.g. "bitcoin"); contract-address OHLCV is not supported by this adapter',
      );
    }
    if (interval !== '1d' && interval !== '1h') {
      throw new NotSupportedError(
        `[coingecko] interval "${interval}" is not supported — /coins/{id}/ohlc documents interval=daily|hourly only`,
        { details: { interval, supported: ['1d', '1h'] } },
      );
    }
    const ohlcInterval = interval === '1d' ? 'daily' : 'hourly';
    const fromMs = from !== undefined ? parseIsoMs('from', from) : undefined;
    const toMs = to !== undefined ? parseIsoMs('to', to) : undefined;
    const { days, capped } = this.pickOhlcDays(ohlcInterval, fromMs, limit);
    const endpoint = `/coins/${encodeURIComponent(coinId)}/ohlc`;
    const res = await this.http().getJson<CoinOhlcResponse>(endpoint, {
      vs_currency: 'usd',
      days,
      interval: ohlcInterval,
      precision: 'full',
    });
    let bars = (Array.isArray(res.data) ? res.data : []).map(([t, o, h, l, c]) => ({
      t: toUtcIso(t),
      o,
      h,
      l,
      c,
    }));
    const fetched = bars.length;
    bars = bars.filter((bar) => {
      const t = Date.parse(bar.t);
      return (fromMs === undefined || t >= fromMs) && (toMs === undefined || t <= toMs);
    });
    if (limit !== undefined && bars.length > limit) bars = bars.slice(-limit);

    const lineage: LineageStep[] = [
      this.step(
        'select_days_bucket',
        "mapped the requested range to the smallest documented /coins/{id}/ohlc 'days' bucket for the interval (daily: 1|7|14|30|90|180; hourly: 1|7|14|30|90)",
        { interval, days, from, to, limit },
      ),
      ...(capped
        ? [
            this.step(
              'cap_days_bucket',
              `requested range exceeds the largest documented 'days' value for interval=${ohlcInterval} — fetched the documented maximum instead; the series may not cover the full requested range (quality flag 'incomplete')`,
              { days },
            ),
          ]
        : []),
      this.step(
        'convert_timestamps',
        'converted bar timestamps from epoch milliseconds to UTC ISO-8601',
      ),
      this.step(
        'client_filter',
        'applied from/to range filter and tail limit client-side (endpoint has no native range parameters); OHLC responses carry no volume',
        { fetched, kept: bars.length },
      ),
    ];
    return PriceSeriesSchema.parse({
      instrument: {
        symbol: (token.symbol ?? coinId).toUpperCase(),
        assetClass: 'crypto',
        currency: 'USD',
        providerIds: { coingecko: coinId },
      },
      frequency: interval,
      timezone: 'UTC',
      currency: 'USD',
      adjustment: 'raw',
      bars,
      source: this.makeSource(res, endpoint),
      quality: capped ? [...DELAYED, 'incomplete'] : DELAYED,
      lineage,
    });
  }

  private pickOhlcDays(
    ohlcInterval: 'daily' | 'hourly',
    fromMs: number | undefined,
    limit: number | undefined,
  ): { days: string; capped: boolean } {
    let targetDays: number;
    if (fromMs !== undefined) {
      targetDays = Math.max(1, Math.ceil((Date.now() - fromMs) / 86_400_000));
    } else if (limit !== undefined) {
      targetDays = Math.max(1, ohlcInterval === 'hourly' ? Math.ceil(limit / 24) : limit);
    } else {
      targetDays = ohlcInterval === 'hourly' ? 7 : 30;
    }
    const buckets = OHLC_DAYS_BY_INTERVAL[ohlcInterval];
    const bucket = buckets.find((d) => d >= targetDays);
    if (bucket !== undefined) return { days: String(bucket), capped: false };
    return { days: String(Math.max(...buckets)), capped: true };
  }

  /* ---------------------------- DexPairsSource ----------------------------- */

  /**
   * GET /onchain/networks/{network}/tokens/{token_address}/pools
   * (GeckoTerminal). Chains without a confirmed onchain network id mapping
   * throw NotSupportedError. Numeric attributes arrive as JSON strings and
   * are converted to numbers; the endpoint reports no per-pool observation
   * timestamp, so asOf is the response receivedAt.
   */
  async getDexPairs(params: {
    chain: Chain;
    tokenAddress: string;
    limit?: number;
  }): Promise<DexPair[]> {
    const { chain, tokenAddress, limit } = params;
    const network = ONCHAIN_NETWORK_BY_CHAIN[chain];
    if (!network) {
      throw new NotSupportedError(
        `[coingecko] chain "${chain}" has no confirmed GeckoTerminal network id (see research record platformMappings) — refusing to guess`,
        { details: { chain, supported: Object.keys(ONCHAIN_NETWORK_BY_CHAIN) } },
      );
    }
    const endpoint = `/onchain/networks/${network}/tokens/${encodeURIComponent(tokenAddress)}/pools`;
    const res = await this.http().getJson<OnchainTokenPoolsResponse>(endpoint, {
      include: 'base_token,quote_token,dex',
      page: 1,
    });

    const tokens = new Map<string, OnchainIncludedToken>();
    const dexes = new Map<string, OnchainIncludedDex>();
    for (const inc of res.data.included ?? []) {
      if (inc.type === 'token') tokens.set(inc.id, inc);
      else if (inc.type === 'dex') dexes.set(inc.id, inc);
    }

    const pools = res.data.data ?? [];
    const selected = limit !== undefined ? pools.slice(0, limit) : pools;
    const source = this.makeSource(res, endpoint);
    const lineage: LineageStep[] = [
      this.step(
        'map_network',
        'mapped platform chain to GeckoTerminal network id (verified mapping from research record platformMappings)',
        { chain, network },
      ),
      this.step(
        'parse_decimal_strings',
        'converted string-typed numeric attributes (base_token_price_usd, reserve_in_usd, volume_usd.h24) to IEEE-754 numbers — extreme values may lose precision',
      ),
      this.step(
        'map_fields',
        'mapped pool attributes/relationships to DexPair; token identities resolved from the included resources, raw GeckoTerminal ids preserved in providerIds.geckoterminal',
      ),
      this.step(
        'stamp_asof',
        'asOf set to response receivedAt — the endpoint reports no per-pool observation timestamp (pool data cached ~30s on paid plans)',
      ),
    ];

    return selected.map((pool) =>
      DexPairSchema.parse(this.mapPool(pool, chain, network, tokens, dexes, source, lineage)),
    );
  }

  private mapPool(
    pool: OnchainPool,
    chain: Chain,
    network: string,
    tokens: Map<string, OnchainIncludedToken>,
    dexes: Map<string, OnchainIncludedDex>,
    source: DataSource,
    lineage: LineageStep[],
  ): unknown {
    const dexRel = pool.relationships.dex?.data;
    const dexName = (dexRel ? dexes.get(dexRel.id)?.attributes.name : undefined) ?? dexRel?.id;
    const baseToken = this.tokenRefFromRelationship(pool.relationships.base_token, chain, network, tokens);
    const quoteToken = this.tokenRefFromRelationship(pool.relationships.quote_token, chain, network, tokens);
    return {
      chain,
      pairAddress: pool.attributes.address,
      ...(dexName ? { dex: dexName } : {}),
      baseToken,
      ...(quoteToken ? { quoteToken } : {}),
      priceUsd: decimalString(pool.attributes.base_token_price_usd),
      liquidityUsd: decimalString(pool.attributes.reserve_in_usd),
      volume24hUsd: decimalString(pool.attributes.volume_usd?.['h24']),
      asOf: source.receivedAt,
      source,
      quality: DELAYED,
      lineage,
    };
  }

  private tokenRefFromRelationship(
    rel: OnchainRelationshipRef | undefined,
    chain: Chain,
    network: string,
    tokens: Map<string, OnchainIncludedToken>,
  ): unknown {
    if (!rel?.data) return undefined;
    const included = tokens.get(rel.data.id);
    const providerIds: Record<string, string> = { geckoterminal: rel.data.id };
    const coinId = included?.attributes.coingecko_coin_id;
    if (coinId) providerIds['coingecko'] = coinId;
    // Documented token id format is "{network}_{address}" — used as an
    // address fallback only when the included resource is absent.
    const prefix = `${network}_`;
    const address =
      included?.attributes.address ??
      (rel.data.id.startsWith(prefix) ? rel.data.id.slice(prefix.length) : rel.data.id);
    return {
      chain,
      address,
      ...(included?.attributes.symbol ? { symbol: included.attributes.symbol } : {}),
      ...(included?.attributes.name ? { name: included.attributes.name } : {}),
      ...(included?.attributes.decimals !== null && included?.attributes.decimals !== undefined
        ? { decimals: included.attributes.decimals }
        : {}),
      providerIds,
    };
  }
}
