import { AlphaScoutResponseSchema, type FetchAlphaScoutResponseParams } from '@/types/AlphaScout'

const ALPHA_SCOUT_ENDPOINT_PATH = '/agent/lucy/alpha-scout'

export async function fetchAlphaScoutResponse(
  params: FetchAlphaScoutResponseParams
): Promise<string> {
  const requestUrl = new URL(ALPHA_SCOUT_ENDPOINT_PATH, params.apiBaseUrl)
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
      `Alpha scout request failed: ${response.status} ${response.statusText} ${bodyText}`
    )
  }

  const data: unknown = await response.json()
  return AlphaScoutResponseSchema.parse(data).result
}
