import { describe, expect, it, vi } from 'vitest';
import {
  EntitlementError,
  HttpError,
  RateLimitError,
  TimeoutError,
} from '../../src/core/errors.js';
import { HttpClient } from '../../src/core/http.js';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

function client(fetchImpl: typeof fetch, overrides: Partial<ConstructorParameters<typeof HttpClient>[0]> = {}) {
  return new HttpClient({
    provider: 'test',
    baseUrl: 'https://api.test.example/v1',
    fetchImpl,
    maxRetries: 2,
    ...overrides,
  });
}

describe('HttpClient', () => {
  it('returns parsed JSON with timestamps and attempt count', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: 1 }));
    const res = await client(fetchImpl as unknown as typeof fetch).getJson<{ ok: number }>(
      '/data',
      { a: 1 },
    );
    expect(res.data.ok).toBe(1);
    expect(res.attempts).toBe(1);
    expect(Date.parse(res.requestedAt)).toBeLessThanOrEqual(Date.parse(res.receivedAt));
    const calledUrl = (fetchImpl.mock.calls[0]as unknown[])[0] as URL;
    expect(calledUrl.toString()).toBe('https://api.test.example/v1/data?a=1');
  });

  it('retries retryable 5xx and succeeds', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('oops', { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    const res = await client(fetchImpl as unknown as typeof fetch).getJson('/x');
    expect(res.attempts).toBe(2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-retryable 4xx', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('bad', { status: 400 }));
    await expect(client(fetchImpl as unknown as typeof fetch).getJson('/x')).rejects.toBeInstanceOf(
      HttpError,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('maps 429 to RateLimitError with Retry-After', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response('slow down', { status: 429, headers: { 'retry-after': '0' } }),
    );
    await expect(
      client(fetchImpl as unknown as typeof fetch, { maxRetries: 0 }).getJson('/x'),
    ).rejects.toBeInstanceOf(RateLimitError);
  });

  it('maps 401/403 to EntitlementError and does not retry', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 401 }));
    await expect(client(fetchImpl as unknown as typeof fetch).getJson('/x')).rejects.toBeInstanceOf(
      EntitlementError,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('maps aborts to TimeoutError and retries them', async () => {
    const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const fetchImpl = vi.fn().mockRejectedValue(abortError);
    await expect(
      client(fetchImpl as unknown as typeof fetch, { maxRetries: 1 }).getJson('/x'),
    ).rejects.toBeInstanceOf(TimeoutError);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('maps a 200 with unparseable JSON to a non-retryable HttpError, not a network error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response('{"data": [truncat', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    try {
      await client(fetchImpl as unknown as typeof fetch).getJson('/x');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).retryable).toBe(false);
      expect((error as HttpError).message).toContain('invalid JSON');
    }
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('never leaks credential query params in error or url fields', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('bad', { status: 400 }));
    const c = client(fetchImpl as unknown as typeof fetch, {
      defaultQuery: { api_key: 'super-secret-key-1' },
    });
    try {
      await c.getJson('/x');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(JSON.stringify((error as HttpError).toJSON())).not.toContain('super-secret-key-1');
    }
  });

  it('tracks metrics', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('oops', { status: 500 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    const c = client(fetchImpl as unknown as typeof fetch);
    await c.getJson('/x');
    expect(c.getMetrics()).toMatchObject({ requests: 2, retries: 1, failures: 0 });
  });
});
