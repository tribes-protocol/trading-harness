import { fetchExchangeAnalystResponse } from '@/helpers/ExchangeAnalyst'
import type {
  AskExchangeAnalystCliOptions,
  ExchangeAnalystServiceParams
} from '@/types/ExchangeAnalyst'

export class ExchangeAnalystService {
  private readonly apiBaseUrl: string
  private readonly apiBearerToken: string

  constructor(params: ExchangeAnalystServiceParams) {
    this.apiBaseUrl = params.apiBaseUrl
    this.apiBearerToken = params.apiBearerToken
  }

  async ask(params: AskExchangeAnalystCliOptions): Promise<string> {
    return await fetchExchangeAnalystResponse({
      apiBaseUrl: this.apiBaseUrl,
      apiBearerToken: this.apiBearerToken,
      query: params.query
    })
  }
}
