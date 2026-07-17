import {
  EntitlementError,
  HttpError,
  ProviderError,
  RateLimitError,
  TimeoutError,
  isRetryable,
} from './errors.js';
import { getSettings } from './config.js';
import { logger } from './logger.js';
import { bucketFor, type RateLimitConfig, type TokenBucket } from './ratelimit.js';
import { redactString } from './redact.js';
import { nowIso } from './time.js';

/**
 * Shared HTTP client used by every provider adapter. Centralizes:
 * timeouts (AbortController), bounded retries with exponential backoff +
 * jitter, Retry-After handling, per-provider rate limiting, structured
 * logging (URLs redacted), and error mapping into the platform taxonomy.
 */

export interface HttpClientOptions {
  provider: string;
  baseUrl: string;
  /** Headers applied to every request (e.g. auth headers). */
  defaultHeaders?: Record<string, string>;
  /** Query params applied to every request (e.g. api_key). */
  defaultQuery?: Record<string, string>;
  timeoutMs?: number;
  /** Retries after the first attempt (default 3). */
  maxRetries?: number;
  rateLimit?: RateLimitConfig;
  fetchImpl?: typeof fetch;
}

export type QueryValue = string | number | boolean | undefined;

export interface RequestOptions {
  method?: 'GET' | 'POST';
  /** Path joined to baseUrl; may include a leading slash. */
  path: string;
  query?: Record<string, QueryValue>;
  headers?: Record<string, string>;
  /** JSON body for POST requests. */
  body?: unknown;
  timeoutMs?: number;
  maxRetries?: number;
}

export interface HttpResponse<T = unknown> {
  status: number;
  data: T;
  headers: Headers;
  /** Redacted request URL, safe for lineage/logs. */
  url: string;
  requestedAt: string;
  receivedAt: string;
  attempts: number;
}

export interface HttpMetrics {
  requests: number;
  retries: number;
  rateLimitHits: number;
  failures: number;
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function parseRetryAfterMs(headers: Headers): number | undefined {
  const raw = headers.get('retry-after');
  if (!raw) return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(raw);
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now());
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class HttpClient {
  private readonly bucket: TokenBucket | undefined;
  private readonly log;
  private readonly metrics: HttpMetrics = {
    requests: 0,
    retries: 0,
    rateLimitHits: 0,
    failures: 0,
  };

  constructor(private readonly options: HttpClientOptions) {
    this.bucket = options.rateLimit
      ? bucketFor(`http:${options.provider}`, options.rateLimit)
      : undefined;
    this.log = logger.child({ provider: options.provider });
  }

  getMetrics(): HttpMetrics {
    return { ...this.metrics };
  }

  private buildUrl(path: string, query?: Record<string, QueryValue>): URL {
    const base = this.options.baseUrl.endsWith('/')
      ? this.options.baseUrl
      : `${this.options.baseUrl}/`;
    const url = new URL(path.replace(/^\//, ''), base);
    for (const [key, value] of Object.entries({ ...this.options.defaultQuery, ...query })) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    return url;
  }

  async request<T = unknown>(req: RequestOptions): Promise<HttpResponse<T>> {
    const provider = this.options.provider;
    const timeoutMs = req.timeoutMs ?? this.options.timeoutMs ?? getSettings().timeoutMs;
    const maxRetries = req.maxRetries ?? this.options.maxRetries ?? 3;
    const url = this.buildUrl(req.path, req.query);
    const redactedUrl = redactString(url.toString());
    const endpoint = url.pathname;

    let lastError: unknown;
    for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
      if (this.bucket) await this.bucket.acquire();
      const requestedAt = nowIso();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const startedAt = Date.now();
      try {
        this.metrics.requests += 1;
        const fetchImpl = this.options.fetchImpl ?? fetch;
        const response = await fetchImpl(url, {
          method: req.method ?? 'GET',
          headers: {
            accept: 'application/json',
            ...(req.body !== undefined ? { 'content-type': 'application/json' } : {}),
            ...this.options.defaultHeaders,
            ...req.headers,
          },
          body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
          signal: controller.signal,
        });
        const latencyMs = Date.now() - startedAt;

        if (!response.ok) {
          const bodyText = redactString(await response.text().catch(() => ''));
          const snippet = bodyText.slice(0, 500);
          if (response.status === 429) {
            this.metrics.rateLimitHits += 1;
            this.bucket?.penalize();
            throw new RateLimitError(provider, `429 rate limited at ${endpoint}`, {
              endpoint,
              status: 429,
              retryAfterMs: parseRetryAfterMs(response.headers),
              details: { body: snippet },
            });
          }
          if (response.status === 401 || response.status === 403) {
            throw new EntitlementError(
              provider,
              `${response.status} unauthorized/forbidden at ${endpoint} — check API key and plan entitlements`,
              { endpoint, status: response.status, details: { body: snippet } },
            );
          }
          throw new HttpError(provider, `${response.status} at ${endpoint}`, {
            endpoint,
            status: response.status,
            retryable: RETRYABLE_STATUS.has(response.status),
            details: { body: snippet },
          });
        }

        const contentType = response.headers.get('content-type') ?? '';
        let data: T;
        if (contentType.includes('json')) {
          const bodyText = await response.text();
          try {
            data = JSON.parse(bodyText) as T;
          } catch {
            // A 200 with an unparseable JSON body is a provider defect,
            // not a network error — label it honestly and do not retry.
            throw new HttpError(provider, `invalid JSON in ${response.status} response at ${endpoint}`, {
              endpoint,
              status: response.status,
              retryable: false,
              details: { bodyPrefix: redactString(bodyText.slice(0, 200)) },
            });
          }
        } else {
          data = (await response.text()) as T;
        }

        this.log.debug('http request ok', {
          url: redactedUrl,
          status: response.status,
          latencyMs,
          attempt,
        });

        return {
          status: response.status,
          data,
          headers: response.headers,
          url: redactedUrl,
          requestedAt,
          receivedAt: nowIso(),
          attempts: attempt,
        };
      } catch (error) {
        lastError = this.normalizeError(error, provider, endpoint, timeoutMs);
        const retriesLeft = attempt <= maxRetries;
        if (!retriesLeft || !isRetryable(lastError)) {
          this.metrics.failures += 1;
          throw lastError;
        }
        this.metrics.retries += 1;
        const backoffMs = this.backoffMs(attempt, lastError);
        this.log.warn('http request retrying', {
          url: redactedUrl,
          attempt,
          backoffMs,
          error: lastError instanceof Error ? lastError.message : String(lastError),
        });
        await sleep(backoffMs);
      } finally {
        clearTimeout(timer);
      }
    }
    // Unreachable: the loop either returns or throws.
    throw lastError;
  }

  private normalizeError(
    error: unknown,
    provider: string,
    endpoint: string,
    timeoutMs: number,
  ): unknown {
    if (error instanceof ProviderError || error instanceof Error === false) {
      return error instanceof ProviderError
        ? error
        : new ProviderError(provider, String(error), { endpoint });
    }
    const err = error as Error;
    if (err.name === 'AbortError') {
      return new TimeoutError(provider, `timed out after ${timeoutMs}ms at ${endpoint}`, {
        endpoint,
        timeoutMs,
      });
    }
    // fetch network failures (DNS, connection reset) are retryable.
    return new ProviderError(provider, `network error at ${endpoint}: ${err.message}`, {
      endpoint,
      retryable: true,
      cause: err,
    });
  }

  private backoffMs(attempt: number, error: unknown): number {
    if (error instanceof RateLimitError && error.retryAfterMs !== undefined) {
      return Math.min(error.retryAfterMs + Math.random() * 250, 60_000);
    }
    const base = 300 * 2 ** (attempt - 1);
    return Math.min(base + Math.random() * base, 10_000);
  }

  getJson<T = unknown>(path: string, query?: Record<string, QueryValue>): Promise<HttpResponse<T>> {
    return this.request<T>({ method: 'GET', path, query });
  }

  postJson<T = unknown>(
    path: string,
    body: unknown,
    query?: Record<string, QueryValue>,
  ): Promise<HttpResponse<T>> {
    return this.request<T>({ method: 'POST', path, body, query });
  }
}
