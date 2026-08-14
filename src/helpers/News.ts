import { API_BEARER_TOKEN } from '@/common/Env'
import {
  type FetchNewsStateParams,
  GetNewsRequestSchema,
  type NewsStateResponse,
  NewsStateResponseSchema
} from '@/types/News'
import { ensureJsonTreeString } from '@/utils/Lang'

export async function fetchNewsState(params: FetchNewsStateParams): Promise<NewsStateResponse> {
  const parsedRequest = GetNewsRequestSchema.parse(params.request)
  const response = await fetch(new URL('/news', params.apiBaseUrl), {
    method: 'POST',
    // POST /news is a userAuth route on the control plane and has been since
    // 2026-07-22 (terminal 69823b1ab, "authenticate paid analysis routes"). It was
    // open before that, which is why this client never sent a credential — every
    // call has 401'd with `Unauthorized: Missing Privy token` since. Same bearer
    // the other paid routes already use (see WalletService).
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_BEARER_TOKEN}`
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
