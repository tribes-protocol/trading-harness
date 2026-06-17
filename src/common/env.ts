import { ensureString } from '@/utils/lang'

export const API_BASE_URL = ensureString(process.env.API_BASE_URL, 'API_BASE_URL is not set')

export const API_BEARER_TOKEN = ensureString(
  process.env.API_BEARER_TOKEN,
  'API_BEARER_TOKEN is not set'
)

export const PRIVY_APP_ID = ensureString(process.env.PRIVY_APP_ID, 'PRIVY_APP_ID is not set')
