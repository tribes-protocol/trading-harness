import { ensureString } from '@/utils/Lang'

export const API_BASE_URL = ensureString(process.env.API_BASE_URL, 'API_BASE_URL is not set')

// The static per-sandbox API key the control plane injects as TRIBES_API_KEY is
// the bearer for every proxy call. Fall back to API_BEARER_TOKEN for local dev.
export const API_BEARER_TOKEN = ensureString(
  process.env.TRIBES_API_KEY ?? process.env.API_BEARER_TOKEN,
  'TRIBES_API_KEY is not set'
)

export const PRIVY_APP_ID = ensureString(process.env.PRIVY_APP_ID, 'PRIVY_APP_ID is not set')
