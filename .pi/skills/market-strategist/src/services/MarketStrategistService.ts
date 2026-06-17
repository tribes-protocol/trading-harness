import { fetchMarketStrategistResponse } from '@/helpers/MarketStrategist'
import type {
  AskMarketStrategistCliOptions,
  MarketStrategistServiceParams
} from '@/types/MarketStrategist'

export class MarketStrategistService {
  private readonly apiBaseUrl: string
  private readonly apiBearerToken: string

  constructor(params: MarketStrategistServiceParams) {
    this.apiBaseUrl = params.apiBaseUrl
    this.apiBearerToken = params.apiBearerToken
  }

  async ask(params: AskMarketStrategistCliOptions): Promise<string> {
    return await fetchMarketStrategistResponse({
      apiBaseUrl: this.apiBaseUrl,
      apiBearerToken: this.apiBearerToken,
      query: params.query
    })
  }
}
