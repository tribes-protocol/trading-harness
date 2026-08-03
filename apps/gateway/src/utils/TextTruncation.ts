const TRUNCATION_MARKER = '\n… truncated'

/**
 * Bound a string to `maxChars` INCLUDING the marker. The client never
 * re-truncates — `common/Constants.ts` promises frames arrive already bounded —
 * so the returned length is the guarantee, not an approximation.
 */
export function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text
  }
  if (maxChars <= TRUNCATION_MARKER.length) {
    return text.slice(0, maxChars)
  }
  return `${text.slice(0, maxChars - TRUNCATION_MARKER.length)}${TRUNCATION_MARKER}`
}
