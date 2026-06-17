import { fetchTechnicalAnalystResponse } from '@/helpers/TechnicalAnalyst'
import type {
  AskTechnicalAnalystCliOptions,
  TechnicalAnalystServiceParams
} from '@/types/TechnicalAnalyst'

export class TechnicalAnalystService {
  private readonly apiBaseUrl: string
  private readonly apiBearerToken: string

  constructor(params: TechnicalAnalystServiceParams) {
    this.apiBaseUrl = params.apiBaseUrl
    this.apiBearerToken = params.apiBearerToken
  }

  async ask(params: AskTechnicalAnalystCliOptions): Promise<string> {
    return await fetchTechnicalAnalystResponse({
      apiBaseUrl: this.apiBaseUrl,
      apiBearerToken: this.apiBearerToken,
      query: params.query
    })
  }
}
