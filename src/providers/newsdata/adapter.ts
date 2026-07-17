import { requireApiKey, type ProviderId } from '../../core/config.js';
import { EntitlementError, HttpError, ProviderError, ValidationError } from '../../core/errors.js';
import { HttpClient, type HttpResponse, type QueryValue } from '../../core/http.js';
import { collect, paginateCursor } from '../../core/pagination.js';
import { nowIso, toUtcIso } from '../../core/time.js';
import type { LineageStep } from '../../schemas/common.js';
import { NewsBatchSchema, type NewsBatch, type NewsItem } from '../../schemas/news.js';
import { BaseAdapter } from '../base.js';
import type { NewsSource, ProviderMeta } from '../types.js';
import type { NewsDataArticle, NewsDataErrorEnvelope, NewsDataNewsResponse } from './types.js';

/**
 * NewsData.io adapter — multi-geography news (NEWS ONLY: no prices, quotes,
 * or reference data).
 *
 * Source of truth: docs/research/providers/newsdata.json (official docs
 * https://newsdata.io/documentation, spec https://newsdata.io/openapi.json).
 *
 * Endpoints consumed:
 *  - GET /1/latest  — rolling 48-hour window (1 credit/page)
 *  - GET /1/archive — when from/to is supplied; look-back depth is
 *    plan-gated (Basic 6mo / Professional 2y / Corporate 10y) and each page
 *    costs 5 credits
 *
 * FRESHNESS (CRITICAL): free-tier articles are delayed 12 hours and the
 * vendor's Terms do not guarantee real-time delivery even on paid plans, so
 * every batch is stamped freshness "delayed" (/latest; "historical" for
 * /archive per the registry) with quality ["delayed"] — never "realtime".
 */

const BASE_URL = 'https://newsdata.io/api/1';

/** Documented latest/archive endpoint paths (relative to BASE_URL). */
const LATEST_PATH = '/latest';
const ARCHIVE_PATH = '/archive';

/** Default article cap when the caller does not pass `max`. */
const DEFAULT_MAX_ARTICLES = 50;

/** Hard cap on returned articles regardless of `max`. */
const MAX_ARTICLES_CAP = 10_000;

/**
 * `size` (page size) is 1-10 on the free plan and 1-50 on paid plans; the
 * adapter only sends `size` when the cap fits the free-plan range so the
 * parameter is valid on every plan. Otherwise `size` is omitted and the
 * provider defaults to the plan maximum.
 */
const FREE_PLAN_MAX_PAGE_SIZE = 10;

/** Documented vendor sentiment labels (plan-gated AI field). */
const SENTIMENT_LABELS = new Set(['positive', 'negative', 'neutral']);

/**
 * pubDate arrives as "YYYY-MM-DD HH:MM:SS" rendered in the timezone named
 * by pubDateTZ. This adapter never sends the `timezone` request parameter,
 * so per the docs the payload timezone is UTC. If a payload nevertheless
 * declares a non-UTC pubDateTZ — or the value does not parse — publishedAt
 * is omitted rather than guessed.
 */
function pubDateToUtcIso(
  pubDate: string | null | undefined,
  pubDateTZ: string | null | undefined,
): string | undefined {
  if (pubDate === null || pubDate === undefined || pubDate.trim() === '') return undefined;
  if (pubDateTZ !== null && pubDateTZ !== undefined && pubDateTZ.toUpperCase() !== 'UTC') {
    return undefined;
  }
  let normalized = pubDate.trim().replace(' ', 'T');
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/.test(normalized)) normalized = `${normalized}Z`;
  try {
    return toUtcIso(normalized);
  } catch {
    return undefined;
  }
}

/** Vendor 3-way sentiment → platform sentiment (always a model estimate). */
function mapVendorSentiment(raw: string | null | undefined): NewsItem['sentiment'] | undefined {
  if (raw === null || raw === undefined || !SENTIMENT_LABELS.has(raw)) return undefined;
  return {
    label: raw as 'positive' | 'negative' | 'neutral',
    method: 'provider_model',
    evidenceType: 'model_estimate',
  };
}

/** Hostname of the documented source_url field (e.g. "www.reuters.com"). */
function domainFromSourceUrl(sourceUrl: string | null | undefined): string | undefined {
  if (sourceUrl === null || sourceUrl === undefined) return undefined;
  try {
    return new URL(sourceUrl).hostname;
  } catch {
    return undefined;
  }
}

export class NewsDataAdapter extends BaseAdapter implements NewsSource {
  readonly id: ProviderId = 'newsdata';

  readonly meta: ProviderMeta = {
    id: 'newsdata',
    name: 'NewsData.io',
    docsUrl: 'https://newsdata.io/documentation',
    docsReviewDate: '2026-07-17',
    apiVersion: 'path v1 (/api/1/)',
    envVar: 'NEWSDATA_API_KEY',
  };

  private http: HttpClient | undefined;

  constructor(private readonly opts: { fetchImpl?: typeof fetch } = {}) {
    super();
  }

  /**
   * Build the HttpClient lazily so importing/constructing the adapter never
   * reads credentials. Auth is the documented X-ACCESS-KEY header (preferred
   * over the `apikey` query parameter so the key never appears in URLs).
   * Documented short-window limits are 30 credits/15min (free) and 1,800
   * credits/15min (paid, = 2/s sustained); the adapter self-throttles
   * conservatively at 1 request/second (burst 5) and backs off on 429.
   */
  private client(): HttpClient {
    if (this.http === undefined) {
      this.http = new HttpClient({
        provider: 'newsdata',
        baseUrl: BASE_URL,
        defaultHeaders: { 'X-ACCESS-KEY': requireApiKey('newsdata') },
        rateLimit: { capacity: 5, refillPerSecond: 1 },
        ...(this.opts.fetchImpl !== undefined ? { fetchImpl: this.opts.fetchImpl } : {}),
      });
    }
    return this.http;
  }

  /** Exactly one minimal-quota documented request (1 credit, 1 article). */
  protected async liveProbe(): Promise<void> {
    await this.client().getJson<NewsDataNewsResponse>(LATEST_PATH, { size: 1 });
  }

  /**
   * Fetch news articles.
   *
   * Routing (per docs): no from/to → GET /1/latest (rolling 48h window);
   * from/to supplied → GET /1/archive (plan-gated depth, 5 credits/page).
   * `max` is honored by walking the documented nextPage→page cursor via
   * paginateCursor up to the cap (default 50, hard cap 10,000).
   */
  async getNews(params: {
    query?: string;
    from?: string;
    to?: string;
    language?: string;
    category?: string;
    max?: number;
  }): Promise<NewsBatch> {
    const isArchive = params.from !== undefined || params.to !== undefined;
    const path = isArchive ? ARCHIVE_PATH : LATEST_PATH;
    const endpoint = `/api/1${path}`;

    if (isArchive && params.query === undefined && params.language === undefined && params.category === undefined) {
      // Documented: /1/archive requires at least one content filter
      // (q, country, category, language, domain, ...) beside the dates.
      throw new ValidationError(
        'newsdata: /1/archive requires at least one filter (query, language, or category) in addition to from/to',
        { details: { params: { from: params.from ?? null, to: params.to ?? null } } },
      );
    }

    const effectiveMax =
      params.max !== undefined
        ? Math.max(1, Math.min(Math.trunc(params.max), MAX_ARTICLES_CAP))
        : DEFAULT_MAX_ARTICLES;
    const size = effectiveMax <= FREE_PLAN_MAX_PAGE_SIZE ? effectiveMax : undefined;

    const baseQuery: Record<string, QueryValue> = {
      ...(params.query !== undefined ? { q: params.query } : {}),
      ...(params.language !== undefined ? { language: params.language } : {}),
      ...(params.category !== undefined ? { category: params.category } : {}),
      ...(isArchive && params.from !== undefined ? { from_date: params.from } : {}),
      ...(isArchive && params.to !== undefined ? { to_date: params.to } : {}),
      ...(size !== undefined ? { size } : {}),
    };

    const pages: HttpResponse<NewsDataNewsResponse>[] = [];
    const fetchPage = async (
      cursor: string | undefined,
    ): Promise<{ items: NewsDataArticle[]; nextCursor: string | undefined }> => {
      const res = await this.client().getJson<NewsDataNewsResponse>(path, {
        ...baseQuery,
        ...(cursor !== undefined ? { page: cursor } : {}),
      });
      if (res.data.status !== 'success') {
        // Defensive: documented error envelope carried on a 2xx transport.
        // Per the spec, `results` is a detail object OR an array of
        // InvalidFilterDetail objects — report the first detail either way.
        const envelope = res.data as unknown as Partial<NewsDataErrorEnvelope>;
        const detail = Array.isArray(envelope.results) ? envelope.results[0] : envelope.results;
        throw new ProviderError(
          'newsdata',
          `error envelope from ${endpoint}: ${detail?.code ?? 'unknown code'} — ${detail?.message ?? 'no message'}`,
          { endpoint, status: res.status },
        );
      }
      pages.push(res);
      return { items: res.data.results, nextCursor: res.data.nextPage ?? undefined };
    };

    let rawArticles: NewsDataArticle[];
    try {
      rawArticles = await collect(
        paginateCursor<NewsDataArticle, string>(fetchPage, {
          maxItems: effectiveMax,
          // maxItems must be the binding cap: derive the page budget from
          // the worst documented page size (free plan: 10/page) so the
          // default maxPages=100 can never silently truncate a large max.
          maxPages: Math.ceil(effectiveMax / FREE_PLAN_MAX_PAGE_SIZE) + 1,
        }),
      );
    } catch (error) {
      if (isArchive) throw this.mapArchiveError(error);
      throw error;
    }

    const firstPage = pages[0];
    const lastPage = pages[pages.length - 1];
    if (firstPage === undefined || lastPage === undefined) {
      throw new ProviderError('newsdata', `no response pages collected from ${endpoint}`, {
        endpoint,
      });
    }

    let publishedAtConverted = 0;
    let publishedAtSkipped = 0;
    let sentimentMapped = 0;
    let incompleteSkipped = 0;
    const items: NewsItem[] = [];
    for (const article of rawArticles) {
      // Only article_id is required in the official Article schema; title and
      // link are nullable. Articles missing any of the platform's required
      // core fields are skipped (and counted in lineage) — never fabricated.
      if (
        !article.article_id ||
        article.title === null ||
        article.title === undefined ||
        article.title === '' ||
        article.link === null ||
        article.link === undefined ||
        article.link === ''
      ) {
        incompleteSkipped += 1;
        continue;
      }
      const publishedAt = pubDateToUtcIso(article.pubDate, article.pubDateTZ);
      if (publishedAt !== undefined) publishedAtConverted += 1;
      else publishedAtSkipped += 1;
      const sentiment = mapVendorSentiment(article.sentiment);
      if (sentiment !== undefined) sentimentMapped += 1;
      const sourceDomain = domainFromSourceUrl(article.source_url);
      items.push({
        // Provider-native article id preserved verbatim — never join on titles/URLs.
        id: article.article_id,
        title: article.title,
        url: article.link,
        ...(article.source_name !== null && article.source_name !== undefined
          ? { sourceName: article.source_name }
          : {}),
        ...(sourceDomain !== undefined ? { sourceDomain } : {}),
        ...(publishedAt !== undefined ? { publishedAt } : {}),
        ...(article.language !== null && article.language !== undefined
          ? { language: article.language }
          : {}),
        categories: article.category ?? [],
        // /1/latest and /1/archive articles carry no ticker tags (those live
        // on /1/crypto `coin` and /1/market `symbol`, not consumed here).
        taggedInstruments: [],
        ...(article.description !== null && article.description !== undefined
          ? { description: article.description }
          : {}),
        ...(sentiment !== undefined ? { sentiment } : {}),
      });
    }

    const lineage: LineageStep[] = [
      {
        step: 'paginate_next_page',
        description:
          'Walked the documented nextPage→page opaque-cursor pagination, capped at the requested max articles.',
        at: nowIso(),
        params: {
          pagesFetched: pages.length,
          maxItems: effectiveMax,
          ...(size !== undefined ? { size } : {}),
        },
      },
      {
        step: 'map_article_fields',
        description:
          'Mapped NewsData article fields to NewsItem: article_id→id (provider-native id preserved verbatim), ' +
          'link→url, source_name→sourceName, source_url hostname→sourceDomain, category[]→categories. ' +
          'Articles missing article_id/title/link (nullable per the official schema) are skipped, never fabricated.',
        at: nowIso(),
        params: {
          articleCount: items.length,
          ...(incompleteSkipped > 0 ? { skippedIncomplete: incompleteSkipped } : {}),
        },
      },
      {
        step: 'convert_pubdate_timestamp',
        description:
          'Converted pubDate ("YYYY-MM-DD HH:MM:SS", UTC per docs since no timezone request param is sent; ' +
          'pubDateTZ echoes the payload zone) to publishedAt UTC ISO-8601. Articles declaring a non-UTC ' +
          'pubDateTZ omit publishedAt rather than guess.',
        at: nowIso(),
        params: { converted: publishedAtConverted, omitted: publishedAtSkipped },
      },
      ...(sentimentMapped > 0
        ? [
            {
              step: 'map_vendor_sentiment',
              description:
                'Mapped vendor 3-way sentiment label (plan-gated NewsData AI field, no documented accuracy ' +
                'metrics) to sentiment{method:"provider_model", evidenceType:"model_estimate"} — model output, ' +
                'not observed fact.',
              at: nowIso(),
              params: { mapped: sentimentMapped },
            },
          ]
        : []),
    ];

    // Registry: news.latest freshness is "delayed" (free tier delays 12h and
    // the Terms do not guarantee real-time even on paid plans); news.archive
    // is "historical". Both truthfully carry the "delayed" quality flag —
    // NewsData output must never be presented as real-time.
    return NewsBatchSchema.parse({
      query: {
        endpoint,
        ...(params.query !== undefined ? { q: params.query } : {}),
        ...(params.language !== undefined ? { language: params.language } : {}),
        ...(params.category !== undefined ? { category: params.category } : {}),
        ...(params.from !== undefined ? { from: params.from } : {}),
        ...(params.to !== undefined ? { to: params.to } : {}),
        max: effectiveMax,
      },
      items,
      ...(firstPage.data.totalResults !== undefined
        ? { totalAvailable: firstPage.data.totalResults }
        : {}),
      source: {
        provider: this.id,
        endpoint,
        apiVersion: '1',
        requestedAt: firstPage.requestedAt,
        receivedAt: lastPage.receivedAt,
        cacheHit: false,
        freshness: isArchive ? 'historical' : 'delayed',
      },
      quality: ['delayed'],
      lineage,
    });
  }

  /**
   * /1/archive access and look-back depth are plan-gated; the API signals
   * this with 403 (AccessDenied — plan lacks the endpoint/parameter) or 422
   * (UnsupportedFilter/UnsupportedDateFormat — e.g. dates beyond the plan's
   * archive depth). Both map to EntitlementError with an actionable message.
   * 401 (missing/invalid key) is deliberately NOT rewrapped — it keeps the
   * shared client's "check API key" guidance instead of plan guidance.
   */
  private mapArchiveError(error: unknown): unknown {
    const status =
      error instanceof HttpError || error instanceof EntitlementError ? error.status : undefined;
    if (status !== 403 && status !== 422) return error;
    return new EntitlementError(
      'newsdata',
      `archive request rejected (HTTP ${status}) — /1/archive access and look-back depth are ` +
        'plan-gated (no free-tier access; Basic 6 months, Professional 2 years, Corporate 10 years). ' +
        'Check the requested from/to range against the plan entitlements.',
      {
        endpoint: '/api/1/archive',
        status,
        cause: error,
      },
    );
  }
}
