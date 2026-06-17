import { fetchAlphaScoutResponse } from '@/helpers/AlphaScout'
import type { AlphaScoutServiceParams, AskAlphaScoutCliOptions } from '@/types/AlphaScout'

export class AlphaScoutService {
  private readonly apiBaseUrl: string
  private readonly apiBearerToken: string

  constructor(params: AlphaScoutServiceParams) {
    this.apiBaseUrl = params.apiBaseUrl
    this.apiBearerToken = params.apiBearerToken
  }

  async ask(params: AskAlphaScoutCliOptions): Promise<string> {
    return await fetchAlphaScoutResponse({
      apiBaseUrl: this.apiBaseUrl,
      apiBearerToken: this.apiBearerToken,
      query: params.query
    })
  }
}
