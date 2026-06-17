import { HexStringSchema } from '@/types/lang'

type JsonSerializable = { toJSON: () => unknown }

function isJsonSerializable(input: unknown): input is JsonSerializable {
  if (isNullish(input) || typeof input !== 'object') {
    return false
  }
  return 'toJSON' in input && typeof input.toJSON === 'function'
}

export function isNullish(obj: unknown): obj is null | undefined {
  return obj === null || obj === undefined
}

export function compactMap<T>(array: (T | null | undefined)[]): T[] {
  return array.filter((item): item is T => !isNullish(item))
}

export function isRequiredString(arg: unknown): arg is string {
  return typeof arg === 'string'
}

export function isOptionalString(arg: unknown): arg is string | null | undefined {
  return isNullish(arg) || isRequiredString(arg)
}

export function isRequiredNumber(arg: unknown): arg is number {
  return typeof arg === 'number'
}

export function isOptionalNumber(arg: unknown): arg is number | null | undefined {
  return isNullish(arg) || isRequiredNumber(arg)
}

export function isBigInt(value: unknown): value is bigint {
  return typeof value === 'bigint'
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && !isNullish(value) && Array.isArray(value) === false
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
  // This IS the sanctioned JSON.stringify wrapper that all
  // other code must use via toJsonTreeString/ensureJsonTreeString.
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

export function ensureString(value: unknown, message: string): string {
  if (!isRequiredString(value) || value.length === 0) {
    throw new Error(message)
  }
  return value
}

export function uniquify<T>(
  array: T[],
  mapFn?: (item: T) => string | number | bigint | boolean | symbol
): T[] {
  if (isNullish(mapFn)) {
    return Array.from(new Set(array))
  }

  const seen = new Map<string | number | bigint | boolean | symbol, T>()
  for (const item of array) {
    seen.set(mapFn(item), item)
  }
  return Array.from(seen.values())
}

export function prepend0x(value: string): `0x${string}` {
  const normalizedValue = value.startsWith('0x') ? value : `0x${value}`
  return HexStringSchema.parse(normalizedValue)
}

export function isFetchNetworkError(error: unknown): boolean {
  return (
    error instanceof TypeError &&
    /failed to fetch|fetch failed|networkerror|load failed/i.test(error.message)
  )
}

export function chunkArray<T>(input: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < input.length; i += size) {
    chunks.push(input.slice(i, i + size))
  }
  return chunks
}
