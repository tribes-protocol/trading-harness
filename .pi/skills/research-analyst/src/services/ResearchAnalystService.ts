import { fetchResearchAnalystResponse } from '@/helpers/ResearchAnalyst'
import type {
  AskResearchAnalystCliOptions,
  ResearchAnalystServiceParams
} from '@/types/ResearchAnalyst'

export class ResearchAnalystService {
  private readonly apiBaseUrl: string
  private readonly apiBearerToken: string

  constructor(params: ResearchAnalystServiceParams) {
    this.apiBaseUrl = params.apiBaseUrl
    this.apiBearerToken = params.apiBearerToken
  }

  async ask(params: AskResearchAnalystCliOptions): Promise<string> {
    return await fetchResearchAnalystResponse({
      apiBaseUrl: this.apiBaseUrl,
      apiBearerToken: this.apiBearerToken,
      query: params.query
    })
  }
}
