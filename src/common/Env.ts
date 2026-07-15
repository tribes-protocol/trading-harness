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

// --- Analyst data-provider API keys ---
// The inlined analyst/data commands and the direct-API skills read these. They
// come from `.env` (the compiled tribes-cli auto-loads it), so read straight
// from process.env regardless of NODE_ENV — a prod placeholder would send the
// literal key name to the provider and fail. Empty when unset; each provider
// call surfaces a clear auth error if its key is missing.
export const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY ?? ''
export const HELIUS_API_KEY = process.env.HELIUS_API_KEY ?? ''
export const MORALIS_API_KEY = process.env.MORALIS_API_KEY ?? ''
export const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY ?? ''
export const NANSEN_API_KEY = process.env.NANSEN_API_KEY ?? ''
export const COIN_GECKO_PRO_API_KEY = process.env.COIN_GECKO_PRO_API_KEY ?? ''
export const FRED_API_KEY = process.env.FRED_API_KEY ?? ''
export const NEWSDATAIO_API_KEY = process.env.NEWSDATAIO_API_KEY ?? ''
export const MARKETSTACK_API_KEY = process.env.MARKETSTACK_API_KEY ?? ''
