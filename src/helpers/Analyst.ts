import { AnalystResponseSchema, type FetchAnalystResponseParams } from '@/types/Analyst'

export async function fetchAnalystResponse(params: FetchAnalystResponseParams): Promise<string> {
  const requestUrl = new URL(params.endpointPath, params.apiBaseUrl)
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
      `${params.errorLabel} request failed: ${response.status} ${response.statusText} ${bodyText}`
    )
  }

  const data: unknown = await response.json()
  return AnalystResponseSchema.parse(data).result
}
