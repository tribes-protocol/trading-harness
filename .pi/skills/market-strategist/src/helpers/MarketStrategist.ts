import {
  type FetchMarketStrategistResponseParams,
  MarketStrategistResponseSchema
} from '@/types/MarketStrategist'

const MARKET_STRATEGIST_ENDPOINT_PATH = '/agent/lucy/market-strategist'

export async function fetchMarketStrategistResponse(
  params: FetchMarketStrategistResponseParams
): Promise<string> {
  const requestUrl = new URL(MARKET_STRATEGIST_ENDPOINT_PATH, params.apiBaseUrl)
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
      `Market strategist request failed: ${response.status} ${response.statusText} ${bodyText}`
    )
  }

  const data: unknown = await response.json()
  return MarketStrategistResponseSchema.parse(data).result
}
