import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetEnvCacheForTests } from '../../core/config.js';
import {
  ConfigError,
  DataQualityError,
  EntitlementError,
  NotSupportedError,
  RateLimitError,
  ValidationError,
} from '../../core/errors.js';
import { resetBucketsForTests } from '../../core/ratelimit.js';
import { CorporateActionsSchema, ExchangeInfoSchema } from '../../schemas/fundamentals.js';
import { PriceSeriesSchema, QuoteSchema } from '../../schemas/market.js';
import { MarketstackAdapter } from './adapter.js';
import type { MarketstackEodBar, MarketstackListResponse } from './types.js';

const ENV_VAR = 'MARKETSTACK_API_KEY';
const TEST_KEY = 'test-key-marketstack-0123456789';
const FIXTURES = new URL('./fixtures/', import.meta.url);

function fixture<T = unknown>(name: string): T {
  return JSON.parse(readFileSync(new URL(name, FIXTURES), 'utf8')) as T;
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

type FetchMock = ReturnType<typeof vi.fn>;

function urlOfCall(fetchImpl: FetchMock, index = 0): URL {
  const input = (fetchImpl.mock.calls[index] ?? [])[0] as URL | string;
  return new URL(String(input));
}

function adapterWith(fetchImpl: FetchMock): MarketstackAdapter {
  return new MarketstackAdapter({ fetchImpl: fetchImpl as unknown as typeof fetch });
}

beforeEach(() => {
  process.env[ENV_VAR] = TEST_KEY;
  resetEnvCacheForTests();
  resetBucketsForTests();
});

afterEach(() => {
  delete process.env[ENV_VAR];
  resetEnvCacheForTests();
});

describe('MarketstackAdapter.getQuote', () => {
  it('returns a schema-valid EOD-derived quote with truthful flags', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(fixture('eod_latest.json')));
    const quote = await adapterWith(fetchImpl).getQuote({ symbol: 'AAPL' });

    // (a) schema-valid
    expect(() => QuoteSchema.parse(quote)).not.toThrow();
    // Price is the RAW (unadjusted) close of the latest EOD record.
    expect(quote.price).toBe(192.12);
    expect(quote.currency).toBe('USD');
    expect(quote.asOf).toBe('2026-07-16T00:00:00.000Z');
    // (c) quality/freshness: EOD, never real-time.
    expect(quote.quality).toEqual(['eod']);
    expect(quote.source.freshness).toBe('eod');
    expect(quote.source.provider).toBe('marketstack');
    expect(quote.source.endpoint).toBe('/eod/latest');
    expect(Date.parse(quote.source.requestedAt)).toBeLessThanOrEqual(
      Date.parse(quote.source.receivedAt),
    );
    // Raw provider identifier preserved — no bare-symbol joins.
    expect(quote.instrument.providerIds['marketstack']).toBe('AAPL');
    expect(quote.instrument.exchange).toBe('XNAS');
    expect(quote.lineage.map((s) => s.step)).toContain('quote_from_eod');
    // Currency uppercasing (documented lower-case ISO) is disclosed in lineage.
    const derivation = quote.lineage.find((s) => s.step === 'quote_from_eod');
    expect(derivation?.description).toContain('uppercased');
  });

  it('builds the documented URL with access_key as a query param', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(fixture('eod_latest.json')));
    await adapterWith(fetchImpl).getQuote({ symbol: 'AAPL' });

    // (b) URL/path/params/auth construction
    const url = urlOfCall(fetchImpl);
    expect(url.origin).toBe('https://api.marketstack.com');
    expect(url.pathname).toBe('/v2/eod/latest');
    expect(url.searchParams.get('access_key')).toBe(TEST_KEY);
    expect(url.searchParams.get('symbols')).toBe('AAPL');
    expect(url.searchParams.get('limit')).toBe('1');
    // Auth is a query param, never a header.
    const init = (fetchImpl.mock.calls[0] as unknown[] | undefined)?.[1] as
      | RequestInit
      | undefined;
    expect(JSON.stringify(init?.headers ?? {})).not.toContain(TEST_KEY);
  });

  it('throws DataQualityError when no EOD record is returned', async () => {
    const empty = {
      pagination: { limit: 1, offset: 0, count: 0, total: 0 },
      data: [],
    };
    const fetchImpl = vi.fn(async () => jsonResponse(empty));
    await expect(adapterWith(fetchImpl).getQuote({ symbol: 'ZZZZ' })).rejects.toBeInstanceOf(
      DataQualityError,
    );
  });
});

describe('MarketstackAdapter.getDailyBars', () => {
  it('maps adj_* fields to split_dividend_adjusted bars with lineage', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(fixture('eod.json')));
    const series = await adapterWith(fetchImpl).getDailyBars({
      symbol: 'AAPL',
      from: '2026-07-14',
      to: '2026-07-16',
    });

    expect(() => PriceSeriesSchema.parse(series)).not.toThrow();
    expect(series.frequency).toBe('1d');
    expect(series.adjustment).toBe('split_dividend_adjusted');
    expect(series.quality).toEqual(['eod', 'adjusted']);
    expect(series.source.freshness).toBe('eod');
    expect(series.source.endpoint).toBe('/eod');
    expect(series.currency).toBe('USD');
    expect(series.bars).toHaveLength(3);
    // Bars carry adjusted values, not raw close.
    expect(series.bars[0]?.c).toBe(190.8);
    expect(series.bars[2]?.c).toBe(191.88);
    expect(series.bars[0]?.t).toBe('2026-07-14T00:00:00.000Z');
    // Lineage records the adjusted-field mapping decision.
    const mapping = series.lineage.find((s) => s.step === 'field_mapping');
    expect(mapping?.description).toContain('adj_close');
    expect(series.lineage.map((s) => s.step)).toContain('timestamp_to_utc');

    // (b) documented query params
    const url = urlOfCall(fetchImpl);
    expect(url.pathname).toBe('/v2/eod');
    expect(url.searchParams.get('access_key')).toBe(TEST_KEY);
    expect(url.searchParams.get('symbols')).toBe('AAPL');
    expect(url.searchParams.get('sort')).toBe('ASC');
    expect(url.searchParams.get('date_from')).toBe('2026-07-14');
    expect(url.searchParams.get('date_to')).toBe('2026-07-16');
    expect(url.searchParams.get('offset')).toBe('0');
    expect(url.searchParams.get('limit')).toBe('1000');
  });

  it('falls back to raw OHLC (adjustment "raw") when adj_* fields are null', async () => {
    const body = fixture<MarketstackListResponse<MarketstackEodBar>>('eod.json');
    const secondBar = body.data[1];
    if (secondBar === undefined) throw new Error('fixture must contain 3 bars');
    secondBar.adj_close = null;
    const fetchImpl = vi.fn(async () => jsonResponse(body));
    const series = await adapterWith(fetchImpl).getDailyBars({ symbol: 'AAPL' });

    expect(() => PriceSeriesSchema.parse(series)).not.toThrow();
    expect(series.adjustment).toBe('raw');
    expect(series.quality).toEqual(['eod']);
    expect(series.bars[0]?.c).toBe(191.04); // raw close, not adj_close
    const mapping = series.lineage.find((s) => s.step === 'field_mapping');
    expect(mapping?.description).toContain('raw');
  });

  it('honors the caller limit as a hard item cap', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(fixture('eod.json')));
    const series = await adapterWith(fetchImpl).getDailyBars({ symbol: 'AAPL', limit: 2 });
    expect(series.bars).toHaveLength(2);
    expect(urlOfCall(fetchImpl).searchParams.get('limit')).toBe('2');
  });

  it('follows documented offset pagination past a full page', async () => {
    const body = fixture<MarketstackListResponse<MarketstackEodBar>>('eod.json');
    const template = body.data[0];
    if (template === undefined) throw new Error('fixture must contain a bar');
    const fullPage = Array.from({ length: 1000 }, (_, i) => ({
      ...template,
      date: `2022-01-01T00:00:00+0000`,
      close: 100 + (i % 50),
    }));
    const tail = body.data;
    const fetchImpl = vi.fn(async (input: URL | string) => {
      const offset = new URL(String(input)).searchParams.get('offset');
      return offset === '0'
        ? jsonResponse({
            pagination: { limit: 1000, offset: 0, count: 1000, total: 1003 },
            data: fullPage,
          })
        : jsonResponse({
            pagination: { limit: 1000, offset: 1000, count: 3, total: 1003 },
            data: tail,
          });
    });
    const series = await adapterWith(fetchImpl).getDailyBars({ symbol: 'AAPL' });
    expect(series.bars).toHaveLength(1003);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(urlOfCall(fetchImpl, 1).searchParams.get('offset')).toBe('1000');
  });
});

describe('MarketstackAdapter.getIntradayBars', () => {
  it('returns delayed US/IEX bars, tolerating documented NULL fields', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(fixture('intraday.json')));
    const series = await adapterWith(fetchImpl).getIntradayBars({
      symbol: 'BRK.B',
      interval: '5m',
    });

    expect(() => PriceSeriesSchema.parse(series)).not.toThrow();
    // (c) intraday is delayed, never realtime; dropped NULL bar => incomplete.
    expect(series.source.freshness).toBe('delayed');
    expect(series.quality).toEqual(['delayed', 'incomplete']);
    expect(series.adjustment).toBe('raw');
    expect(series.frequency).toBe('5m');
    // The all-NULL third bar is dropped, the two complete bars survive.
    expect(series.bars).toHaveLength(2);
    expect(series.bars[0]?.o).toBe(512.1);
    expect(series.bars[1]?.c).toBe(512.7);
    expect(series.bars[0]?.t).toBe('2026-07-16T15:30:00.000Z');
    expect(series.lineage.map((s) => s.step)).toContain('null_bar_filter');
    // Raw provider symbol (hyphenated) preserved in providerIds.
    expect(series.instrument.symbol).toBe('BRK.B');
    expect(series.instrument.providerIds['marketstack']).toBe('BRK-B');
    expect(series.instrument.exchange).toBe('IEXG');

    // (b) documented interval enum + hyphenated symbol convention
    const url = urlOfCall(fetchImpl);
    expect(url.pathname).toBe('/v2/intraday');
    expect(url.searchParams.get('symbols')).toBe('BRK-B');
    expect(url.searchParams.get('interval')).toBe('5min');
    expect(url.searchParams.get('access_key')).toBe(TEST_KEY);
    expect(series.lineage.map((s) => s.step)).toContain('symbol_hyphenation');
  });

  it('rejects intervals the provider does not document', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(fixture('intraday.json')));
    await expect(
      adapterWith(fetchImpl).getIntradayBars({ symbol: 'AAPL', interval: '1d' }),
    ).rejects.toBeInstanceOf(NotSupportedError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('honors the caller limit as a hard item cap', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(fixture('intraday.json')));
    const series = await adapterWith(fetchImpl).getIntradayBars({
      symbol: 'AAPL',
      interval: '5m',
      limit: 2,
    });
    expect(series.bars).toHaveLength(2);
    expect(urlOfCall(fetchImpl).searchParams.get('limit')).toBe('2');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('MarketstackAdapter.getCorporateActions', () => {
  it('merges /splits and /dividends into schema-valid corporate actions', async () => {
    const fetchImpl = vi.fn(async (input: URL | string) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/splits')) return jsonResponse(fixture('splits.json'));
      if (url.pathname.endsWith('/dividends')) return jsonResponse(fixture('dividends.json'));
      return new Response('not found', { status: 404 });
    });
    const actions = await adapterWith(fetchImpl).getCorporateActions({
      symbol: 'AAPL',
      from: '2014-01-01',
      to: '2026-07-16',
    });

    expect(() => CorporateActionsSchema.parse(actions)).not.toThrow();
    expect(actions.splits).toEqual([
      { date: '2014-06-09', splitFactor: 7 },
      { date: '2020-08-31', splitFactor: 4 },
    ]);
    // Dates normalized to YYYY-MM-DD even when the provider sends timestamps.
    expect(actions.dividends).toEqual([
      { date: '2026-02-10', amount: 0.25 },
      { date: '2026-05-12', amount: 0.26 },
    ]);
    expect(actions.quality).toEqual(['eod']);
    expect(actions.source.endpoint).toBe('/splits');
    expect(actions.additionalSources[0]?.endpoint).toBe('/dividends');
    expect(actions.instrument.providerIds['marketstack']).toBe('AAPL');

    // (b) both documented endpoints hit with symbols + date range + auth
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const splitsUrl = urlOfCall(fetchImpl, 0);
    const dividendsUrl = urlOfCall(fetchImpl, 1);
    expect(splitsUrl.pathname).toBe('/v2/splits');
    expect(dividendsUrl.pathname).toBe('/v2/dividends');
    for (const url of [splitsUrl, dividendsUrl]) {
      expect(url.searchParams.get('symbols')).toBe('AAPL');
      expect(url.searchParams.get('date_from')).toBe('2014-01-01');
      expect(url.searchParams.get('date_to')).toBe('2026-07-16');
      expect(url.searchParams.get('access_key')).toBe(TEST_KEY);
    }
  });

  it('paginates dividends past a full page instead of truncating', async () => {
    const fullPage = Array.from({ length: 1000 }, (_, i) => ({
      symbol: 'AAPL',
      date: `19${String(80 + Math.floor(i / 100)).slice(-2)}-01-0${(i % 9) + 1}`,
      dividend: 0.1,
    }));
    const fetchImpl = vi.fn(async (input: URL | string) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/splits')) return jsonResponse(fixture('splits.json'));
      const offset = url.searchParams.get('offset');
      return offset === '0'
        ? jsonResponse({
            pagination: { limit: 1000, offset: 0, count: 1000, total: 1002 },
            data: fullPage,
          })
        : jsonResponse({
            pagination: { limit: 1000, offset: 1000, count: 2, total: 1002 },
            data: [
              { symbol: 'AAPL', date: '2026-02-10T00:00:00+0000', dividend: 0.25 },
              { symbol: 'AAPL', date: '2026-05-12', dividend: 0.26 },
            ],
          });
    });
    const actions = await adapterWith(fetchImpl).getCorporateActions({ symbol: 'AAPL' });
    expect(actions.dividends).toHaveLength(1002);
    expect(actions.dividends.at(-1)).toEqual({ date: '2026-05-12', amount: 0.26 });
    // splits (1 page) + dividends (2 pages)
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});

describe('MarketstackAdapter.listExchanges', () => {
  it('returns schema-valid exchange directory entries', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(fixture('exchanges.json')));
    const exchanges = await adapterWith(fetchImpl).listExchanges({ limit: 2 });

    expect(exchanges).toHaveLength(2);
    for (const exchange of exchanges) {
      expect(() => ExchangeInfoSchema.parse(exchange)).not.toThrow();
    }
    expect(exchanges[0]).toEqual({
      name: 'NASDAQ Stock Exchange',
      mic: 'XNAS',
      country: 'USA',
    });
    const url = urlOfCall(fetchImpl);
    expect(url.pathname).toBe('/v2/exchanges');
    expect(url.searchParams.get('limit')).toBe('2');
  });
});

describe('MarketstackAdapter error mapping', () => {
  it('maps HTTP 429 to RateLimitError', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response('rate limited', { status: 429, headers: { 'retry-after': '0' } }),
    );
    await expect(adapterWith(fetchImpl).getQuote({ symbol: 'AAPL' })).rejects.toBeInstanceOf(
      RateLimitError,
    );
  });

  it('maps HTTP 401 to EntitlementError without retrying', async () => {
    const fetchImpl = vi.fn(async () => new Response('denied', { status: 401 }));
    await expect(adapterWith(fetchImpl).getQuote({ symbol: 'AAPL' })).rejects.toBeInstanceOf(
      EntitlementError,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('maps the documented validation error envelope to ValidationError', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(fixture('error_validation.json')));
    await expect(adapterWith(fetchImpl).getQuote({ symbol: 'AAPL' })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('maps a rate_limit_reached envelope on a 200 body to RateLimitError', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        error: {
          code: 'rate_limit_reached',
          message: 'The given user account has reached the rate limit.',
        },
      }),
    );
    await expect(adapterWith(fetchImpl).getQuote({ symbol: 'AAPL' })).rejects.toBeInstanceOf(
      RateLimitError,
    );
  });

  it('maps an unauthorized envelope on a 200 body to EntitlementError', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        error: {
          code: 'unauthorized',
          message: 'Authentication failed. Please verify your access key or account status.',
        },
      }),
    );
    await expect(adapterWith(fetchImpl).getDailyBars({ symbol: 'AAPL' })).rejects.toBeInstanceOf(
      EntitlementError,
    );
  });
});

describe('MarketstackAdapter configuration & health', () => {
  it('reports unconfigured without throwing when the env var is absent', async () => {
    delete process.env[ENV_VAR];
    resetEnvCacheForTests();

    const fetchImpl = vi.fn();
    const adapter = adapterWith(fetchImpl);
    expect(adapter.isConfigured()).toBe(false);

    const health = await adapter.healthCheck();
    expect(health.configured).toBe(false);
    expect(health.live).toBeNull();
    expect(health.message).toContain(ENV_VAR);
    expect(fetchImpl).not.toHaveBeenCalled();

    // Data methods surface a ConfigError lazily instead of throwing at
    // construct/import time.
    await expect(adapter.getQuote({ symbol: 'AAPL' })).rejects.toBeInstanceOf(ConfigError);
  });

  it('healthCheck({live:true}) performs exactly one minimal-quota request', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(fixture('exchanges.json')));
    const health = await adapterWith(fetchImpl).healthCheck({ live: true });

    expect(health.configured).toBe(true);
    expect(health.live).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const url = urlOfCall(fetchImpl);
    expect(url.pathname).toBe('/v2/exchanges');
    expect(url.searchParams.get('limit')).toBe('1');
  });

  it('folds live-probe failures into the health result instead of throwing', async () => {
    const fetchImpl = vi.fn(async () => new Response('denied', { status: 401 }));
    const health = await adapterWith(fetchImpl).healthCheck({ live: true });
    expect(health.configured).toBe(true);
    expect(health.live).toBe(false);
    expect(health.message).not.toContain(TEST_KEY);
  });
});
