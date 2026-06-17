import { type SearchItem, SearchItemSchema } from '@shared/types/Search'

interface TokenServiceParams {
  readonly apiBaseUrl: string
}

export class TokenService {
  private readonly apiBaseUrl: string

  constructor(params: TokenServiceParams) {
    this.apiBaseUrl = params.apiBaseUrl
  }

  async search(query: string): Promise<SearchItem[]> {
    const url = new URL('/search', this.apiBaseUrl)
    url.searchParams.set('query', query)
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`Failed to search tokens: ${response.status} ${response.statusText}`)
    }

    const data: unknown = await response.json()
    return SearchItemSchema.array().parse(data)
  }
}
