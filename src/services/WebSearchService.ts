import { fetchTavilyExtractDirect, fetchTavilySearchDirect } from '@/helpers/TavilyDirect'
import { fetchWebExtract, fetchWebSearch } from '@/helpers/WebSearch'
import type {
  WebExtractResponse,
  WebSearchResponse,
  WebSearchServiceParams
} from '@/types/WebSearch'

export class WebSearchService {
  private readonly apiBaseUrl: string
  private readonly apiBearerToken: string
  private readonly tavilyApiKey: string

  constructor(params: WebSearchServiceParams) {
    this.apiBaseUrl = params.apiBaseUrl
    this.apiBearerToken = params.apiBearerToken
    this.tavilyApiKey = params.tavilyApiKey
  }

  // Proxy first; direct Tavily fallback (same response shape) when the proxy
  // fails and TAVILY_API_KEY is configured.
  async search(query: string): Promise<WebSearchResponse> {
    try {
      return await fetchWebSearch({
        apiBaseUrl: this.apiBaseUrl,
        apiBearerToken: this.apiBearerToken,
        query
      })
    } catch (error: unknown) {
      if (this.tavilyApiKey.length === 0) {
        throw error
      }
      return fetchTavilySearchDirect({ apiKey: this.tavilyApiKey, query })
    }
  }

  async extract(url: string): Promise<WebExtractResponse> {
    try {
      return await fetchWebExtract({
        apiBaseUrl: this.apiBaseUrl,
        apiBearerToken: this.apiBearerToken,
        url
      })
    } catch (error: unknown) {
      if (this.tavilyApiKey.length === 0) {
        throw error
      }
      return fetchTavilyExtractDirect({ apiKey: this.tavilyApiKey, url })
    }
  }
}
