import { ensureString } from '@/utils/Lang'

export const API_BASE_URL =
  process.env.NODE_ENV === 'development' ? 'http://localhost:8787' : 'https://api.tribes.xyz'

export const API_BEARER_TOKEN = ensureString(
  process.env.API_BEARER_TOKEN,
  'API_BEARER_TOKEN is not set'
)

export const PRIVY_APP_ID =
  process.env.NODE_ENV === 'development'
    ? ensureString(process.env.PRIVY_APP_ID, 'PRIVY_APP_ID is not set')
    : 'cmiwpjw6y0001l80b2er4lqzu'
