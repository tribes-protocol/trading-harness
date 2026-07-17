/**
 * Secret redaction. Every string that leaves the platform through logs,
 * errors, reports, or CLI output should pass through these helpers.
 *
 * Two layers of defense:
 *  1. Exact-value redaction of secrets registered at config-load time.
 *  2. Pattern-based redaction of common credential shapes (query params,
 *     bearer tokens, sensitive header/object keys).
 */

const knownSecrets = new Set<string>();

/** Register a secret value (e.g. an API key) for exact-match redaction. */
export function registerSecret(value: string | undefined | null): void {
  if (typeof value === 'string' && value.trim().length >= 6) {
    knownSecrets.add(value.trim());
  }
}

/** Test-only: clear registered secrets. */
export function clearRegisteredSecrets(): void {
  knownSecrets.clear();
}

const REDACTED = '[REDACTED]';

const KV_PATTERN =
  /\b(api[_-]?key|apikey|access[_-]?key|auth[_-]?token|token|secret|password|x-api-key)(\s*[=:]\s*)([^&\s"',;]+)/gi;
const BEARER_PATTERN = /\b(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/g;

const SENSITIVE_KEY_PATTERN =
  /(api[_-]?key|apikey|access[_-]?key|token|secret|password|authorization|credential)/i;

/** Redact secrets from a string (exact matches first, then patterns). */
export function redactString(input: string): string {
  let out = input;
  for (const secret of knownSecrets) {
    if (out.includes(secret)) out = out.split(secret).join(REDACTED);
  }
  out = out.replace(KV_PATTERN, (_m, key: string, sep: string) => `${key}${sep}${REDACTED}`);
  out = out.replace(BEARER_PATTERN, (_m, prefix: string) => `${prefix}${REDACTED}`);
  return out;
}

/**
 * Deep-redact an arbitrary value: strings are pattern-redacted, and any
 * object property whose key looks credential-like is masked entirely.
 */
export function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[depth-limit]';
  if (typeof value === 'string') return redactString(value);
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redactValue(v, depth + 1));
  if (value instanceof Error) {
    return { name: value.name, message: redactString(value.message) };
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEY_PATTERN.test(k) && typeof v === 'string' && v.length > 0
      ? REDACTED
      : redactValue(v, depth + 1);
  }
  return out;
}
