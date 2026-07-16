import { providerFetchJson } from '@/helpers/ProviderHttp'
import type { WebExtractResponse, WebSearchResponse } from '@/types/WebSearch'
import {
  TavilyExtractResponseSchema,
  TavilySearchResponseSchema,
  WebExtractResponseSchema,
  WebSearchResponseSchema
} from '@/types/WebSearch'

// Direct Tavily API fallback for the /agent/web proxy. Responses are mapped
// into the exact proxy schemas so callers cannot tell which path answered.
// Auth: Authorization Bearer header. Limits: 100 requests/min on the dev tier;
// search costs 1 credit (basic depth), extract 1 credit per 5 URLs.

const TAVILY_BASE_URL = 'https://api.tavily.com'
const SEARCH_MAX_RESULTS = 8

type TavilyDirectParams = {
  readonly apiKey: string
  readonly query: string
}

type TavilyExtractParams = {
  readonly apiKey: string
  readonly url: string
}

export async function fetchTavilySearchDirect(
  params: TavilyDirectParams
): Promise<WebSearchResponse> {
  const data = await providerFetchJson({
    provider: 'tavily',
    url: new URL('/search', TAVILY_BASE_URL),
    method: 'POST',
    headers: { Authorization: `Bearer ${params.apiKey}` },
    jsonBody: {
      query: params.query,
      search_depth: 'basic',
      max_results: SEARCH_MAX_RESULTS
    },
    secrets: [params.apiKey]
  })
  const parsed = TavilySearchResponseSchema.parse(data)
  return WebSearchResponseSchema.parse({
    query: parsed.query,
    results: parsed.results.map((result) => ({
      title: result.title,
      url: result.url,
      content: result.content,
      publishedDate: result.published_date ?? null
    }))
  })
}

export async function fetchTavilyExtractDirect(
  params: TavilyExtractParams
): Promise<WebExtractResponse> {
  const data = await providerFetchJson({
    provider: 'tavily',
    url: new URL('/extract', TAVILY_BASE_URL),
    method: 'POST',
    headers: { Authorization: `Bearer ${params.apiKey}` },
    jsonBody: { urls: params.url },
    secrets: [params.apiKey]
  })
  const parsed = TavilyExtractResponseSchema.parse(data)
  const failed = parsed.failed_results?.[0]
  if (parsed.results.length === 0) {
    throw new Error(
      `tavily extract failed for ${params.url}${failed ? `: ${failed.error ?? 'unknown error'}` : ''}`
    )
  }
  return WebExtractResponseSchema.parse({
    url: params.url,
    results: parsed.results.map((result) => ({
      url: result.url,
      title: null,
      rawContent: result.raw_content
    }))
  })
}
