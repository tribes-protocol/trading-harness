import { ensureString } from '@/utils/Lang'

const NODE_ENV = process.env.NODE_ENV
const IS_PRODUCTION = NODE_ENV === 'production'

export const API_BASE_URL = IS_PRODUCTION ? 'https://api.tribes.xyz' : 'http://localhost:8787'
export const WEB_BASE_URL = IS_PRODUCTION ? 'https://tribes.xyz' : 'http://localhost:3000'

export const API_BEARER_TOKEN = ensureString(
  process.env.API_BEARER_TOKEN,
  'API_BEARER_TOKEN is not set'
)

export const PRIVY_APP_ID = IS_PRODUCTION
  ? 'cmiwpjw6y0001l80b2er4lqzu'
  : ensureString(process.env.PRIVY_APP_ID, 'PRIVY_APP_ID is not set')
