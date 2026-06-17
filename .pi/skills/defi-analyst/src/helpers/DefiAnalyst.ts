import { DefiAnalystResponseSchema, type FetchDefiAnalystResponseParams } from '@/types/DefiAnalyst'

const DEFI_ANALYST_ENDPOINT_PATH = '/agent/lucy/defi-analyst'

export async function fetchDefiAnalystResponse(
  params: FetchDefiAnalystResponseParams
): Promise<string> {
  const requestUrl = new URL(DEFI_ANALYST_ENDPOINT_PATH, params.apiBaseUrl)
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
      `DeFi analyst request failed: ${response.status} ${response.statusText} ${bodyText}`
    )
  }

  const data: unknown = await response.json()
  return DefiAnalystResponseSchema.parse(data).result
}
