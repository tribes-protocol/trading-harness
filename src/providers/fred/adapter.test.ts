import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetEnvCacheForTests } from '../../core/config.js';
import {
  DataQualityError,
  EntitlementError,
  HttpError,
  RateLimitError,
} from '../../core/errors.js';
import { resetBucketsForTests } from '../../core/ratelimit.js';
import { MacroSeriesInfoSchema, MacroSeriesSchema } from '../../schemas/macro.js';
import { FRED_ATTRIBUTION, FredAdapter } from './adapter.js';
import type { FredObservationsResponse } from './types.js';

const here = dirname(fileURLToPath(import.meta.url));

function fixture<T = unknown>(name: string): T {
  return JSON.parse(readFileSync(join(here, 'fixtures', name), 'utf8')) as T;
}

const TEST_KEY = 'test-key-fred-0123456789';

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

/** fetch mock routing by URL pathname; records every requested URL. */
function mockFetch(routes: Record<string, unknown>): { impl: typeof fetch; calls: URL[] } {
  const calls: URL[] = [];
  const impl = (async (input: Parameters<typeof fetch>[0]): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    calls.push(url);
    const body = routes[url.pathname];
    if (body === undefined) {
      return jsonResponse({ error_code: 404, error_message: 'Not Found.' }, 404);
    }
    return jsonResponse(body);
  }) as typeof fetch;
  return { impl, calls };
}

function defaultRoutes(): Record<string, unknown> {
  return {
    '/fred/series': fixture('series.json'),
    '/fred/series/observations': fixture('series_observations.json'),
    '/fred/series/search': fixture('series_search.json'),
  };
}

beforeEach(() => {
  process.env.FRED_API_KEY = TEST_KEY;
  resetEnvCacheForTests();
  resetBucketsForTests();
});

afterEach(() => {
  delete process.env.FRED_API_KEY;
  resetEnvCacheForTests();
});

describe('FredAdapter.getMacroSeries', () => {
  it('returns schema-valid MacroSeries; "." observations become value: null', async () => {
    const { impl } = mockFetch(defaultRoutes());
    const adapter = new FredAdapter({ fetchImpl: impl });
    const series = await adapter.getMacroSeries({ seriesId: 'GNPCA' });

    // Must round-trip the platform schema.
    const parsed = MacroSeriesSchema.parse(series);
    expect(parsed.info.id).toBe('GNPCA');
    expect(parsed.info.frequency).toBe('1y');
    expect(parsed.info.frequencyRaw).toBe('Annual');
    expect(parsed.info.units).toBe('Billions of Chained 2017 Dollars');
    expect(parsed.vintage).toBe('latest');
    expect(parsed.observations).toHaveLength(3);
    expect(parsed.observations[0]?.value).toBeCloseTo(22112.329);
    expect(parsed.observations[1]?.value).toBeCloseTo(22729.35);
    // Documented missing marker "." mapped explicitly to null.
    expect(parsed.observations[2]?.value).toBeNull();
    // latest vintage carries no per-observation realtime window.
    expect(parsed.observations[0]?.realtimeStart).toBeUndefined();
    // last_updated "2026-03-26 07:51:21-05" converted to UTC ISO.
    expect(parsed.info.lastUpdated).toBe('2026-03-26T12:51:21.000Z');
  });

  it('builds documented URLs with api_key + file_type=json auth query params', async () => {
    const { impl, calls } = mockFetch(defaultRoutes());
    const adapter = new FredAdapter({ fetchImpl: impl });
    await adapter.getMacroSeries({ seriesId: 'GNPCA', from: '2023-01-01', to: '2025-12-31' });

    const infoCall = calls.find((u) => u.pathname === '/fred/series');
    const obsCall = calls.find((u) => u.pathname === '/fred/series/observations');
    expect(infoCall).toBeDefined();
    expect(obsCall).toBeDefined();

    expect(infoCall?.origin).toBe('https://api.stlouisfed.org');
    expect(infoCall?.searchParams.get('api_key')).toBe(TEST_KEY);
    expect(infoCall?.searchParams.get('file_type')).toBe('json');
    expect(infoCall?.searchParams.get('series_id')).toBe('GNPCA');

    expect(obsCall?.searchParams.get('api_key')).toBe(TEST_KEY);
    expect(obsCall?.searchParams.get('file_type')).toBe('json');
    expect(obsCall?.searchParams.get('series_id')).toBe('GNPCA');
    expect(obsCall?.searchParams.get('observation_start')).toBe('2023-01-01');
    expect(obsCall?.searchParams.get('observation_end')).toBe('2025-12-31');
    expect(obsCall?.searchParams.get('sort_order')).toBe('asc');
    // latest vintage uses FRED default realtime (params omitted).
    expect(obsCall?.searchParams.get('realtime_start')).toBeNull();
    expect(obsCall?.searchParams.get('realtime_end')).toBeNull();
  });

  it('point_in_time vintage sends ALFRED realtime bounds and maps vintage windows', async () => {
    const routes = {
      ...defaultRoutes(),
      '/fred/series/observations': fixture('series_observations_vintage.json'),
    };
    const { impl, calls } = mockFetch(routes);
    const adapter = new FredAdapter({ fetchImpl: impl });
    const series = await adapter.getMacroSeries({ seriesId: 'GNPCA', vintage: 'point_in_time' });

    const obsCall = calls.find((u) => u.pathname === '/fred/series/observations');
    expect(obsCall?.searchParams.get('realtime_start')).toBe('1776-07-04');
    expect(obsCall?.searchParams.get('realtime_end')).toBe('9999-12-31');

    const parsed = MacroSeriesSchema.parse(series);
    expect(parsed.vintage).toBe('point_in_time');
    expect(parsed.observations[0]).toMatchObject({
      date: '2023-01-01',
      value: 22100.12,
      realtimeStart: '2024-03-28',
      realtimeEnd: '2024-09-25',
    });
    expect(parsed.observations[1]).toMatchObject({
      date: '2023-01-01',
      value: 22112.329,
      realtimeStart: '2024-09-26',
      realtimeEnd: '9999-12-31',
    });
    expect(parsed.lineage.some((s) => s.step === 'map_realtime_windows')).toBe(true);
  });

  it('stamps eod freshness/quality truthfully with source + lineage', async () => {
    const { impl } = mockFetch(defaultRoutes());
    const adapter = new FredAdapter({ fetchImpl: impl });
    const series = await adapter.getMacroSeries({ seriesId: 'GNPCA' });

    expect(series.source.provider).toBe('fred');
    expect(series.source.endpoint).toBe('/fred/series/observations');
    expect(series.source.freshness).toBe('eod');
    // No caching, ever — FRED terms prohibit storing/caching content.
    expect(series.source.cacheHit).toBe(false);
    expect(Date.parse(series.source.requestedAt)).toBeLessThanOrEqual(
      Date.parse(series.source.receivedAt),
    );
    expect(series.additionalSources[0]?.endpoint).toBe('/fred/series');
    expect(series.quality).toEqual(['eod']);
    expect(series.quality).not.toContain('realtime');

    const steps = series.lineage.map((s) => s.step);
    expect(steps).toContain('map_series_metadata');
    expect(steps).toContain('convert_last_updated_timestamp');
    expect(steps).toContain('parse_observation_values');
  });

  it('follows documented limit+offset pagination until count is reached (no truncation)', async () => {
    const envelope = fixture<FredObservationsResponse>('series_observations.json');
    const allObservations = [
      { realtime_start: '2026-07-17', realtime_end: '2026-07-17', date: '2022-01-01', value: '1.5' },
      { realtime_start: '2026-07-17', realtime_end: '2026-07-17', date: '2023-01-01', value: '2.5' },
      { realtime_start: '2026-07-17', realtime_end: '2026-07-17', date: '2024-01-01', value: '.' },
      { realtime_start: '2026-07-17', realtime_end: '2026-07-17', date: '2025-01-01', value: '4.5' },
    ];
    const pageSize = 2;
    const calls: URL[] = [];
    const impl = (async (input: Parameters<typeof fetch>[0]): Promise<Response> => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      calls.push(url);
      if (url.pathname === '/fred/series') return jsonResponse(fixture('series.json'));
      const offset = Number(url.searchParams.get('offset') ?? '0');
      return jsonResponse({
        ...envelope,
        count: allObservations.length,
        offset,
        limit: pageSize,
        observations: allObservations.slice(offset, offset + pageSize),
      });
    }) as typeof fetch;

    const adapter = new FredAdapter({ fetchImpl: impl });
    const series = await adapter.getMacroSeries({ seriesId: 'GNPCA' });

    // All pages fetched — nothing silently truncated at one page.
    expect(series.observations).toHaveLength(4);
    expect(series.observations.map((o) => o.value)).toEqual([1.5, 2.5, null, 4.5]);

    const obsCalls = calls.filter((u) => u.pathname === '/fred/series/observations');
    expect(obsCalls).toHaveLength(2);
    expect(obsCalls[0]?.searchParams.get('offset')).toBeNull();
    expect(obsCalls[1]?.searchParams.get('offset')).toBe('2');

    expect(series.lineage.some((s) => s.step === 'paginate_observations')).toBe(true);
    expect(Date.parse(series.source.requestedAt)).toBeLessThanOrEqual(
      Date.parse(series.source.receivedAt),
    );
  });

  it('throws DataQualityError (not a bare TypeError) on a 200 body missing observations[]', async () => {
    const malformed = { ...fixture<Record<string, unknown>>('series_observations.json') };
    delete malformed['observations'];
    const { impl } = mockFetch({ ...defaultRoutes(), '/fred/series/observations': malformed });
    const adapter = new FredAdapter({ fetchImpl: impl });
    await expect(adapter.getMacroSeries({ seriesId: 'GNPCA' })).rejects.toBeInstanceOf(
      DataQualityError,
    );
  });

  it('throws DataQualityError on a non-numeric, non-missing observation value', async () => {
    const corrupted = fixture<FredObservationsResponse>('series_observations.json');
    corrupted.observations = [
      {
        realtime_start: '2026-07-17',
        realtime_end: '2026-07-17',
        date: '2023-01-01',
        value: 'not-a-number',
      },
    ];
    const { impl } = mockFetch({ ...defaultRoutes(), '/fred/series/observations': corrupted });
    const adapter = new FredAdapter({ fetchImpl: impl });
    await expect(adapter.getMacroSeries({ seriesId: 'GNPCA' })).rejects.toBeInstanceOf(
      DataQualityError,
    );
  });
});

describe('FredAdapter.searchMacroSeries', () => {
  it('returns schema-valid MacroSeriesInfo[] and clamps limit to the documented 1000 cap', async () => {
    const { impl, calls } = mockFetch(defaultRoutes());
    const adapter = new FredAdapter({ fetchImpl: impl });
    const results = await adapter.searchMacroSeries({ query: 'consumer price index', limit: 5000 });

    const searchCall = calls.find((u) => u.pathname === '/fred/series/search');
    expect(searchCall?.searchParams.get('search_text')).toBe('consumer price index');
    expect(searchCall?.searchParams.get('limit')).toBe('1000');
    expect(searchCall?.searchParams.get('api_key')).toBe(TEST_KEY);
    expect(searchCall?.searchParams.get('file_type')).toBe('json');

    expect(results).toHaveLength(2);
    for (const info of results) MacroSeriesInfoSchema.parse(info);
    expect(results[0]?.id).toBe('CPIAUCSL');
    expect(results[0]?.frequency).toBe('1mo');
    expect(results[1]?.id).toBe('CPILFESL');
    expect(results[1]?.notes).toBeUndefined();
  });
});

describe('FredAdapter error mapping', () => {
  it('maps 429 to RateLimitError', async () => {
    const impl = (async () =>
      jsonResponse(
        { error_code: 429, error_message: 'Too Many Requests.' },
        429,
        { 'retry-after': '0' },
      )) as typeof fetch;
    const adapter = new FredAdapter({ fetchImpl: impl });
    await expect(adapter.getMacroSeries({ seriesId: 'GNPCA' })).rejects.toBeInstanceOf(
      RateLimitError,
    );
  });

  it('maps 401 to EntitlementError', async () => {
    const impl = (async () =>
      jsonResponse({ error_code: 401, error_message: 'Unauthorized.' }, 401)) as typeof fetch;
    const adapter = new FredAdapter({ fetchImpl: impl });
    await expect(adapter.searchMacroSeries({ query: 'gdp' })).rejects.toBeInstanceOf(
      EntitlementError,
    );
  });

  it('maps the documented 400 error envelope to HttpError with status + provider', async () => {
    const impl = (async () =>
      jsonResponse(
        {
          error_code: 400,
          error_message: 'Bad Request. The value for variable series_id is not valid.',
        },
        400,
      )) as typeof fetch;
    const adapter = new FredAdapter({ fetchImpl: impl });
    const err = await adapter.getMacroSeries({ seriesId: 'NOPE' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(400);
    expect((err as HttpError).provider).toBe('fred');
  });
});

describe('FredAdapter configuration + health', () => {
  it('reports unconfigured without throwing when the env var is absent', async () => {
    delete process.env.FRED_API_KEY;
    resetEnvCacheForTests();
    const adapter = new FredAdapter();
    expect(adapter.isConfigured()).toBe(false);
    const health = await adapter.healthCheck();
    expect(health.configured).toBe(false);
    expect(health.live).toBeNull();
    expect(health.message).toContain('FRED_API_KEY');
  });

  it('live health check performs exactly one minimal-quota request', async () => {
    const { impl, calls } = mockFetch(defaultRoutes());
    const adapter = new FredAdapter({ fetchImpl: impl });
    const health = await adapter.healthCheck({ live: true });
    expect(health.configured).toBe(true);
    expect(health.live).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.pathname).toBe('/fred/series');
    expect(calls[0]?.searchParams.get('series_id')).toBe('GNPCA');
  });

  it('exports the required FRED attribution string verbatim', () => {
    expect(FRED_ATTRIBUTION).toBe(
      'This product uses the FRED API but is not endorsed or certified by the Federal Reserve Bank of St. Louis.',
    );
  });
});
