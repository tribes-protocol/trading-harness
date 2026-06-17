import {
  ExchangeAnalystResponseSchema,
  type FetchExchangeAnalystResponseParams
} from '@/types/ExchangeAnalyst'

const EXCHANGE_ANALYST_ENDPOINT_PATH = '/agent/lucy/exchange-analyst'

export async function fetchExchangeAnalystResponse(
  params: FetchExchangeAnalystResponseParams
): Promise<string> {
  const requestUrl = new URL(EXCHANGE_ANALYST_ENDPOINT_PATH, params.apiBaseUrl)
  requestUrl.searchParams.set('q', params.query)

  const response = await fetch(requestUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${params.apiBearerToken}`
    }
  })

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '')
    throw new Error(
      `Exchange analyst request failed: ${response.status} ${response.statusText} ${bodyText}`
    )
  }

  const data: unknown = await response.json()
  return ExchangeAnalystResponseSchema.parse(data).result
}
