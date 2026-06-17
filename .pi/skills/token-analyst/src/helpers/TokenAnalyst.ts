import {
  type FetchTokenAnalystResponseParams,
  TokenAnalystResponseSchema
} from '@/types/TokenAnalyst'

const TOKEN_ANALYST_ENDPOINT_PATH = '/agent/lucy/token-analyst'

export async function fetchTokenAnalystResponse(
  params: FetchTokenAnalystResponseParams
): Promise<string> {
  const requestUrl = new URL(TOKEN_ANALYST_ENDPOINT_PATH, params.apiBaseUrl)
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
      `Token analyst request failed: ${response.status} ${response.statusText} ${bodyText}`
    )
  }

  const data: unknown = await response.json()
  return TokenAnalystResponseSchema.parse(data).result
}
