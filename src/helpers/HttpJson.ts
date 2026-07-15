// Fetch JSON with clean errors: non-2xx, empty body (a common rate-limit
// symptom that otherwise surfaces as a cryptic JSON decode error), and
// non-JSON bodies all become descriptive Error messages.
export async function fetchJson(url: URL, init: RequestInit, provider: string): Promise<unknown> {
  const response = await fetch(url, init)
  const text = await response.text()

  if (!response.ok) {
    throw new Error(
      `${provider} request failed: ${response.status} ${response.statusText} ${text.slice(0, 200)}`
    )
  }
  if (text.trim() === '') {
    throw new Error(
      `${provider} returned an empty response (possible rate limit) for ${url.pathname}`
    )
  }
  try {
    const parsed: unknown = JSON.parse(text)
    return parsed
  } catch {
    throw new Error(`${provider} returned a non-JSON response for ${url.pathname}`)
  }
}
