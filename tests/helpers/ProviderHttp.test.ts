import { afterEach, describe, expect, it, vi } from 'vitest'

import { providerFetchJson, ProviderHttpError, redactSecrets } from '@/helpers/ProviderHttp'

const URL_UNDER_TEST = new URL('/v1/data', 'https://provider.example.test')

function jsonResponse(body: string, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'application/json', ...headers }
  })
}

describe('redactSecrets', () => {
  it('replaces every occurrence of every secret', () => {
    const text = 'key=sk-abc123 and again sk-abc123 plus other-key'
    expect(redactSecrets(text, ['sk-abc123', 'other-key'])).toBe('key=*** and again *** plus ***')
  })

  it('ignores empty secrets', () => {
    expect(redactSecrets('unchanged', [''])).toBe('unchanged')
  })
})

describe('providerFetchJson', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns parsed JSON on success', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse('{"ok":true,"n":2}'))

    const result = await providerFetchJson({
      provider: 'testprov',
      url: URL_UNDER_TEST,
      secrets: ['sk-test']
    })

    expect(result).toEqual({ ok: true, n: 2 })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('serializes jsonBody and sets content type on POST', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse('{}'))

    await providerFetchJson({
      provider: 'testprov',
      url: URL_UNDER_TEST,
      method: 'POST',
      jsonBody: { a: 1 },
      secrets: []
    })

    const init = fetchSpy.mock.calls[0]?.[1]
    expect(init?.method).toBe('POST')
    expect(init?.body).toBe('{"a":1}')
  })

  it('throws immediately on non-retryable status without retrying', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse('{"error":"bad request"}', 400))

    await expect(
      providerFetchJson({ provider: 'testprov', url: URL_UNDER_TEST, secrets: [] })
    ).rejects.toThrow('testprov request to /v1/data failed: 400')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('retries on 429 and succeeds on the next attempt', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse('slow down', 429, { 'retry-after': '0' }))
      .mockResolvedValueOnce(jsonResponse('{"ok":true}'))

    const result = await providerFetchJson({
      provider: 'testprov',
      url: URL_UNDER_TEST,
      secrets: []
    })

    expect(result).toEqual({ ok: true })
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('redacts secrets from error bodies', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse('invalid key sk-secret-value provided', 403)
    )

    let caught: unknown
    try {
      await providerFetchJson({
        provider: 'testprov',
        url: URL_UNDER_TEST,
        secrets: ['sk-secret-value']
      })
    } catch (error: unknown) {
      caught = error
    }

    expect(caught).toBeInstanceOf(ProviderHttpError)
    if (caught instanceof ProviderHttpError) {
      expect(caught.message).not.toContain('sk-secret-value')
      expect(caught.message).toContain('***')
      expect(caught.status).toBe(403)
    }
  })

  it('redacts a key that straddles the error-body preview boundary', async () => {
    const secret = 'sk-0123456789abcdef0123456789abcdef'
    // Key starts inside the 300-char preview window but ends beyond it — the
    // body must be redacted BEFORE truncation or a partial key prefix leaks.
    const body = `${'x'.repeat(280)}access_key=${secret} denied`
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(body, 403))

    let message = ''
    try {
      await providerFetchJson({ provider: 'testprov', url: URL_UNDER_TEST, secrets: [secret] })
    } catch (error: unknown) {
      message = error instanceof Error ? error.message : ''
    }
    expect(message).not.toContain(secret.slice(0, 10))
    expect(message).toContain('***')
  })

  it('gives up after maxRetries on persistent 5xx', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse('oops', 500, { 'retry-after': '0' }))

    await expect(
      providerFetchJson({
        provider: 'testprov',
        url: URL_UNDER_TEST,
        maxRetries: 1,
        secrets: []
      })
    ).rejects.toThrow('500')
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })
})
