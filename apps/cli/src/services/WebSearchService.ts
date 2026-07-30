import { fetchWebExtract, fetchWebSearch } from '@/helpers/WebSearch'
import type {
  WebExtractResponse,
  WebSearchResponse,
  WebSearchServiceParams
} from '@/types/WebSearch'

export class WebSearchService {
  private readonly apiBaseUrl: string
  private readonly apiBearerToken: string

  constructor(params: WebSearchServiceParams) {
    this.apiBaseUrl = params.apiBaseUrl
    this.apiBearerToken = params.apiBearerToken
  }

  async search(query: string): Promise<WebSearchResponse> {
    return fetchWebSearch({
      apiBaseUrl: this.apiBaseUrl,
      apiBearerToken: this.apiBearerToken,
      query
    })
  }

  async extract(url: string): Promise<WebExtractResponse> {
    return fetchWebExtract({
      apiBaseUrl: this.apiBaseUrl,
      apiBearerToken: this.apiBearerToken,
      url
    })
  }
}
