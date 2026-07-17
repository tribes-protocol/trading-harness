import { requireApiKey, type ProviderId } from '../../core/config.js';
import {
  DataQualityError,
  EntitlementError,
  NotSupportedError,
  ProviderError,
  RateLimitError,
  ValidationError,
} from '../../core/errors.js';
import { HttpClient, type HttpResponse, type QueryValue } from '../../core/http.js';
import { collect, paginateOffset } from '../../core/pagination.js';
import { isoDateOnly, nowIso, toUtcIso, type Frequency } from '../../core/time.js';
import type { DataSource, LineageStep, QualityFlag } from '../../schemas/common.js';
import {
  CorporateActionsSchema,
  ExchangeInfoSchema,
  type CorporateActions,
  type ExchangeInfo,
} from '../../schemas/fundamentals.js';
import {
  PriceSeriesSchema,
  QuoteSchema,
  type Instrument,
  type OhlcvBar,
  type PriceSeries,
  type Quote,
} from '../../schemas/market.js';
import { BaseAdapter } from '../base.js';
import type {
  CorporateActionsSource,
  DailyBarsSource,
  ExchangeDirectorySource,
  IntradayBarsSource,
  ProviderMeta,
  QuoteSource,
} from '../types.js';
import type {
  MarketstackDividend,
  MarketstackEodBar,
  MarketstackErrorEnvelope,
  MarketstackExchange,
  MarketstackIntradayBar,
  MarketstackListResponse,
  MarketstackSplit,
} from './types.js';

/**
 * Marketstack v2 adapter (docs research record:
 * docs/research/providers/marketstack.json).
 *
 * Capabilities (all EOD/delayed — Marketstack is NEVER a real-time source
 * for this platform):
 *  - Quote: latest EOD record from /eod/latest (quality ["eod"]).
 *  - Daily bars: /eod, preferring CRSP split+dividend adjusted adj_* fields.
 *  - Intraday bars: /intraday — US/IEX universe only, "delayed"; bid/ask/
 *    last/mid are NULL since the IEX 2025-02-01 policy change and are never
 *    used.
 *  - Corporate actions: /splits + /dividends (US-listed venues).
 *  - Exchange directory: /exchanges.
 */

const PROVIDER: ProviderId = 'marketstack';
const BASE_URL = 'https://api.marketstack.com/v2';
const API_VERSION = 'v2';
/** Documented limit default 100, max 1000 for list endpoints. */
const MAX_PAGE_LIMIT = 1000;
/** Documented global cap is 5 req/s — run at 4 rps to stay clear of it. */
const RATE_LIMIT = { capacity: 4, refillPerSecond: 4 };

/** Platform frequency -> documented v2 interval enum values. */
const INTERVAL_MAP: Partial<Record<Frequency, string>> = {
  '1m': '1min',
  '5m': '5min',
  '15m': '15min',
  '30m': '30min',
  '1h': '1hour',
};

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Map the documented EOD asset_type field onto the platform asset classes. */
function assetClassFrom(assetType: string | null | undefined): Instrument['assetClass'] {
  const t = (assetType ?? '').toLowerCase();
  if (t.includes('etf')) return 'etf';
  if (t.includes('index')) return 'equity_index';
  return 'equity';
}

export class MarketstackAdapter
  extends BaseAdapter
  implements
    QuoteSource,
    DailyBarsSource,
    IntradayBarsSource,
    CorporateActionsSource,
    ExchangeDirectorySource
{
  readonly id: ProviderId = PROVIDER;
  readonly meta: ProviderMeta = {
    id: PROVIDER,
    name: 'Marketstack',
    docsUrl: 'https://docs.apilayer.com/marketstack/docs/api-documentation',
    docsReviewDate: '2026-07-17',
    apiVersion: 'v2 (v1 deprecated after 2025-06-30)',
    envVar: 'MARKETSTACK_API_KEY',
  };

  private readonly opts: { fetchImpl?: typeof fetch };
  private http: HttpClient | undefined;

  constructor(opts: { fetchImpl?: typeof fetch } = {}) {
    super();
    this.opts = opts;
  }

  /**
   * Build the HttpClient lazily on first use so importing/constructing the
   * adapter never reads credentials or throws when unconfigured.
   */
  private client(): HttpClient {
    if (this.http === undefined) {
      this.http = new HttpClient({
        provider: PROVIDER,
        baseUrl: BASE_URL,
        // Documented auth: HTTPS GET query parameter `access_key`.
        defaultQuery: { access_key: requireApiKey(PROVIDER) },
        rateLimit: RATE_LIMIT,
        ...(this.opts.fetchImpl ? { fetchImpl: this.opts.fetchImpl } : {}),
      });
    }
    return this.http;
  }

  /** One minimal-quota documented request: /exchanges is reference data. */
  protected async liveProbe(): Promise<void> {
    await this.getList<MarketstackExchange>('/exchanges', { limit: 1 });
  }

  /* ------------------------------ helpers ------------------------------ */

  /**
   * Marketstack's documented error envelope
   * {"error": {"code","message","context"}} normally travels with a non-2xx
   * status (handled by HttpClient), but is also mapped here in case it
   * arrives on a 200 body.
   */
  private throwIfErrorEnvelope(payload: unknown, endpoint: string): void {
    if (payload === null || typeof payload !== 'object' || !('error' in payload)) return;
    const envelope = (payload as Partial<MarketstackErrorEnvelope>).error;
    const code = envelope?.code ?? 'unknown_error';
    const message = `${code}: ${envelope?.message ?? 'documented error envelope returned'}`;
    switch (code) {
      case 'rate_limit_reached':
      case 'too_many_requests':
        throw new RateLimitError(PROVIDER, message, { endpoint });
      case 'unauthorized':
      case 'function_access_restricted':
        throw new EntitlementError(PROVIDER, message, { endpoint });
      case 'validation_error':
        throw new ValidationError(`[${PROVIDER}] ${message}`, {
          details: { provider: PROVIDER, endpoint, context: envelope?.context },
        });
      default:
        throw new ProviderError(PROVIDER, message, { endpoint });
    }
  }

  private async getList<T>(
    endpoint: string,
    query: Record<string, QueryValue>,
  ): Promise<HttpResponse<MarketstackListResponse<T>>> {
    const res = await this.client().getJson<MarketstackListResponse<T>>(endpoint, query);
    this.throwIfErrorEnvelope(res.data, endpoint);
    if (!Array.isArray((res.data as { data?: unknown } | null)?.data)) {
      throw new DataQualityError(
        `[${PROVIDER}] response from ${endpoint} is missing the documented "data" array`,
        { details: { provider: PROVIDER, endpoint } },
      );
    }
    return res;
  }

  /**
   * Drain a documented limit/offset-paginated list endpoint (limit default
   * 100, max 1000) up to maxItems, honoring pagination.total so no records
   * are silently truncated at one page.
   */
  private async collectPaged<T>(
    endpoint: string,
    query: Record<string, QueryValue>,
    maxItems: number,
  ): Promise<{
    items: T[];
    first: HttpResponse<MarketstackListResponse<T>>;
    last: HttpResponse<MarketstackListResponse<T>>;
  }> {
    const pageSize = Math.max(1, Math.min(MAX_PAGE_LIMIT, maxItems));
    let first: HttpResponse<MarketstackListResponse<T>> | undefined;
    let last: HttpResponse<MarketstackListResponse<T>> | undefined;
    const items = await collect(
      paginateOffset<T>(
        async (offset, limit) => {
          const res = await this.getList<T>(endpoint, { ...query, limit, offset });
          first ??= res;
          last = res;
          return { items: res.data.data, total: res.data.pagination?.total };
        },
        pageSize,
        { maxItems },
      ),
    );
    if (first === undefined || last === undefined) {
      throw new ProviderError(PROVIDER, 'pagination produced no responses', { endpoint });
    }
    return { items, first, last };
  }

  private sourceFrom(
    res: HttpResponse<unknown>,
    endpoint: string,
    freshness: DataSource['freshness'],
  ): DataSource {
    return {
      provider: PROVIDER,
      endpoint,
      apiVersion: API_VERSION,
      requestedAt: res.requestedAt,
      receivedAt: res.receivedAt,
      cacheHit: false,
      freshness,
    };
  }

  private instrumentFrom(requestedSymbol: string, record: MarketstackEodBar): Instrument {
    return {
      symbol: requestedSymbol,
      ...(record.name ? { name: record.name } : {}),
      assetClass: assetClassFrom(record.asset_type),
      // `exchange` in the EOD payload is the venue MIC (e.g. "XNAS").
      ...(record.exchange ? { exchange: record.exchange } : {}),
      ...(record.price_currency ? { currency: record.price_currency.toUpperCase() } : {}),
      // Raw provider-native identifier — never join on the bare symbol.
      providerIds: { marketstack: record.symbol },
    };
  }

  /* ---------------------------- capabilities --------------------------- */

  /**
   * Quote = latest END-OF-DAY record. Marketstack has no real-time
   * entitlement on this platform: quality ["eod"], freshness "eod".
   */
  async getQuote(params: { symbol: string }): Promise<Quote> {
    const endpoint = '/eod/latest';
    const res = await this.getList<MarketstackEodBar>(endpoint, {
      symbols: params.symbol,
      limit: 1,
    });
    const record = res.data.data[0];
    if (record === undefined) {
      throw new DataQualityError(
        `[${PROVIDER}] no EOD record returned for "${params.symbol}" — cannot derive a quote`,
        { details: { provider: PROVIDER, endpoint, symbol: params.symbol } },
      );
    }
    if (!record.price_currency) {
      throw new DataQualityError(
        `[${PROVIDER}] EOD record for "${params.symbol}" is missing price_currency`,
        { details: { provider: PROVIDER, endpoint, symbol: params.symbol } },
      );
    }
    const at = nowIso();
    const lineage: LineageStep[] = [
      {
        step: 'quote_from_eod',
        description:
          'Derived quote from the latest end-of-day record: price = raw (unadjusted) close; price_currency (documented as lower-case ISO code) uppercased to the platform currency code. EOD data, never real-time.',
        at,
        params: { priceField: 'close', adjusted: false, currencyNormalization: 'uppercase' },
      },
      {
        step: 'timestamp_to_utc',
        description: "Converted the provider 'date' field to UTC ISO-8601 asOf.",
        at,
      },
    ];
    return QuoteSchema.parse({
      source: this.sourceFrom(res, endpoint, 'eod'),
      quality: ['eod'] satisfies QualityFlag[],
      lineage,
      instrument: this.instrumentFrom(params.symbol, record),
      price: record.close,
      // Preserved as reported (e.g. LSE may quote GBX pence — no conversion).
      currency: record.price_currency.toUpperCase(),
      asOf: toUtcIso(record.date),
    });
  }

  /**
   * Daily bars from /eod. Uses CRSP split+dividend adjusted adj_* fields
   * (adjustment "split_dividend_adjusted") when present on every bar;
   * otherwise falls back to raw OHLC (adjustment "raw").
   */
  async getDailyBars(params: {
    symbol: string;
    from?: string;
    to?: string;
    limit?: number;
  }): Promise<PriceSeries> {
    const endpoint = '/eod';
    const maxItems = params.limit ?? 10_000;
    const {
      items: rawBars,
      first: firstRes,
      last: lastRes,
    } = await this.collectPaged<MarketstackEodBar>(
      endpoint,
      {
        symbols: params.symbol,
        sort: 'ASC',
        date_from: params.from,
        date_to: params.to,
      },
      maxItems,
    );

    const useAdjusted =
      rawBars.length > 0 &&
      rawBars.every(
        (bar) =>
          isFiniteNumber(bar.adj_open) &&
          isFiniteNumber(bar.adj_high) &&
          isFiniteNumber(bar.adj_low) &&
          isFiniteNumber(bar.adj_close),
      );
    const bars: OhlcvBar[] = rawBars.map((bar) => {
      const o = useAdjusted && isFiniteNumber(bar.adj_open) ? bar.adj_open : bar.open;
      const h = useAdjusted && isFiniteNumber(bar.adj_high) ? bar.adj_high : bar.high;
      const l = useAdjusted && isFiniteNumber(bar.adj_low) ? bar.adj_low : bar.low;
      const c = useAdjusted && isFiniteNumber(bar.adj_close) ? bar.adj_close : bar.close;
      const v = useAdjusted && isFiniteNumber(bar.adj_volume) ? bar.adj_volume : bar.volume;
      return { t: toUtcIso(bar.date), o, h, l, c, ...(isFiniteNumber(v) ? { v } : {}) };
    });

    const at = nowIso();
    const lineage: LineageStep[] = [
      {
        step: 'field_mapping',
        description: useAdjusted
          ? 'Mapped adj_open/adj_high/adj_low/adj_close (CRSP split+dividend adjusted) to OHLC and adj_volume (falling back to volume) to V; raw close was NOT used. price_currency (documented lower-case ISO code) uppercased to the platform currency code.'
          : 'Mapped raw open/high/low/close/volume to OHLCV; adjusted adj_* fields were missing or null on at least one bar, so adjustment is "raw" and adj_close was NOT used. price_currency (documented lower-case ISO code) uppercased to the platform currency code.',
        at,
        params: {
          adjustedFieldsUsed: useAdjusted,
          priceFields: useAdjusted
            ? ['adj_open', 'adj_high', 'adj_low', 'adj_close', 'adj_volume|volume']
            : ['open', 'high', 'low', 'close', 'volume'],
          currencyNormalization: 'uppercase',
        },
      },
      {
        step: 'timestamp_to_utc',
        description: "Converted each provider 'date' value to a UTC ISO-8601 bar timestamp.",
        at,
      },
    ];

    const first = rawBars[0];
    const currency = first?.price_currency ? first.price_currency.toUpperCase() : undefined;
    return PriceSeriesSchema.parse({
      source: { ...this.sourceFrom(firstRes, endpoint, 'eod'), receivedAt: lastRes.receivedAt },
      quality: (useAdjusted ? ['eod', 'adjusted'] : ['eod']) satisfies QualityFlag[],
      lineage,
      instrument: first
        ? this.instrumentFrom(params.symbol, first)
        : {
            symbol: params.symbol,
            assetClass: 'equity',
            providerIds: { marketstack: params.symbol },
          },
      frequency: '1d',
      timezone: 'UTC',
      ...(currency ? { currency } : {}),
      adjustment: useAdjusted ? 'split_dividend_adjusted' : 'raw',
      bars,
    });
  }

  /**
   * Intraday bars from /intraday — US/IEX universe only, freshness
   * "delayed" (polled REST, not consolidated tape). bid/ask/last/mid are
   * NULL without a direct IEX agreement and are never used; bars with NULL
   * OHLC are dropped and flagged "incomplete".
   */
  async getIntradayBars(params: {
    symbol: string;
    interval: Frequency;
    from?: string;
    to?: string;
    limit?: number;
  }): Promise<PriceSeries> {
    const interval = INTERVAL_MAP[params.interval];
    if (interval === undefined) {
      throw new NotSupportedError(
        `[${PROVIDER}] intraday interval "${params.interval}" is not supported — use one of 1m, 5m, 15m, 30m, 1h`,
        { details: { provider: PROVIDER, interval: params.interval } },
      );
    }
    const endpoint = '/intraday';
    // Documented symbol convention for the intraday endpoint: periods become
    // hyphens (BRK.B -> BRK-B).
    const providerSymbol = params.symbol.replace(/\./g, '-');
    // Documented offset pagination; cap at the documented 10,000-bar rolling
    // window per interval so wide ranges are not silently truncated at 1000.
    const {
      items: raw,
      first: firstRes,
      last: lastRes,
    } = await this.collectPaged<MarketstackIntradayBar>(
      endpoint,
      {
        symbols: providerSymbol,
        interval,
        sort: 'ASC',
        date_from: params.from,
        date_to: params.to,
      },
      params.limit ?? 10_000,
    );
    const complete = raw.filter(
      (bar): bar is MarketstackIntradayBar & {
        open: number;
        high: number;
        low: number;
        close: number;
      } =>
        isFiniteNumber(bar.open) &&
        isFiniteNumber(bar.high) &&
        isFiniteNumber(bar.low) &&
        isFiniteNumber(bar.close),
    );
    const dropped = raw.length - complete.length;

    const at = nowIso();
    const lineage: LineageStep[] = [];
    if (providerSymbol !== params.symbol) {
      lineage.push({
        step: 'symbol_hyphenation',
        description:
          'Converted periods to hyphens for the intraday endpoint per documented convention (e.g. BRK.B -> BRK-B).',
        at,
        params: { requested: params.symbol, sent: providerSymbol },
      });
    }
    lineage.push(
      {
        step: 'field_mapping',
        description:
          'Mapped raw open/high/low/close/volume to OHLCV bars. bid/ask/last/mid/size fields are NULL without a direct IEX market data agreement (IEX 2025-02-01 policy) and were not used; marketstack_last (derived reference price) was not used for bars.',
        at,
        params: { priceFields: ['open', 'high', 'low', 'close', 'volume'] },
      },
      {
        step: 'timestamp_to_utc',
        description: "Converted each provider 'date' value to a UTC ISO-8601 bar timestamp.",
        at,
      },
    );
    if (dropped > 0) {
      lineage.push({
        step: 'null_bar_filter',
        description: `Dropped ${dropped} bar(s) with NULL open/high/low/close (tolerated per IEX NULL-field caveat).`,
        at,
        params: { dropped },
      });
    }

    const firstBar = complete[0] ?? raw[0];
    return PriceSeriesSchema.parse({
      source: { ...this.sourceFrom(firstRes, endpoint, 'delayed'), receivedAt: lastRes.receivedAt },
      quality: (dropped > 0 ? ['delayed', 'incomplete'] : ['delayed']) satisfies QualityFlag[],
      lineage,
      instrument: {
        symbol: params.symbol,
        assetClass: 'equity',
        ...(firstBar?.exchange ? { exchange: firstBar.exchange } : {}),
        providerIds: { marketstack: firstBar?.symbol ?? providerSymbol },
      },
      frequency: params.interval,
      timezone: 'UTC',
      adjustment: 'raw',
      bars: complete.map((bar) => ({
        t: toUtcIso(bar.date),
        o: bar.open,
        h: bar.high,
        l: bar.low,
        c: bar.close,
        ...(isFiniteNumber(bar.volume) ? { v: bar.volume } : {}),
      })),
    });
  }

  /** Corporate actions from /splits and /dividends (US-listed venues). */
  async getCorporateActions(params: {
    symbol: string;
    from?: string;
    to?: string;
  }): Promise<CorporateActions> {
    const splitsEndpoint = '/splits';
    const dividendsEndpoint = '/dividends';
    const query: Record<string, QueryValue> = {
      symbols: params.symbol,
      sort: 'ASC',
      date_from: params.from,
      date_to: params.to,
    };
    // Documented offset pagination on both endpoints — drain past the
    // 1000-item page max so long dividend histories are never truncated.
    const splits = await this.collectPaged<MarketstackSplit>(splitsEndpoint, query, 10_000);
    const dividends = await this.collectPaged<MarketstackDividend>(
      dividendsEndpoint,
      query,
      10_000,
    );

    const at = nowIso();
    const rawSymbol = splits.items[0]?.symbol ?? dividends.items[0]?.symbol ?? params.symbol;
    return CorporateActionsSchema.parse({
      source: {
        ...this.sourceFrom(splits.first, splitsEndpoint, 'eod'),
        receivedAt: splits.last.receivedAt,
      },
      additionalSources: [
        {
          ...this.sourceFrom(dividends.first, dividendsEndpoint, 'eod'),
          receivedAt: dividends.last.receivedAt,
        },
      ],
      quality: ['eod'] satisfies QualityFlag[],
      lineage: [
        {
          step: 'field_mapping',
          description:
            'Mapped /splits split_factor -> splitFactor and /dividends dividend -> amount (cash per share, raw provider value). Dividend currency is not documented by the provider and is omitted.',
          at,
          params: { splits: 'split_factor', dividends: 'dividend' },
        },
        {
          step: 'date_normalization',
          description: "Normalized provider 'date' values to YYYY-MM-DD (UTC).",
          at,
        },
      ],
      instrument: {
        symbol: params.symbol,
        assetClass: 'equity',
        providerIds: { marketstack: rawSymbol },
      },
      splits: splits.items.map((s) => ({
        date: isoDateOnly(s.date),
        splitFactor: s.split_factor,
      })),
      dividends: dividends.items.map((d) => ({
        date: isoDateOnly(d.date),
        amount: d.dividend,
      })),
    });
  }

  /**
   * Exchange directory from /exchanges. The documented v2 payload carries
   * name/mic/country (plus LEI et al.); timezone and currency are NOT
   * documented fields, so they are omitted rather than guessed.
   */
  async listExchanges(params: { limit?: number } = {}): Promise<ExchangeInfo[]> {
    const endpoint = '/exchanges';
    const res = await this.getList<MarketstackExchange>(endpoint, {
      limit: Math.max(1, Math.min(MAX_PAGE_LIMIT, params.limit ?? 100)),
    });
    return res.data.data.map((exchange) =>
      ExchangeInfoSchema.parse({
        name: exchange.name,
        ...(exchange.mic ? { mic: exchange.mic } : {}),
        ...(exchange.country ? { country: exchange.country } : {}),
      }),
    );
  }
}
