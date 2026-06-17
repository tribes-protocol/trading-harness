import type { MacrosMarketSnapshot } from '@/types/Macros'
import { MacrosMarketSnapshotSchema } from '@/types/Macros'

type MacrosServiceParams = {
  readonly apiBaseUrl: string
  readonly apiBearerToken: string
}

export class MacrosService {
  private readonly apiBaseUrl: string

  private readonly apiBearerToken: string

  constructor(params: MacrosServiceParams) {
    this.apiBaseUrl = params.apiBaseUrl
    this.apiBearerToken = params.apiBearerToken
  }

  async getMarketSnapshot(): Promise<MacrosMarketSnapshot> {
    const response = await fetch(new URL('/agent/macros/market', this.apiBaseUrl), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${this.apiBearerToken}`
      }
    })
    if (!response.ok) {
      throw new Error(
        `Failed to fetch macros market snapshot: ${response.status} ${response.statusText}`
      )
    }
    const data: unknown = await response.json()
    return MacrosMarketSnapshotSchema.parse(data)
  }
}
