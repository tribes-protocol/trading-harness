import { getApiBearerToken } from '@/helpers/Jwt'

interface AuthorizationHeadersParams {
  readonly headers: HeadersInit | undefined
  readonly bearerToken: string
}

interface FetchTerminalApiParams {
  readonly apiBaseUrl: string
  readonly path: string
  readonly init: RequestInit
}

function withAuthorizationHeader(params: AuthorizationHeadersParams): Headers {
  const headers = new Headers(params.headers)
  headers.set('Authorization', `Bearer ${params.bearerToken}`)
  return headers
}

export async function fetchTerminalApi(params: FetchTerminalApiParams): Promise<Response> {
  const token = await getApiBearerToken()
  const headers = withAuthorizationHeader({
    headers: params.init.headers,
    bearerToken: token
  })
  const url = new URL(params.path, params.apiBaseUrl)
  return await fetch(url, { ...params.init, headers })
}
