import { fetchAnalystResponse } from '@/helpers/Analyst'
import type { AnalystConfig, AnalystServiceParams, AskAnalystCliOptions } from '@/types/Analyst'

export class AnalystService {
  private readonly apiBaseUrl: string
  private readonly apiBearerToken: string
  private readonly config: AnalystConfig

  constructor(params: AnalystServiceParams) {
    this.apiBaseUrl = params.apiBaseUrl
    this.apiBearerToken = params.apiBearerToken
    this.config = params.config
  }

  async ask(params: AskAnalystCliOptions): Promise<string> {
    return await fetchAnalystResponse({
      apiBaseUrl: this.apiBaseUrl,
      apiBearerToken: this.apiBearerToken,
      endpointPath: this.config.endpointPath,
      errorLabel: this.config.errorLabel,
      query: params.query
    })
  }
}
