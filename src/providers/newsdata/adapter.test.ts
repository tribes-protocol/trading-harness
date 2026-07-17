import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetEnvCacheForTests } from '../../core/config.js';
import { EntitlementError, RateLimitError, ValidationError } from '../../core/errors.js';
import { resetBucketsForTests } from '../../core/ratelimit.js';
import { NewsBatchSchema } from '../../schemas/news.js';
import { NewsDataAdapter } from './adapter.js';

const here = dirname(fileURLToPath(import.meta.url));

function fixture<T = unknown>(name: string): T {
  return JSON.parse(readFileSync(join(here, 'fixtures', name), 'utf8')) as T;
}

const TEST_KEY = 'test-key-newsdata-0123456789';

/** nextPage cursor emitted by fixtures/latest.json. */
const PAGE2_CURSOR = '1752694811123456789';

/** Documented error envelope: { status: "error", results: { message, code } }. */
function errorEnvelope(code: string, message: string): unknown {
  return { status: 'error', results: { message, code } };
}

interface RecordedCall {
  url: URL;
  /** Request headers, lower-cased keys. */
  headers: Record<string, string>;
}

interface MockRoute {
  body: unknown;
  status?: number;
  headers?: Record<string, string>;
}

/** fetch mock driven by a per-URL router; records every request. */
function mockFetch(route: (url: URL) => MockRoute): { impl: typeof fetch; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const impl = (async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries((init?.headers ?? {}) as Record<string, string>)) {
      headers[key.toLowerCase()] = value;
    }
    calls.push({ url, headers });
    const { body, status = 200, headers: responseHeaders = {} } = route(url);
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', ...responseHeaders },
    });
  }) as typeof fetch;
  return { impl, calls };
}

/** Default happy-path router: latest (2 pages via nextPage cursor) + archive. */
function defaultRoute(url: URL): MockRoute {
  if (url.pathname === '/api/1/latest') {
    return url.searchParams.get('page') === PAGE2_CURSOR
      ? { body: fixture('latest_page2.json') }
      : { body: fixture('latest.json') };
  }
  if (url.pathname === '/api/1/archive') {
    return { body: fixture('archive.json') };
  }
  return { body: errorEnvelope('NotFound', 'Endpoint not found.'), status: 404 };
}

beforeEach(() => {
  process.env.NEWSDATA_API_KEY = TEST_KEY;
  resetEnvCacheForTests();
  resetBucketsForTests();
});

afterEach(() => {
  delete process.env.NEWSDATA_API_KEY;
  resetEnvCacheForTests();
});

describe('NewsDataAdapter.getNews — /1/latest', () => {
  it('returns schema-valid NewsBatch following the nextPage cursor across pages', async () => {
    const { impl, calls } = mockFetch(defaultRoute);
    const adapter = new NewsDataAdapter({ fetchImpl: impl });
    const batch = await adapter.getNews({ query: 'markets' });

    const parsed = NewsBatchSchema.parse(batch);
    // Two fixture pages walked via nextPage -> page cursor.
    expect(calls).toHaveLength(2);
    expect(calls[0]?.url.searchParams.get('page')).toBeNull();
    expect(calls[1]?.url.searchParams.get('page')).toBe(PAGE2_CURSOR);

    expect(parsed.items).toHaveLength(3);
    expect(parsed.totalAvailable).toBe(3);
    // Provider-native article_id preserved verbatim as id.
    expect(parsed.items[0]?.id).toBe('8ac2f3b1d94e0c57a6b1e2f3d4c5a6b7');
    expect(parsed.items[0]?.title).toBe('Fed Holds Rates Steady as Inflation Cools');
    expect(parsed.items[0]?.url).toBe(
      'https://www.example-news.test/business/fed-holds-rates-steady',
    );
    expect(parsed.items[0]?.sourceName).toBe('Example News');
    expect(parsed.items[0]?.sourceDomain).toBe('www.example-news.test');
    expect(parsed.items[0]?.categories).toEqual(['business']);
    // pubDate "2026-07-16 21:15:00" (UTC per docs) -> UTC ISO publishedAt.
    expect(parsed.items[0]?.publishedAt).toBe('2026-07-16T21:15:00.000Z');
    expect(parsed.items[2]?.id).toBe('1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e');
  });

  it('sends X-ACCESS-KEY header auth (never the apikey query param) with documented params', async () => {
    const { impl, calls } = mockFetch(defaultRoute);
    const adapter = new NewsDataAdapter({ fetchImpl: impl });
    await adapter.getNews({ query: 'fed rates', language: 'en', category: 'business', max: 5 });

    const call = calls[0];
    expect(call).toBeDefined();
    expect(call?.url.origin).toBe('https://newsdata.io');
    expect(call?.url.pathname).toBe('/api/1/latest');
    expect(call?.headers['x-access-key']).toBe(TEST_KEY);
    // Key must never leak into the URL.
    expect(call?.url.searchParams.get('apikey')).toBeNull();
    expect(call?.url.toString()).not.toContain(TEST_KEY);

    expect(call?.url.searchParams.get('q')).toBe('fed rates');
    expect(call?.url.searchParams.get('language')).toBe('en');
    expect(call?.url.searchParams.get('category')).toBe('business');
    // max <= 10 becomes a free-plan-safe size param.
    expect(call?.url.searchParams.get('size')).toBe('5');
    // Latest window never takes date bounds.
    expect(call?.url.searchParams.get('from_date')).toBeNull();
    expect(call?.url.searchParams.get('to_date')).toBeNull();
  });

  it('honors max by stopping at the cap without fetching further pages', async () => {
    const { impl, calls } = mockFetch(defaultRoute);
    const adapter = new NewsDataAdapter({ fetchImpl: impl });
    const batch = await adapter.getNews({ max: 2 });

    // Page 1 already satisfies max=2 — the nextPage cursor must not be followed.
    expect(calls).toHaveLength(1);
    expect(batch.items).toHaveLength(2);
    expect(calls[0]?.url.searchParams.get('size')).toBe('2');
  });

  it('omits size when max exceeds the free-plan page cap (plan default applies)', async () => {
    const { impl, calls } = mockFetch(defaultRoute);
    const adapter = new NewsDataAdapter({ fetchImpl: impl });
    await adapter.getNews({ max: 40 });
    expect(calls[0]?.url.searchParams.get('size')).toBeNull();
  });

  it('stamps delayed freshness/quality truthfully with source + lineage', async () => {
    const { impl } = mockFetch(defaultRoute);
    const adapter = new NewsDataAdapter({ fetchImpl: impl });
    const batch = await adapter.getNews({ query: 'markets' });

    expect(batch.source.provider).toBe('newsdata');
    expect(batch.source.endpoint).toBe('/api/1/latest');
    expect(batch.source.apiVersion).toBe('1');
    // Free tier delays 12h; Terms do not guarantee real-time even paid.
    expect(batch.source.freshness).toBe('delayed');
    expect(batch.quality).toEqual(['delayed']);
    expect(batch.quality).not.toContain('realtime');
    expect(batch.source.cacheHit).toBe(false);
    expect(Date.parse(batch.source.requestedAt)).toBeLessThanOrEqual(
      Date.parse(batch.source.receivedAt),
    );

    const steps = batch.lineage.map((s) => s.step);
    expect(steps).toContain('paginate_next_page');
    expect(steps).toContain('map_article_fields');
    expect(steps).toContain('convert_pubdate_timestamp');
    expect(steps).toContain('map_vendor_sentiment');
  });

  it('maps vendor sentiment to provider_model/model_estimate and skips absent sentiment', async () => {
    const { impl } = mockFetch(defaultRoute);
    const adapter = new NewsDataAdapter({ fetchImpl: impl });
    const batch = await adapter.getNews({});

    expect(batch.items[0]?.sentiment).toEqual({
      label: 'neutral',
      method: 'provider_model',
      evidenceType: 'model_estimate',
    });
    expect(batch.items[1]?.sentiment).toEqual({
      label: 'positive',
      method: 'provider_model',
      evidenceType: 'model_estimate',
    });
    // Page-2 article has sentiment: null (plan-gated) — no sentiment object.
    expect(batch.items[2]?.sentiment).toBeUndefined();
  });
});

describe('NewsDataAdapter.getNews — /1/archive', () => {
  it('routes from/to to /1/archive with from_date/to_date and stamps historical freshness', async () => {
    const { impl, calls } = mockFetch(defaultRoute);
    const adapter = new NewsDataAdapter({ fetchImpl: impl });
    const batch = await adapter.getNews({
      query: 'ecb',
      from: '2025-11-01',
      to: '2025-11-30',
    });

    const parsed = NewsBatchSchema.parse(batch);
    expect(calls[0]?.url.pathname).toBe('/api/1/archive');
    expect(calls[0]?.url.searchParams.get('q')).toBe('ecb');
    expect(calls[0]?.url.searchParams.get('from_date')).toBe('2025-11-01');
    expect(calls[0]?.url.searchParams.get('to_date')).toBe('2025-11-30');
    expect(calls[0]?.headers['x-access-key']).toBe(TEST_KEY);

    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0]?.id).toBe('9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c');
    expect(parsed.items[0]?.publishedAt).toBe('2025-11-03T13:45:00.000Z');
    expect(parsed.source.endpoint).toBe('/api/1/archive');
    // Registry: news.archive freshness is historical; still never realtime.
    expect(parsed.source.freshness).toBe('historical');
    expect(parsed.quality).toEqual(['delayed']);
  });

  it('rejects date-bounded requests without any content filter (documented archive requirement)', async () => {
    const { impl, calls } = mockFetch(defaultRoute);
    const adapter = new NewsDataAdapter({ fetchImpl: impl });
    await expect(adapter.getNews({ from: '2025-11-01' })).rejects.toBeInstanceOf(ValidationError);
    expect(calls).toHaveLength(0);
  });

  it('maps archive 422 (documented error envelope) to EntitlementError with plan guidance', async () => {
    const { impl } = mockFetch(() => ({
      body: errorEnvelope('UnsupportedFilter', 'The date range exceeds your plan archive depth.'),
      status: 422,
    }));
    const adapter = new NewsDataAdapter({ fetchImpl: impl });
    const err = await adapter
      .getNews({ query: 'ecb', from: '2010-01-01', to: '2010-12-31' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EntitlementError);
    expect((err as EntitlementError).status).toBe(422);
    expect((err as EntitlementError).message).toContain('plan-gated');
  });

  it('maps archive 403 to EntitlementError with plan guidance', async () => {
    const { impl } = mockFetch(() => ({
      body: errorEnvelope('AccessDenied', 'Your plan does not include archive access.'),
      status: 403,
    }));
    const adapter = new NewsDataAdapter({ fetchImpl: impl });
    const err = await adapter
      .getNews({ query: 'ecb', from: '2025-11-01' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EntitlementError);
    expect((err as EntitlementError).status).toBe(403);
    expect((err as EntitlementError).message).toContain('plan-gated');
  });

  it('does NOT rebrand an archive 401 (invalid key) as plan-gating', async () => {
    const { impl } = mockFetch(() => ({
      body: errorEnvelope('Unauthorized', 'API key is invalid.'),
      status: 401,
    }));
    const adapter = new NewsDataAdapter({ fetchImpl: impl });
    const err = await adapter
      .getNews({ query: 'ecb', from: '2025-11-01' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EntitlementError);
    expect((err as EntitlementError).status).toBe(401);
    // Must keep the shared "check API key" guidance, not archive plan guidance.
    expect((err as EntitlementError).message).not.toContain('plan-gated');
    expect((err as EntitlementError).message).toContain('API key');
  });
});

describe('NewsDataAdapter error mapping', () => {
  it(
    'maps 429 to RateLimitError',
    { timeout: 20_000 },
    async () => {
      const { impl } = mockFetch(() => ({
        body: errorEnvelope('RateLimitExceeded', 'Rate limit exceeded.'),
        status: 429,
        headers: { 'retry-after': '0' },
      }));
      const adapter = new NewsDataAdapter({ fetchImpl: impl });
      await expect(adapter.getNews({ query: 'markets' })).rejects.toBeInstanceOf(RateLimitError);
    },
  );

  it('maps 401 to EntitlementError', async () => {
    const { impl } = mockFetch(() => ({
      body: errorEnvelope('Unauthorized', 'API key is invalid.'),
      status: 401,
    }));
    const adapter = new NewsDataAdapter({ fetchImpl: impl });
    await expect(adapter.getNews({ query: 'markets' })).rejects.toBeInstanceOf(EntitlementError);
  });

  it('surfaces a documented error envelope on a 200 transport as a provider error', async () => {
    const { impl } = mockFetch(() => ({
      body: errorEnvelope('InvalidRequest', 'Something about the request is malformed.'),
      status: 200,
    }));
    const adapter = new NewsDataAdapter({ fetchImpl: impl });
    const err = await adapter.getNews({ query: 'markets' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain('InvalidRequest');
  });

  it('handles the documented InvalidFilterDetail[] array form of the error envelope', async () => {
    const { impl } = mockFetch(() => ({
      body: {
        status: 'error',
        results: [
          { message: 'Unsupported language.', code: 'UnsupportedFilter', invalid_language: 'zz' },
        ],
      },
      status: 200,
    }));
    const adapter = new NewsDataAdapter({ fetchImpl: impl });
    const err = await adapter.getNews({ query: 'markets' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain('UnsupportedFilter');
    expect((err as Error).message).toContain('Unsupported language.');
  });
});

describe('NewsDataAdapter partial/degraded payloads (only article_id is required per spec)', () => {
  it('skips articles missing title/link instead of failing the batch, and records the skip in lineage', async () => {
    const base = fixture<{ results: Record<string, unknown>[] }>('latest.json');
    const degraded = {
      ...base,
      nextPage: null,
      totalResults: 3,
      results: [
        base.results[0],
        { article_id: 'aaaabbbbccccddddeeeeffff00001111', title: null, link: null },
        { ...base.results[1], pubDate: 'not-a-real-timestamp' },
      ],
    };
    const { impl } = mockFetch(() => ({ body: degraded }));
    const adapter = new NewsDataAdapter({ fetchImpl: impl });
    const batch = await adapter.getNews({ query: 'markets' });

    // Null-title/link article skipped; the other two survive.
    expect(batch.items).toHaveLength(2);
    expect(batch.items.map((i) => i.id)).toEqual([
      '8ac2f3b1d94e0c57a6b1e2f3d4c5a6b7',
      '5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b',
    ]);
    const mapStep = batch.lineage.find((s) => s.step === 'map_article_fields');
    expect(mapStep?.params?.skippedIncomplete).toBe(1);
    // Unparseable pubDate → publishedAt omitted (never guessed), batch still valid.
    expect(batch.items[1]?.publishedAt).toBeUndefined();
    const tsStep = batch.lineage.find((s) => s.step === 'convert_pubdate_timestamp');
    expect(tsStep?.params?.omitted).toBe(1);
  });
});

describe('NewsDataAdapter configuration + health', () => {
  it('reports unconfigured without throwing when the env var is absent', async () => {
    delete process.env.NEWSDATA_API_KEY;
    resetEnvCacheForTests();
    const adapter = new NewsDataAdapter();
    expect(adapter.isConfigured()).toBe(false);
    const health = await adapter.healthCheck();
    expect(health.configured).toBe(false);
    expect(health.live).toBeNull();
    expect(health.message).toContain('NEWSDATA_API_KEY');
  });

  it('live health check performs exactly one minimal-quota request (size=1)', async () => {
    const { impl, calls } = mockFetch(defaultRoute);
    const adapter = new NewsDataAdapter({ fetchImpl: impl });
    const health = await adapter.healthCheck({ live: true });
    expect(health.configured).toBe(true);
    expect(health.live).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url.pathname).toBe('/api/1/latest');
    expect(calls[0]?.url.searchParams.get('size')).toBe('1');
    expect(calls[0]?.headers['x-access-key']).toBe(TEST_KEY);
  });
});
