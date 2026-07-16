import { cachedProviderJson } from '@/helpers/ProviderCache'
import { providerFetchJson, redactSecrets } from '@/helpers/ProviderHttp'
import type {
  NewsDataIoHeadline,
  NewsDataIoHeadlines,
  NewsDataIoRawArticle,
  NewsDataIoSentiment,
  NewsDataIoSuccessResponse
} from '@/types/NewsDataIo'
import {
  NewsDataIoHeadlinesSchema,
  NewsDataIoResponseSchema,
  NewsDataIoSentimentSchema
} from '@/types/NewsDataIo'
import { isNullish } from '@/utils/Lang'

// Direct NewsData.io integration (`news headlines`): raw market headlines from
// /api/1/latest, or /api/1/crypto when coin filters are given.
// Auth: `apikey` QUERY PARAM — the key lands in the request URL, so it is always
// passed to providerFetchJson as a secret for redaction and cache keys are built
// only from the logical filters, never from the URL.
// Free-tier plan-gated fields arrive as placeholder strings ("ONLY AVAILABLE
// ..."); normalization coerces them to null / empty arrays.
// Timestamps: pub_date keeps the provider's 'YYYY-MM-DD HH:MM:SS' wall-clock
// string with the zone named by pub_date_tz (typically 'UTC').
// Limits: credit-based (free 200 credits/day, 30 per 15 minutes); responses
// cached 5 minutes per full filter set including the page token.

const NEWSDATAIO_BASE_URL = 'https://newsdata.io'
const LATEST_PATH = '/api/1/latest'
const CRYPTO_PATH = '/api/1/crypto'
const HEADLINES_CACHE_TTL_MS = 5 * 60 * 1000
const PLAN_GATED_PLACEHOLDER_PREFIX = 'ONLY AVAILABLE'

type NewsDataIoServiceParams = {
  readonly apiKey: string
}

type GetHeadlinesParams = {
  readonly query: string | null
  readonly coins: readonly string[]
  readonly categories: readonly string[]
  readonly countries: readonly string[]
  readonly languages: readonly string[]
  readonly timeframeHours: number | null
  readonly size: number
  readonly page: string | null
}

export class NewsDataIoService {
  private readonly apiKey: string

  constructor(params: NewsDataIoServiceParams) {
    this.apiKey = params.apiKey
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0
  }

  private ensureConfigured(): void {
    if (!this.isConfigured()) {
      throw new Error('NEWSDATAIO_API_KEY is not set; direct NewsData.io headlines are disabled')
    }
  }

  // Latest headlines (or crypto-coin headlines when coins are given), with
  // duplicates removed by the provider and plan-gated placeholders normalized.
  async getHeadlines(params: GetHeadlinesParams): Promise<NewsDataIoHeadlines> {
    this.ensureConfigured()
    const useCryptoEndpoint = params.coins.length > 0
    if (useCryptoEndpoint && (params.categories.length > 0 || params.countries.length > 0)) {
      throw new Error(
        '--category/--country cannot be combined with --coin: the NewsData.io crypto endpoint does not support them'
      )
    }
    if (!useCryptoEndpoint && isNullish(params.query) && params.categories.length === 0) {
      throw new Error('provide at least one of --query, --coin, or --category')
    }
    const path = useCryptoEndpoint ? CRYPTO_PATH : LATEST_PATH
    const cacheKey = [
      'newsdataio:headlines',
      path,
      `q=${params.query ?? ''}`,
      `coin=${params.coins.join(',')}`,
      `category=${params.categories.join(',')}`,
      `country=${params.countries.join(',')}`,
      `language=${params.languages.join(',')}`,
      `timeframe=${params.timeframeHours ?? ''}`,
      `size=${params.size}`,
      `page=${params.page ?? ''}`
    ].join(':')
    const data = await cachedProviderJson({
      cacheKey,
      ttlMs: HEADLINES_CACHE_TTL_MS,
      fetchFn: async () => {
        const url = new URL(path, NEWSDATAIO_BASE_URL)
        url.searchParams.set('apikey', this.apiKey)
        url.searchParams.set('removeduplicate', '1')
        url.searchParams.set('size', String(params.size))
        setListParam(url, 'language', params.languages)
        if (!isNullish(params.query)) {
          url.searchParams.set('q', params.query)
        }
        if (useCryptoEndpoint) {
          setListParam(url, 'coin', params.coins)
        } else {
          setListParam(url, 'category', params.categories)
          setListParam(url, 'country', params.countries)
        }
        if (!isNullish(params.timeframeHours)) {
          url.searchParams.set('timeframe', String(params.timeframeHours))
        }
        if (!isNullish(params.page)) {
          url.searchParams.set('page', params.page)
        }
        return providerFetchJson({
          provider: 'newsdataio',
          url,
          secrets: [this.apiKey]
        })
      }
    })
    const parsed = NewsDataIoResponseSchema.parse(data)
    switch (parsed.status) {
      case 'error': {
        // Defensive: the provider normally pairs this envelope with a non-2xx
        // status (already thrown inside providerFetchJson), but never trust a
        // 200 blindly. Redact in case the provider echoes the request URL.
        const message = parsed.results?.message ?? 'unknown error'
        const code = parsed.results?.code ?? 'Unknown'
        throw new Error(
          `newsdataio returned an error envelope: ${code} ${redactSecrets(message, [this.apiKey])}`
        )
      }
      case 'success': {
        return normalizeHeadlines(parsed)
      }
    }
  }
}

function normalizeHeadlines(response: NewsDataIoSuccessResponse): NewsDataIoHeadlines {
  const items = (response.results ?? []).map(normalizeArticle)
  return NewsDataIoHeadlinesSchema.parse({
    source: 'newsdataio',
    total_results: response.totalResults ?? items.length,
    next_page: response.nextPage ?? null,
    items
  })
}

function normalizeArticle(article: NewsDataIoRawArticle): NewsDataIoHeadline {
  return {
    article_id: article.article_id,
    title: article.title,
    link: article.link,
    description: normalizePlanGated(article.description),
    pub_date: article.pubDate,
    pub_date_tz: normalizePlanGated(article.pubDateTZ),
    source_id: normalizePlanGated(article.source_id),
    source_name: normalizePlanGated(article.source_name),
    language: normalizePlanGated(article.language),
    countries: normalizeStringList(article.country),
    categories: normalizeStringList(article.category),
    sentiment: normalizeSentiment(article.sentiment)
  }
}

// Plan-gated fields arrive as placeholder strings like "ONLY AVAILABLE IN PAID
// PLANS" instead of being omitted; treat any such value as absent.
function normalizePlanGated(value: string | null | undefined): string | null {
  if (isNullish(value) || value.startsWith(PLAN_GATED_PLACEHOLDER_PREFIX)) {
    return null
  }
  return value
}

// Array-typed provider fields can also arrive as a single plan-gated
// placeholder string; coerce to a clean string array either way.
function normalizeStringList(value: readonly string[] | string | null | undefined): string[] {
  if (isNullish(value)) {
    return []
  }
  const values = typeof value === 'string' ? [value] : value
  return values.filter((item) => !item.startsWith(PLAN_GATED_PLACEHOLDER_PREFIX))
}

function normalizeSentiment(value: string | null | undefined): NewsDataIoSentiment | null {
  const parsed = NewsDataIoSentimentSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

function setListParam(url: URL, name: string, values: readonly string[]): void {
  if (values.length > 0) {
    url.searchParams.set(name, values.join(','))
  }
}
