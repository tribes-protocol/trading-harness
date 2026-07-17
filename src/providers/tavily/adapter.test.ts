import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetEnvCacheForTests } from '../../core/config.js';
import {
  EntitlementError,
  HttpError,
  RateLimitError,
  ValidationError,
} from '../../core/errors.js';
import { resetBucketsForTests } from '../../core/ratelimit.js';
import { NewsBatchSchema, SearchBatchSchema } from '../../schemas/news.js';
import { TavilyAdapter } from './adapter.js';

const here = dirname(fileURLToPath(import.meta.url));

function fixture<T = unknown>(name: string): T {
  return JSON.parse(readFileSync(join(here, 'fixtures', name), 'utf8')) as T;
}

const TEST_KEY = 'test-key-tavily-0123456789';

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

interface RecordedCall {
  url: URL;
  method: string | undefined;
  headers: Record<string, string>;
  body: Record<string, unknown> | undefined;
}

/** fetch mock returning a fixed response; records URL, method, headers, body. */
function mockFetch(
  body: unknown,
  status = 200,
  responseHeaders: Record<string, string> = {},
): { impl: typeof fetch; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const impl = (async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, key) => {
      headers[key] = value;
    });
    calls.push({
      url,
      method: init?.method,
      headers,
      body:
        typeof init?.body === 'string'
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : undefined,
    });
    return jsonResponse(body, status, responseHeaders);
  }) as typeof fetch;
  return { impl, calls };
}

/** Documented Tavily error envelope: { detail: { error } }. */
function errorEnvelope(message: string): unknown {
  return { detail: { error: message } };
}

beforeEach(() => {
  process.env.TAVILY_API_KEY = TEST_KEY;
  resetEnvCacheForTests();
  resetBucketsForTests();
});

afterEach(() => {
  delete process.env.TAVILY_API_KEY;
  resetEnvCacheForTests();
});

describe('TavilyAdapter.webSearch', () => {
  it('returns schema-valid SearchBatch; content -> snippet, score preserved', async () => {
    const { impl } = mockFetch(fixture('search_web.json'));
    const adapter = new TavilyAdapter({ fetchImpl: impl });
    const batch = await adapter.webSearch({ query: 'european central bank rate decision' });

    const parsed = SearchBatchSchema.parse(batch);
    expect(parsed.query).toBe('european central bank rate decision');
    expect(parsed.results).toHaveLength(2);
    expect(parsed.results[0]).toMatchObject({
      title: 'ECB keeps rates on hold as inflation cools',
      url: 'https://www.example-news.com/ecb-rates-hold',
      snippet:
        'The European Central Bank left its key deposit rate unchanged, saying inflation is moving toward its 2% target.',
      score: 0.97432,
    });
    // answer was NOT requested — it must not leak into the batch even
    // though the provider payload contains one.
    expect(parsed.syntheticAnswer).toBeUndefined();
    expect(parsed.lineage.some((s) => s.step === 'map_search_results')).toBe(true);
  });

  it('maps depth -> search_depth and includes include_answer only when requested', async () => {
    const { impl, calls } = mockFetch(fixture('search_web.json'));
    const adapter = new TavilyAdapter({ fetchImpl: impl });

    await adapter.webSearch({ query: 'ecb', depth: 'advanced', includeAnswer: true });
    expect(calls[0]?.body).toMatchObject({
      query: 'ecb',
      search_depth: 'advanced',
      include_answer: true,
    });

    await adapter.webSearch({ query: 'ecb' });
    // default depth is basic; include_answer omitted unless includeAnswer=true.
    expect(calls[1]?.body?.search_depth).toBe('basic');
    expect(calls[1]?.body).not.toHaveProperty('include_answer');
  });

  it('surfaces the LLM-generated answer as syntheticAnswer when requested', async () => {
    const { impl } = mockFetch(fixture('search_web.json'));
    const adapter = new TavilyAdapter({ fetchImpl: impl });
    const batch = await adapter.webSearch({ query: 'ecb', includeAnswer: true });

    expect(batch.syntheticAnswer).toBe(
      'The European Central Bank held its deposit facility rate steady at its most recent meeting, citing easing inflation pressures.',
    );
    expect(batch.lineage.some((s) => s.step === 'attach_synthetic_answer')).toBe(true);
  });

  it('POSTs to https://api.tavily.com/search with Bearer auth and clamps max_results to 20', async () => {
    const { impl, calls } = mockFetch(fixture('search_web.json'));
    const adapter = new TavilyAdapter({ fetchImpl: impl });
    await adapter.webSearch({ query: 'ecb', maxResults: 50 });

    const call = calls[0];
    expect(call?.url.toString()).toBe('https://api.tavily.com/search');
    expect(call?.method).toBe('POST');
    expect(call?.headers['authorization']).toBe(`Bearer ${TEST_KEY}`);
    expect(call?.headers['content-type']).toBe('application/json');
    // Documented max_results range is 0-20 — out-of-range input is clamped.
    expect(call?.body?.max_results).toBe(20);

    // Non-finite input is dropped entirely (never serialized as null).
    await adapter.webSearch({ query: 'ecb', maxResults: Number.NaN });
    expect(calls[1]?.body).not.toHaveProperty('max_results');
  });

  it('stamps realtime freshness (live web retrieval) and unverified quality truthfully', async () => {
    const { impl } = mockFetch(fixture('search_web.json'));
    const adapter = new TavilyAdapter({ fetchImpl: impl });
    const batch = await adapter.webSearch({ query: 'ecb' });

    expect(batch.source.provider).toBe('tavily');
    expect(batch.source.endpoint).toBe('/search');
    expect(batch.source.freshness).toBe('realtime');
    expect(batch.source.cacheHit).toBe(false);
    expect(Date.parse(batch.source.requestedAt)).toBeLessThanOrEqual(
      Date.parse(batch.source.receivedAt),
    );
    // Web-derived snippets need source vetting — never unlabeled.
    expect(batch.quality).toEqual(['unverified']);
  });
});

describe('TavilyAdapter.getNews', () => {
  it('returns schema-valid NewsBatch; id=url, publishedAt from published_date when parseable', async () => {
    const { impl } = mockFetch(fixture('search_news.json'));
    const adapter = new TavilyAdapter({ fetchImpl: impl });
    const batch = await adapter.getNews({ query: 'semiconductor export controls' });

    const parsed = NewsBatchSchema.parse(batch);
    expect(parsed.items).toHaveLength(3);
    expect(parsed.items[0]).toMatchObject({
      id: 'https://news.example.org/articles/chip-export-controls',
      url: 'https://news.example.org/articles/chip-export-controls',
      title: 'New export controls hit chipmakers',
      sourceDomain: 'news.example.org',
      description:
        'Regulators announced expanded semiconductor export controls affecting advanced node equipment.',
    });
    // RFC-1123 and ISO published_date variants both convert to UTC ISO-8601.
    expect(parsed.items[0]?.publishedAt).toBe('2026-07-15T08:30:00.000Z');
    expect(parsed.items[1]?.publishedAt).toBe('2026-07-16T14:05:00.000Z');
    // Absent published_date stays absent — no fabricated timestamps.
    expect(parsed.items[2]?.publishedAt).toBeUndefined();

    const steps = parsed.lineage.map((s) => s.step);
    expect(steps).toContain('build_news_query');
    expect(steps).toContain('map_results_to_news_items');
    expect(steps).toContain('parse_published_dates');
  });

  it('sends topic=news with normalized start_date/end_date and folds category into the query', async () => {
    const { impl, calls } = mockFetch(fixture('search_news.json'));
    const adapter = new TavilyAdapter({ fetchImpl: impl });
    await adapter.getNews({
      query: 'export controls',
      category: 'semiconductors',
      from: '2026-07-01T12:34:56Z',
      to: '2026-07-16T00:00:00Z',
      language: 'en',
      max: 99,
    });

    const body = calls[0]?.body;
    expect(body?.topic).toBe('news');
    expect(body?.query).toBe('semiconductors export controls');
    // from/to normalized to the documented YYYY-MM-DD format.
    expect(body?.start_date).toBe('2026-07-01');
    expect(body?.end_date).toBe('2026-07-16');
    expect(body?.max_results).toBe(20);
    // Tavily /search has no documented language parameter — never sent.
    expect(body).not.toHaveProperty('language');
    expect(body).not.toHaveProperty('category');
  });

  it('stamps quality ["incomplete"] — web-derived discovery, not a licensed feed', async () => {
    const { impl } = mockFetch(fixture('search_news.json'));
    const adapter = new TavilyAdapter({ fetchImpl: impl });
    const batch = await adapter.getNews({ query: 'chips' });

    expect(batch.quality).toEqual(['incomplete']);
    expect(batch.source.provider).toBe('tavily');
    expect(batch.source.endpoint).toBe('/search');
    expect(batch.source.freshness).toBe('realtime');
    expect(batch.source.cacheHit).toBe(false);
  });

  it('drops unparseable published_date values and counts them in lineage', async () => {
    const corrupted = structuredClone(
      fixture<{ results: Record<string, unknown>[] }>('search_news.json'),
    );
    // published_date's format is undocumented — a garbage value must be
    // dropped (no fabricated timestamp) and counted, not fail the batch.
    corrupted.results[0]!.published_date = 'not-a-real-date';
    const { impl } = mockFetch(corrupted);
    const adapter = new TavilyAdapter({ fetchImpl: impl });
    const batch = await adapter.getNews({ query: 'chips' });

    expect(batch.items[0]?.publishedAt).toBeUndefined();
    expect(batch.items[1]?.publishedAt).toBe('2026-07-16T14:05:00.000Z');
    const step = batch.lineage.find((s) => s.step === 'parse_published_dates');
    expect(step?.params?.unparseableDates).toBe(1);
    expect(step?.params?.withPublishedAt).toBe(1);
  });

  it('throws ValidationError without making a request when query and category are both absent', async () => {
    const { impl, calls } = mockFetch(fixture('search_news.json'));
    const adapter = new TavilyAdapter({ fetchImpl: impl });
    await expect(adapter.getNews({})).rejects.toBeInstanceOf(ValidationError);
    expect(calls).toHaveLength(0);
  });
});

describe('TavilyAdapter error mapping', () => {
  it('maps 429 to RateLimitError after bounded retries', async () => {
    const { impl, calls } = mockFetch(errorEnvelope('Too many requests.'), 429, {
      'retry-after': '0',
    });
    const adapter = new TavilyAdapter({ fetchImpl: impl });
    await expect(adapter.webSearch({ query: 'ecb' })).rejects.toBeInstanceOf(RateLimitError);
    // 1 initial attempt + 3 retries (HttpClient default), then it gives up.
    expect(calls).toHaveLength(4);
  }, 15_000);

  it('maps 401 to EntitlementError', async () => {
    const { impl } = mockFetch(errorEnvelope('Your API key is wrong or missing.'), 401);
    const adapter = new TavilyAdapter({ fetchImpl: impl });
    await expect(adapter.webSearch({ query: 'ecb' })).rejects.toBeInstanceOf(EntitlementError);
  });

  it('maps documented 432 (key/plan limit exceeded) to EntitlementError', async () => {
    const { impl } = mockFetch(errorEnvelope('Key limit or Plan Limit exceeded.'), 432);
    const adapter = new TavilyAdapter({ fetchImpl: impl });
    const err = await adapter.getNews({ query: 'chips' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EntitlementError);
    expect((err as EntitlementError).status).toBe(432);
    expect((err as EntitlementError).provider).toBe('tavily');
  });

  it('maps documented 433 (PayGo limit exceeded) to EntitlementError', async () => {
    const { impl } = mockFetch(errorEnvelope('PayGo limit exceeded.'), 433);
    const adapter = new TavilyAdapter({ fetchImpl: impl });
    await expect(adapter.webSearch({ query: 'ecb' })).rejects.toBeInstanceOf(EntitlementError);
  });

  it('maps the documented 400 error envelope to HttpError with status + provider', async () => {
    const { impl } = mockFetch(errorEnvelope('Your request is invalid.'), 400);
    const adapter = new TavilyAdapter({ fetchImpl: impl });
    const err = await adapter.webSearch({ query: 'ecb' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(400);
    expect((err as HttpError).provider).toBe('tavily');
  });
});

describe('TavilyAdapter configuration + health', () => {
  it('reports unconfigured without throwing when the env var is absent', async () => {
    delete process.env.TAVILY_API_KEY;
    resetEnvCacheForTests();
    const adapter = new TavilyAdapter();
    expect(adapter.isConfigured()).toBe(false);
    const health = await adapter.healthCheck();
    expect(health.configured).toBe(false);
    expect(health.live).toBeNull();
    expect(health.message).toContain('TAVILY_API_KEY');
  });

  it('live health check performs exactly one minimal-quota request (basic depth, 1 result)', async () => {
    // max_results: 1, not 0 — the live API 400s on 0 despite the documented
    // 0-20 range (observed 2026-07-17; recorded in the research record).
    const { impl, calls } = mockFetch(fixture('search_web.json'));
    const adapter = new TavilyAdapter({ fetchImpl: impl });
    const health = await adapter.healthCheck({ live: true });

    expect(health.configured).toBe(true);
    expect(health.live).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url.pathname).toBe('/search');
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.body?.search_depth).toBe('basic');
    expect(calls[0]?.body?.max_results).toBe(1);
  });
});
