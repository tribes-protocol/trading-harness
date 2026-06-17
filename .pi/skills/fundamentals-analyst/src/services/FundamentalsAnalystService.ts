import { fetchFundamentalsAnalystResponse } from '@/helpers/FundamentalsAnalyst'
import type {
  AskFundamentalsAnalystCliOptions,
  FundamentalsAnalystServiceParams
} from '@/types/FundamentalsAnalyst'

export class FundamentalsAnalystService {
  private readonly apiBaseUrl: string
  private readonly apiBearerToken: string

  constructor(params: FundamentalsAnalystServiceParams) {
    this.apiBaseUrl = params.apiBaseUrl
    this.apiBearerToken = params.apiBearerToken
  }

  async ask(params: AskFundamentalsAnalystCliOptions): Promise<string> {
    return await fetchFundamentalsAnalystResponse({
      apiBaseUrl: this.apiBaseUrl,
      apiBearerToken: this.apiBearerToken,
      query: params.query
    })
  }
}
