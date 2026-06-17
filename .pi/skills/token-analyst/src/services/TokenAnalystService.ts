import { fetchTokenAnalystResponse } from '@/helpers/TokenAnalyst'
import type { AskTokenAnalystCliOptions, TokenAnalystServiceParams } from '@/types/TokenAnalyst'

export class TokenAnalystService {
  private readonly apiBaseUrl: string
  private readonly apiBearerToken: string

  constructor(params: TokenAnalystServiceParams) {
    this.apiBaseUrl = params.apiBaseUrl
    this.apiBearerToken = params.apiBearerToken
  }

  async ask(params: AskTokenAnalystCliOptions): Promise<string> {
    return await fetchTokenAnalystResponse({
      apiBaseUrl: this.apiBaseUrl,
      apiBearerToken: this.apiBearerToken,
      query: params.query
    })
  }
}
