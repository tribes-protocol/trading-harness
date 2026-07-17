import { redactString, redactValue } from './redact.js';

/**
 * Structured error taxonomy. Every error the platform raises is a
 * PlatformError with a machine-readable code, a retryability hint, and
 * redacted details safe to log or surface to users.
 */

export type ErrorCode =
  | 'CONFIG'
  | 'VALIDATION'
  | 'NOT_SUPPORTED'
  | 'PROVIDER'
  | 'HTTP'
  | 'RATE_LIMIT'
  | 'TIMEOUT'
  | 'ENTITLEMENT'
  | 'DATA_QUALITY'
  | 'INTERNAL';

export interface PlatformErrorOptions {
  retryable?: boolean;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export class PlatformError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  readonly details: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, opts: PlatformErrorOptions = {}) {
    super(redactString(message));
    this.name = new.target.name;
    this.code = code;
    this.retryable = opts.retryable ?? false;
    this.details = (redactValue(opts.details ?? {}) as Record<string, unknown>) ?? {};
    if (opts.cause !== undefined) this.cause = opts.cause;
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      details: this.details,
    };
  }
}

export class ConfigError extends PlatformError {
  constructor(message: string, opts: PlatformErrorOptions = {}) {
    super('CONFIG', message, opts);
  }
}

export class ValidationError extends PlatformError {
  constructor(message: string, opts: PlatformErrorOptions = {}) {
    super('VALIDATION', message, opts);
  }
}

export class NotSupportedError extends PlatformError {
  constructor(message: string, opts: PlatformErrorOptions = {}) {
    super('NOT_SUPPORTED', message, opts);
  }
}

export class DataQualityError extends PlatformError {
  constructor(message: string, opts: PlatformErrorOptions = {}) {
    super('DATA_QUALITY', message, opts);
  }
}

export interface ProviderErrorOptions extends PlatformErrorOptions {
  endpoint?: string;
  status?: number;
}

export class ProviderError extends PlatformError {
  readonly provider: string;
  readonly endpoint?: string;
  readonly status?: number;

  constructor(
    provider: string,
    message: string,
    opts: ProviderErrorOptions = {},
    code: ErrorCode = 'PROVIDER',
  ) {
    super(code, `[${provider}] ${message}`, opts);
    this.provider = provider;
    if (opts.endpoint !== undefined) this.endpoint = opts.endpoint;
    if (opts.status !== undefined) this.status = opts.status;
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      provider: this.provider,
      ...(this.endpoint !== undefined ? { endpoint: this.endpoint } : {}),
      ...(this.status !== undefined ? { status: this.status } : {}),
    };
  }
}

export class HttpError extends ProviderError {
  constructor(provider: string, message: string, opts: ProviderErrorOptions = {}) {
    super(provider, message, opts, 'HTTP');
  }
}

export class RateLimitError extends ProviderError {
  readonly retryAfterMs?: number;

  constructor(
    provider: string,
    message: string,
    opts: ProviderErrorOptions & { retryAfterMs?: number } = {},
  ) {
    super(provider, message, { ...opts, retryable: true }, 'RATE_LIMIT');
    if (opts.retryAfterMs !== undefined) this.retryAfterMs = opts.retryAfterMs;
  }
}

export class TimeoutError extends ProviderError {
  readonly timeoutMs: number;

  constructor(
    provider: string,
    message: string,
    opts: ProviderErrorOptions & { timeoutMs: number },
  ) {
    super(provider, message, { ...opts, retryable: true }, 'TIMEOUT');
    this.timeoutMs = opts.timeoutMs;
  }
}

export class EntitlementError extends ProviderError {
  constructor(provider: string, message: string, opts: ProviderErrorOptions = {}) {
    super(provider, message, { ...opts, retryable: false }, 'ENTITLEMENT');
  }
}

/** Narrowing helper for retry loops. */
export function isRetryable(err: unknown): boolean {
  return err instanceof PlatformError && err.retryable;
}
