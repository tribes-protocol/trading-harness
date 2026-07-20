export const FALLBACK_PERP_DEXES = ['', 'xyz'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Produces the full perp venue list from Hyperliquid's `perpDexs` response.
 * Main is represented by `null` upstream and by an empty string in local
 * request bodies. A malformed or empty response retains the known-safe
 * main/xyz fallback rather than blanking the status widget.
 */
export function resolvePerpDexes(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) return FALLBACK_PERP_DEXES

  const dexes = new Set<string>([''])
  let recognizedDexes = 0
  for (const rawDex of value) {
    if (rawDex === null) {
      recognizedDexes += 1
      continue
    }
    if (!isRecord(rawDex) || typeof rawDex.name !== 'string') continue
    const name = rawDex.name.trim()
    if (name.length === 0) continue
    dexes.add(name)
    recognizedDexes += 1
  }

  return recognizedDexes > 0 ? [...dexes] : FALLBACK_PERP_DEXES
}
