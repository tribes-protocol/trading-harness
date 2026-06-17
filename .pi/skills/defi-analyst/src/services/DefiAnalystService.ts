import { fetchDefiAnalystResponse } from '@/helpers/DefiAnalyst'
import type { AskDefiAnalystCliOptions, DefiAnalystServiceParams } from '@/types/DefiAnalyst'

export class DefiAnalystService {
  private readonly apiBaseUrl: string
  private readonly apiBearerToken: string

  constructor(params: DefiAnalystServiceParams) {
    this.apiBaseUrl = params.apiBaseUrl
    this.apiBearerToken = params.apiBearerToken
  }

  async ask(params: AskDefiAnalystCliOptions): Promise<string> {
    return await fetchDefiAnalystResponse({
      apiBaseUrl: this.apiBaseUrl,
      apiBearerToken: this.apiBearerToken,
      query: params.query
    })
  }
}
