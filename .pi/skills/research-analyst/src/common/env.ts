import { ensureString } from '@shared/utils/lang'

export const API_BASE_URL = ensureString(process.env.API_BASE_URL, 'API_BASE_URL is not set')
export const API_BEARER_TOKEN = ensureString(
  process.env.API_BEARER_TOKEN,
  'API_BEARER_TOKEN is not set'
)
