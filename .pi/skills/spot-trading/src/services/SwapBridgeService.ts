import {
  QuoteErrorSchema,
  type QuoteRequest,
  type QuoteResponse,
  QuoteResponseSchema
} from '@shared/types/quote'
import { ensureJsonTreeString } from '@shared/utils/lang'

interface SwapBridgeServiceParams {
  readonly apiBaseUrl: string
}

export class SwapBridgeService {
  private readonly apiBaseUrl: string

  constructor(params: SwapBridgeServiceParams) {
    this.apiBaseUrl = params.apiBaseUrl
  }

  async quote(request: QuoteRequest): Promise<QuoteResponse> {
    const response = await fetch(new URL('/trade/quote', this.apiBaseUrl), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: ensureJsonTreeString(request)
    })

    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null)
      const quoteError = QuoteErrorSchema.safeParse(body)
      if (quoteError.success) {
        throw new Error(quoteError.data.error)
      }
      throw new Error(`Failed to fetch quote: ${response.status} ${response.statusText}`)
    }

    const data: unknown = await response.json()
    return QuoteResponseSchema.parse(data)
  }
}
