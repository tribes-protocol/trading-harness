import { requireApiKey, type ProviderId } from '../../core/config.js';
import { EntitlementError, HttpError, ValidationError } from '../../core/errors.js';
import { HttpClient, type HttpResponse } from '../../core/http.js';
import { isoDateOnly, nowIso, toUtcIso } from '../../core/time.js';
import type { LineageStep } from '../../schemas/common.js';
import {
  NewsBatchSchema,
  SearchBatchSchema,
  type NewsBatch,
  type SearchBatch,
} from '../../schemas/news.js';
import { BaseAdapter } from '../base.js';
import type { NewsSource, ProviderMeta, WebSearchSource } from '../types.js';
import type { TavilySearchResponse, TavilySearchResult } from './types.js';

/**
 * Tavily adapter — live web search plus FALLBACK news discovery.
 *
 * Source of truth: docs/research/providers/tavily.json (official docs
 * https://docs.tavily.com). Single consumed endpoint: POST /search with
 * Bearer auth.
 *
 * TRUTH-IN-LABELING:
 *  - Tavily is NOT a market-data provider and NOT a licensed news feed.
 *    "real-time" means live web retrieval only — never exchange-grade data.
 *  - The optional `answer` field is LLM-generated; it is surfaced only as
 *    SearchBatch.syntheticAnswer (schema-documented as model output).
 *  - getNews() is web-derived news DISCOVERY (topic=news), stamped
 *    quality ["incomplete"] — it is a fallback behind licensed feeds.
 *
 * LICENSING: ToS prohibits sublicensing/reselling/redistributing the
 * Services; storage rights for retrieved third-party web content are not
 * explicitly granted — internal research use only, no persistent caching.
 */

const BASE_URL = 'https://api.tavily.com';
const SEARCH_PATH = '/search';

/** Documented max_results range on POST /search is 0-20. */
const MAX_RESULTS_CAP = 20;

/** Documented statuses for plan/credit exhaustion (mapped to EntitlementError). */
const PLAN_LIMIT_STATUS_MESSAGES: Record<number, string> = {
  432: 'key or plan limit exceeded',
  433: 'PayGo limit exceeded',
};

/**
 * Clamp a caller-supplied result count into the documented 0-20 range.
 * Non-finite values (NaN/Infinity) are treated as "not provided" so an
 * invalid number can never reach the request body (JSON.stringify would
 * serialize NaN as null, an undocumented value).
 */
function clampMaxResults(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(Math.trunc(value), MAX_RESULTS_CAP));
}

/**
 * Parse the (format-undocumented) news `published_date` defensively:
 * unparseable values are dropped rather than failing the whole batch.
 */
function parsePublishedDate(raw: string | undefined): string | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  try {
    return toUtcIso(raw);
  } catch {
    return undefined;
  }
}

/** Hostname of a result URL, when the URL parses. */
function domainOf(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

export class TavilyAdapter extends BaseAdapter implements WebSearchSource, NewsSource {
  readonly id: ProviderId = 'tavily';

  readonly meta: ProviderMeta = {
    id: 'tavily',
    name: 'Tavily',
    docsUrl: 'https://docs.tavily.com',
    docsReviewDate: '2026-07-17',
    apiVersion: "unversioned (dated changelog; 'fast'/'ultra-fast' depths in beta)",
    envVar: 'TAVILY_API_KEY',
  };

  private http: HttpClient | undefined;

  constructor(private readonly opts: { fetchImpl?: typeof fetch } = {}) {
    super();
  }

  /**
   * Build the HttpClient lazily so importing/constructing the adapter never
   * reads credentials. Auth is the documented Bearer header. Rate limit is
   * conservative against the documented Development-plan limit of 100 RPM
   * on standard endpoints: 1.5 req/s sustained (90 RPM) with a small burst.
   */
  private client(): HttpClient {
    if (this.http === undefined) {
      this.http = new HttpClient({
        provider: 'tavily',
        baseUrl: BASE_URL,
        defaultHeaders: { authorization: `Bearer ${requireApiKey('tavily')}` },
        rateLimit: { capacity: 4, refillPerSecond: 1.5 },
        ...(this.opts.fetchImpl !== undefined ? { fetchImpl: this.opts.fetchImpl } : {}),
      });
    }
    return this.http;
  }

  /**
   * POST /search with Tavily-specific error mapping: the documented 432
   * (key/plan limit) and 433 (PayGo limit) statuses are plan-entitlement
   * exhaustion, not generic HTTP failures.
   */
  private async search(body: Record<string, unknown>): Promise<HttpResponse<TavilySearchResponse>> {
    try {
      return await this.client().postJson<TavilySearchResponse>(SEARCH_PATH, body);
    } catch (error) {
      if (error instanceof HttpError && error.status !== undefined) {
        const planMessage = PLAN_LIMIT_STATUS_MESSAGES[error.status];
        if (planMessage !== undefined) {
          throw new EntitlementError(
            this.id,
            `${error.status} ${planMessage} at ${SEARCH_PATH} — check plan credits/PAYGO settings`,
            { endpoint: SEARCH_PATH, status: error.status, cause: error },
          );
        }
      }
      throw error;
    }
  }

  /**
   * Exactly one minimal-quota documented request: a basic-depth search
   * (1 credit) with max_results=0 (documented range 0-20).
   */
  protected async liveProbe(): Promise<void> {
    // Docs record max_results range as 0-20, but the live API returns 400
    // for 0 (observed 2026-07-17) — use the smallest accepted value.
    await this.search({ query: 'tavily api status', search_depth: 'basic', max_results: 1 });
  }

  /**
   * Live web search via POST /search. `depth` maps to the documented
   * `search_depth` (basic = 1 credit, advanced = 2 credits); the
   * LLM-generated `answer` is requested only when includeAnswer=true and
   * surfaced as syntheticAnswer.
   */
  async webSearch(params: {
    query: string;
    maxResults?: number;
    depth?: 'basic' | 'advanced';
    includeAnswer?: boolean;
  }): Promise<SearchBatch> {
    const depth = params.depth ?? 'basic';
    const maxResults = clampMaxResults(params.maxResults);
    const includeAnswer = params.includeAnswer === true;

    const res = await this.search({
      query: params.query,
      search_depth: depth,
      ...(maxResults !== undefined ? { max_results: maxResults } : {}),
      ...(includeAnswer ? { include_answer: true } : {}),
    });

    const results = res.data.results.map((item) => ({
      title: item.title,
      url: item.url,
      snippet: item.content,
      score: item.score,
    }));

    const lineage: LineageStep[] = [
      {
        step: 'map_search_results',
        description:
          'Mapped Tavily results[] fields onto SearchResult: content (snippet/chunk text) -> ' +
          'snippet, relevance score preserved; depth option mapped to documented search_depth.',
        at: nowIso(),
        params: { searchDepth: depth, resultCount: results.length },
      },
      ...(includeAnswer && res.data.answer !== undefined
        ? [
            {
              step: 'attach_synthetic_answer',
              description:
                'Attached the Tavily `answer` field as syntheticAnswer. It is LLM-GENERATED ' +
                'synthesized content (hallucination risk), not a primary source.',
              at: nowIso(),
            },
          ]
        : []),
    ];

    // Registry search.web: freshness "realtime" = live web retrieval, NOT
    // exchange-grade real-time data. Web-derived snippets require source
    // vetting before institutional use -> quality ["unverified"].
    return SearchBatchSchema.parse({
      query: res.data.query,
      results,
      ...(includeAnswer && res.data.answer !== undefined
        ? { syntheticAnswer: res.data.answer }
        : {}),
      source: {
        provider: this.id,
        endpoint: SEARCH_PATH,
        apiVersion: 'unversioned',
        requestedAt: res.requestedAt,
        receivedAt: res.receivedAt,
        cacheHit: false,
        freshness: 'realtime',
      },
      quality: ['unverified'],
      lineage,
    });
  }

  /**
   * FALLBACK news discovery via POST /search with topic="news" and the
   * documented start_date/end_date filters. This is web-derived discovery,
   * not a licensed news feed — every batch is stamped quality
   * ["incomplete"]. `language` has no documented Tavily equivalent and is
   * ignored (recorded in lineage); `category` is folded into the free-text
   * query because /search has no category filter.
   */
  async getNews(params: {
    query?: string;
    from?: string;
    to?: string;
    language?: string;
    category?: string;
    max?: number;
  }): Promise<NewsBatch> {
    const queryText = [params.category, params.query]
      .filter((part): part is string => part !== undefined && part.trim() !== '')
      .join(' ');
    if (queryText === '') {
      throw new ValidationError(
        'tavily: getNews requires `query` and/or `category` — POST /search has a required query parameter',
      );
    }

    const startDate = params.from !== undefined ? isoDateOnly(params.from) : undefined;
    const endDate = params.to !== undefined ? isoDateOnly(params.to) : undefined;
    const maxResults = clampMaxResults(params.max);

    const res = await this.search({
      query: queryText,
      topic: 'news',
      ...(startDate !== undefined ? { start_date: startDate } : {}),
      ...(endDate !== undefined ? { end_date: endDate } : {}),
      ...(maxResults !== undefined ? { max_results: maxResults } : {}),
    });

    let unparseableDates = 0;
    const items = res.data.results.map((item: TavilySearchResult) => {
      const publishedAt = parsePublishedDate(item.published_date);
      if (item.published_date !== undefined && publishedAt === undefined) unparseableDates += 1;
      const sourceDomain = domainOf(item.url);
      return {
        // No provider-native article id — the URL is the identifier.
        id: item.url,
        title: item.title,
        url: item.url,
        ...(sourceDomain !== undefined ? { sourceDomain } : {}),
        ...(publishedAt !== undefined ? { publishedAt } : {}),
        description: item.content,
      };
    });

    const lineage: LineageStep[] = [
      {
        step: 'build_news_query',
        description:
          'Built the Tavily free-text query from category + query (no category filter exists ' +
          'on /search); `language` has no documented Tavily parameter and was ignored.',
        at: nowIso(),
        params: {
          queryText,
          topic: 'news',
          ...(params.language !== undefined ? { ignoredParams: ['language'] } : {}),
        },
      },
      ...(startDate !== undefined || endDate !== undefined
        ? [
            {
              step: 'normalize_date_filters',
              description:
                'Normalized from/to onto the documented YYYY-MM-DD start_date/end_date filters (UTC).',
              at: nowIso(),
              params: {
                ...(startDate !== undefined ? { startDate } : {}),
                ...(endDate !== undefined ? { endDate } : {}),
              },
            },
          ]
        : []),
      {
        step: 'map_results_to_news_items',
        description:
          'Mapped Tavily news-topic results[] onto NewsItem: id = url (no provider-native ' +
          'article id), content -> description, sourceDomain derived from the URL hostname.',
        at: nowIso(),
        params: { itemCount: items.length },
      },
      {
        step: 'parse_published_dates',
        description:
          'Converted published_date (format undocumented; topic=news only) to UTC ISO-8601 ' +
          'publishedAt; unparseable or absent dates are omitted rather than failing the batch.',
        at: nowIso(),
        params: {
          withPublishedAt: items.filter((i) => 'publishedAt' in i).length,
          unparseableDates,
        },
      },
    ];

    // Registry news.search: freshness "realtime" = live web retrieval.
    // Quality ["incomplete"]: web-derived discovery over an index with no
    // documented coverage/depth guarantee — NOT a licensed news feed.
    return NewsBatchSchema.parse({
      query: {
        query: queryText,
        topic: 'news',
        ...(params.from !== undefined ? { from: params.from } : {}),
        ...(params.to !== undefined ? { to: params.to } : {}),
        ...(params.category !== undefined ? { category: params.category } : {}),
        ...(params.max !== undefined ? { max: params.max } : {}),
      },
      items,
      source: {
        provider: this.id,
        endpoint: SEARCH_PATH,
        apiVersion: 'unversioned',
        requestedAt: res.requestedAt,
        receivedAt: res.receivedAt,
        cacheHit: false,
        freshness: 'realtime',
      },
      quality: ['incomplete'],
      lineage,
    });
  }
}
