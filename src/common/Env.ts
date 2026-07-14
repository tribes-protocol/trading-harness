import { ensureString } from '@/utils/Lang'

const NODE_ENV = process.env.NODE_ENV
const USE_DEFAULT_VALUES = NODE_ENV === undefined || NODE_ENV === ''
const IS_PRODUCTION = NODE_ENV === 'production' || USE_DEFAULT_VALUES

export const API_BASE_URL = IS_PRODUCTION ? 'https://api.tribes.xyz' : 'http://localhost:8787'
export const WEB_BASE_URL = IS_PRODUCTION ? 'https://tribes.xyz' : 'http://localhost:3000'

// The static per-sandbox API key the control plane injects as TRIBES_API_KEY is
// the bearer for every proxy call. Fall back to API_BEARER_TOKEN for local dev.
export const API_BEARER_TOKEN = process.env.TRIBES_API_KEY ?? process.env.API_BEARER_TOKEN ?? ''

export const PRIVY_APP_ID = IS_PRODUCTION
  ? 'cmiwpjw6y0001l80b2er4lqzu'
  : ensureString(process.env.PRIVY_APP_ID, 'PRIVY_APP_ID is not set')

export const MARKETSTACK_API_KEY = IS_PRODUCTION
  ? 'MARKETSTACK_API_KEY'
  : ensureString(process.env.MARKETSTACK_API_KEY, 'MARKETSTACK_API_KEY is not set')

export const COIN_GECKO_PRO_API_KEY = IS_PRODUCTION
  ? 'COIN_GECKO_PRO_API_KEY'
  : ensureString(process.env.COIN_GECKO_PRO_API_KEY, 'COIN_GECKO_PRO_API_KEY is not set')

export const BIRDEYE_API_KEY = IS_PRODUCTION
  ? 'BIRDEYE_API_KEY'
  : ensureString(process.env.BIRDEYE_API_KEY, 'BIRDEYE_API_KEY is not set')

export const NANSEN_API_KEY = IS_PRODUCTION
  ? 'NANSEN_API_KEY'
  : ensureString(process.env.NANSEN_API_KEY, 'NANSEN_API_KEY is not set')
