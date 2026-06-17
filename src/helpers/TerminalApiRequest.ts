type AuthorizationHeadersParams = {
  readonly headers: HeadersInit | undefined
  readonly bearerToken: string
}

type FetchTerminalApiParams = {
  readonly apiBaseUrl: string
  readonly path: string
  readonly init: RequestInit
  readonly apiBearerToken: string
}

function withAuthorizationHeader(params: AuthorizationHeadersParams): Headers {
  const headers = new Headers(params.headers)
  headers.set('Authorization', `Bearer ${params.bearerToken}`)
  return headers
}

export async function fetchTerminalApi(params: FetchTerminalApiParams): Promise<Response> {
  const headers = withAuthorizationHeader({
    headers: params.init.headers,
    bearerToken: params.apiBearerToken
  })
  const url = new URL(params.path, params.apiBaseUrl)
  return await fetch(url, { ...params.init, headers })
}
