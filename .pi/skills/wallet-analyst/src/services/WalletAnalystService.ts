import { fetchWalletAnalystResponse } from '@/helpers/WalletAnalyst'
import type { AskWalletAnalystCliOptions, WalletAnalystServiceParams } from '@/types/WalletAnalyst'

export class WalletAnalystService {
  private readonly apiBaseUrl: string
  private readonly apiBearerToken: string

  constructor(params: WalletAnalystServiceParams) {
    this.apiBaseUrl = params.apiBaseUrl
    this.apiBearerToken = params.apiBearerToken
  }

  async ask(params: AskWalletAnalystCliOptions): Promise<string> {
    return await fetchWalletAnalystResponse({
      apiBaseUrl: this.apiBaseUrl,
      apiBearerToken: this.apiBearerToken,
      query: params.query
    })
  }
}
