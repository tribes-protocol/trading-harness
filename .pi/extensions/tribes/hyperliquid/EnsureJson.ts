/**
 * Self-contained JSON serializer, copied from src/utils/lang.ts.
 *
 * Pi loads extensions through jiti, which resolves relative paths + node_modules
 * but NOT the harness's `@/*` tsconfig alias — so the extension can't import
 * the shared util. This local copy keeps the extension jiti-safe and dependency-
 * free. Keep in sync with src/utils/lang.ts.
 */

type JsonSerializable = { toJSON: () => unknown }

export function isNullish(obj: unknown): obj is null | undefined {
  return obj === null || obj === undefined
}

function isBigInt(value: unknown): value is bigint {
  return typeof value === 'bigint'
}

function isJsonSerializable(input: unknown): input is JsonSerializable {
  if (isNullish(input) || typeof input !== 'object') {
    return false
  }
  return 'toJSON' in input && typeof input.toJSON === 'function'
}

export function toJsonTree(obj: unknown): unknown {
  if (isNullish(obj)) {
    return null
  }
  if (Array.isArray(obj)) {
    return obj.map(toJsonTree)
  }
  if (obj instanceof URL) {
    return obj.toString()
  }
  if (isBigInt(obj)) {
    return obj.toString()
  }
  if (typeof obj !== 'object') {
    return obj
  }
  if (isJsonSerializable(obj)) {
    return obj.toJSON()
  }
  return Object.fromEntries(Object.entries(obj).map(([key, val]) => [key, toJsonTree(val)]))
}

export function toJsonTreeString(obj: unknown): string | null {
  if (isNullish(obj)) {
    return null
  }
  /* eslint-disable lucy/no-json-stringify */
  // The sanctioned JSON.stringify wrapper — the one place JSON.stringify is
  // allowed, mirroring src/utils/lang.ts. All other code serializes through
  // ensureJsonTreeString so bigint / URL / toJSON values stay handled.
  return JSON.stringify(toJsonTree(obj), null, 2)
  /* eslint-enable lucy/no-json-stringify */
}

export function ensureJsonTreeString(obj: unknown): string {
  const jsonString = toJsonTreeString(obj)
  if (isNullish(jsonString)) {
    throw new Error('Failed to convert object to JSON string')
  }
  return jsonString
}
