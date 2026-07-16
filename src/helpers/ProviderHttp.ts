import { sleep } from '@/helpers/AsyncControl'
import { isFetchNetworkError, isNullish } from '@/utils/Lang'

// Shared HTTP layer for direct market-data providers (FRED, CoinGecko, Birdeye,
// Moralis, Alchemy, Helius, Nansen, Marketstack, NewsData.io, Tavily).
// Every request gets a hard timeout, bounded retries with backoff on 429/5xx and
// network errors (honoring Retry-After), and secret redaction so an API key can
// never leak through an error message, no matter where the provider echoes it.

const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_MAX_RETRIES = 2
const BASE_BACKOFF_MS = 500
const MAX_RETRY_AFTER_MS = 15_000
const ERROR_BODY_PREVIEW_CHARS = 300

export class ProviderHttpError extends Error {
  readonly provider: string
  readonly status: number | null

  constructor(params: { provider: string; status: number | null; message: string }) {
    super(params.message)
    this.name = 'ProviderHttpError'
    this.provider = params.provider
    this.status = params.status
  }
}

type ProviderFetchJsonParams = {
  readonly provider: string
  readonly url: URL
  readonly method?: 'GET' | 'POST'
  readonly headers?: Readonly<Record<string, string>>
  readonly jsonBody?: unknown
  readonly timeoutMs?: number
  readonly maxRetries?: number
  // Secret values (API keys) to strip from any error text. Always pass the key
  // here even when it travels in a header — providers sometimes echo request
  // URLs or bodies back inside error payloads.
  readonly secrets: readonly string[]
}

export function redactSecrets(text: string, secrets: readonly string[]): string {
  let redacted = text
  for (const secret of secrets) {
    if (secret.length > 0) {
      redacted = redacted.split(secret).join('***')
    }
  }
  return redacted
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500
}

function retryAfterMs(response: Response, attempt: number): number {
  const header = response.headers.get('retry-after')
  if (!isNullish(header)) {
    const seconds = Number(header)
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS)
    }
  }
  return BASE_BACKOFF_MS * 2 ** attempt
}

export async function providerFetchJson(params: ProviderFetchJsonParams): Promise<unknown> {
  const maxRetries = params.maxRetries ?? DEFAULT_MAX_RETRIES
  const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS
  // Some providers (e.g. Alchemy) carry the key as a URL path segment, so even
  // the pathname must be redacted before it can appear in an error message.
  const safePath = redactSecrets(params.url.pathname, params.secrets)

  let lastError: ProviderHttpError | null = null
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    let response: Response
    try {
      response = await fetch(params.url, {
        method: params.method ?? 'GET',
        headers: {
          Accept: 'application/json',
          ...(isNullish(params.jsonBody) ? {} : { 'Content-Type': 'application/json' }),
          ...params.headers
        },
        body: isNullish(params.jsonBody) ? undefined : ensureRedactSafeBody(params.jsonBody),
        signal: AbortSignal.timeout(timeoutMs)
      })
    } catch (error: unknown) {
      const isTimeout = error instanceof DOMException && error.name === 'TimeoutError'
      const isNetwork = isFetchNetworkError(error)
      const reason = isTimeout ? `timed out after ${timeoutMs}ms` : 'network error'
      lastError = new ProviderHttpError({
        provider: params.provider,
        status: null,
        message: `${params.provider} request to ${safePath} failed: ${reason}`
      })
      if (!isTimeout && !isNetwork) {
        const message = error instanceof Error ? error.message : 'unknown error'
        throw new ProviderHttpError({
          provider: params.provider,
          status: null,
          message: `${params.provider} request to ${safePath} failed: ${redactSecrets(
            message,
            params.secrets
          )}`
        })
      }
      if (attempt < maxRetries) {
        await sleep(BASE_BACKOFF_MS * 2 ** attempt)
      }
      continue
    }

    if (response.ok) {
      const data: unknown = await response.json().catch(() => {
        throw new ProviderHttpError({
          provider: params.provider,
          status: response.status,
          message: `${params.provider} returned a non-JSON response from ${safePath}`
        })
      })
      return data
    }

    const bodyText = await response.text().catch(() => '')
    // Redact BEFORE truncating: slicing first could cut a provider-echoed key
    // mid-string, leaving a partial prefix no exact-match redaction can catch.
    const preview = redactSecrets(bodyText, params.secrets).slice(0, ERROR_BODY_PREVIEW_CHARS)
    lastError = new ProviderHttpError({
      provider: params.provider,
      status: response.status,
      message:
        `${params.provider} request to ${safePath} failed: ` +
        `${response.status} ${response.statusText} ${preview}`.trim()
    })
    if (!isRetryableStatus(response.status) || attempt >= maxRetries) {
      throw lastError
    }
    await sleep(retryAfterMs(response, attempt))
  }

  throw (
    lastError ??
    new ProviderHttpError({
      provider: params.provider,
      status: null,
      message: `${params.provider} request to ${safePath} failed`
    })
  )
}

function ensureRedactSafeBody(jsonBody: unknown): string {
  /* eslint-disable lucy/no-json-stringify */
  // Compact request-body serialization for provider POST calls; the project-wide
  // ensureJsonTreeString pretty-prints for human output, which providers reject
  // less compactly and pads request sizes for no benefit.
  return JSON.stringify(jsonBody)
  /* eslint-enable lucy/no-json-stringify */
}
