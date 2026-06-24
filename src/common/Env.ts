import { ensureString } from '@/utils/Lang'

const NODE_ENV = process.env.NODE_ENV
const IS_PRODUCTION = NODE_ENV === 'production'

export const API_BASE_URL = IS_PRODUCTION ? 'https://api.tribes.xyz' : 'http://localhost:8787'
export const WEB_BASE_URL = IS_PRODUCTION ? 'https://tribes.xyz' : 'http://localhost:3000'

// The static per-sandbox API key the control plane injects as TRIBES_API_KEY is
// the bearer for every proxy call. Fall back to API_BEARER_TOKEN for local dev.
export const API_BEARER_TOKEN = ensureString(
  process.env.TRIBES_API_KEY ?? process.env.API_BEARER_TOKEN,
  'TRIBES_API_KEY is not set'
)

export const PRIVY_APP_ID = IS_PRODUCTION
  ? 'cmiwpjw6y0001l80b2er4lqzu'
  : ensureString(process.env.PRIVY_APP_ID, 'PRIVY_APP_ID is not set')
