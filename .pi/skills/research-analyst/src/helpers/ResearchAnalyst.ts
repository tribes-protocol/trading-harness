import {
  type FetchResearchAnalystResponseParams,
  ResearchAnalystResponseSchema
} from '@/types/ResearchAnalyst'

const RESEARCH_ANALYST_ENDPOINT_PATH = '/agent/lucy/research-analyst'

export async function fetchResearchAnalystResponse(
  params: FetchResearchAnalystResponseParams
): Promise<string> {
  const requestUrl = new URL(RESEARCH_ANALYST_ENDPOINT_PATH, params.apiBaseUrl)
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
      `Research analyst request failed: ${response.status} ${response.statusText} ${bodyText}`
    )
  }

  const data: unknown = await response.json()
  return ResearchAnalystResponseSchema.parse(data).result
}
