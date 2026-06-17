import { ensureJsonTreeString } from '@shared/utils/lang'

import {
  type FetchNewsStateParams,
  GetNewsRequestSchema,
  type NewsStateResponse,
  NewsStateResponseSchema
} from '@/types/News'

export async function fetchNewsState(params: FetchNewsStateParams): Promise<NewsStateResponse> {
  const parsedRequest = GetNewsRequestSchema.parse(params.request)
  const response = await fetch(new URL('/news', params.apiBaseUrl), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: ensureJsonTreeString(parsedRequest)
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Failed to fetch news: ${response.status} ${response.statusText} ${body}`)
  }

  const data: unknown = await response.json()
  return NewsStateResponseSchema.parse(data)
}
