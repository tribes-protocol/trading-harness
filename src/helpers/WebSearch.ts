import {
  type FetchWebExtractParams,
  type FetchWebSearchParams,
  type WebExtractResponse,
  WebExtractResponseSchema,
  type WebSearchResponse,
  WebSearchResponseSchema
} from '@/types/WebSearch'

const SEARCH_PATH = '/agent/web/search'
const EXTRACT_PATH = '/agent/web/extract'

export async function fetchWebSearch(params: FetchWebSearchParams): Promise<WebSearchResponse> {
  const requestUrl = new URL(SEARCH_PATH, params.apiBaseUrl)
  requestUrl.searchParams.set('q', params.query)
  const data = await postJson(requestUrl, params.apiBearerToken)
  return WebSearchResponseSchema.parse(data)
}

export async function fetchWebExtract(params: FetchWebExtractParams): Promise<WebExtractResponse> {
  const requestUrl = new URL(EXTRACT_PATH, params.apiBaseUrl)
  requestUrl.searchParams.set('url', params.url)
  const data = await postJson(requestUrl, params.apiBearerToken)
  return WebExtractResponseSchema.parse(data)
}

async function postJson(requestUrl: URL, apiBearerToken: string): Promise<unknown> {
  const response = await fetch(requestUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${apiBearerToken}`
    }
  })

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '')
    throw new Error(`Web request failed: ${response.status} ${response.statusText} ${bodyText}`)
  }

  const json: unknown = await response.json()
  return json
}
