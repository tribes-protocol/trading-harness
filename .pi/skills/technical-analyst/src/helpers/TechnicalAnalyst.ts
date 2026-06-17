import {
  type FetchTechnicalAnalystResponseParams,
  TechnicalAnalystResponseSchema
} from '@/types/TechnicalAnalyst'

const TECHNICAL_ANALYST_ENDPOINT_PATH = '/agent/lucy/technical-analyst'

export async function fetchTechnicalAnalystResponse(
  params: FetchTechnicalAnalystResponseParams
): Promise<string> {
  const requestUrl = new URL(TECHNICAL_ANALYST_ENDPOINT_PATH, params.apiBaseUrl)
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
      `Technical analyst request failed: ${response.status} ${response.statusText} ${bodyText}`
    )
  }

  const data: unknown = await response.json()
  return TechnicalAnalystResponseSchema.parse(data).result
}
