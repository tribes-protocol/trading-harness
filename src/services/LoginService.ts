import { generateKeyPair } from 'node:crypto'
import { promisify } from 'node:util'

import { retry } from '@/helpers/AsyncControl'
import { writeAgentAuthorizationKey } from '@/helpers/AuthKey'
import { writeCliLoginKey } from '@/helpers/CliLoginKey'
import { type CliLoginPollResponse, CliLoginPollResponseSchema } from '@/types/CliLogin'

const LOGIN_POLL_INTERVAL_MS = 2_000
const LOGIN_POLL_TIMEOUT_MS = 3 * 60_000
const LOGIN_POLL_MAX_RETRIES = LOGIN_POLL_TIMEOUT_MS / LOGIN_POLL_INTERVAL_MS
const API_BASE_URL =
  process.env.NODE_ENV === 'development' ? 'http://localhost:8787' : 'https://api.tribes.xyz'
const WEB_BASE_URL =
  process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : 'https://app.tribes.xyz'

const generateKeyPairAsync = promisify(generateKeyPair)

function parseLoginPollResponse(data: unknown): CliLoginPollResponse {
  return CliLoginPollResponseSchema.parse(data)
}

export type LoginRequestContext = {
  readonly privateKeyPem: string
  readonly publicKeyPem: string
  // base64url(DER) of the SPKI public key
  readonly publicKeyCompact: string
  readonly loginUrl: string
}

export class LoginService {
  private async pollLoginResult(publicKeyCompact: string): Promise<CliLoginPollResponse> {
    const resultUrl = new URL('/agent/remote/login/result', API_BASE_URL)
    resultUrl.searchParams.set('pubKey', publicKeyCompact)

    try {
      return await retry<CliLoginPollResponse>({
        fn: async (): Promise<CliLoginPollResponse> => {
          const response = await fetch(resultUrl, {
            method: 'GET',
            headers: {
              Accept: 'application/json'
            }
          })

          if (response.status === 204) {
            throw response
          }

          if (response.ok) {
            const data: unknown = await response.json()
            return parseLoginPollResponse(data)
          }

          const body = await response.text()
          throw new Error(
            `Login result request failed: ${response.status} ${response.statusText}` +
              (body.length > 0 ? ` - ${body}` : '')
          )
        },
        maxRetries: LOGIN_POLL_MAX_RETRIES,
        ms: LOGIN_POLL_INTERVAL_MS,
        logError: false,
        shouldRetry: (error: unknown): boolean => error instanceof Response && error.status === 204
      })
    } catch (error: unknown) {
      if (error instanceof Response && error.status === 204) {
        throw new Error(
          'Timed out waiting for login result. Finish login in the browser and retry.'
        )
      }
      throw error
    }
  }

  async createLoginRequest(): Promise<LoginRequestContext> {
    const { privateKey, publicKey } = await generateKeyPairAsync('ec', {
      namedCurve: 'P-256'
    })

    const privateKeyPem = privateKey
      .export({
        type: 'pkcs8',
        format: 'pem'
      })
      .toString()
    const publicKeyPem = publicKey
      .export({
        type: 'spki',
        format: 'pem'
      })
      .toString()
    const publicKeyCompact = publicKey
      .export({
        type: 'spki',
        format: 'der'
      })
      .toString('base64url')

    await writeCliLoginKey({
      schema: 'cli-login-key.v1',
      curve: 'P-256',
      privateKeyPem,
      publicKeyPem,
      createdAt: new Date().toISOString()
    })

    const loginUrl = new URL('/agents/login', WEB_BASE_URL)
    loginUrl.searchParams.set('pubkey', publicKeyCompact)

    return {
      privateKeyPem,
      publicKeyPem,
      publicKeyCompact,
      loginUrl: loginUrl.toString()
    }
  }

  async finalizeLogin(loginRequest: LoginRequestContext): Promise<void> {
    const pollResult = await this.pollLoginResult(loginRequest.publicKeyCompact)

    await writeAgentAuthorizationKey({
      schema: 'agent-authorization-key.v1',
      curve: 'P-256',
      privateKeyPem: loginRequest.privateKeyPem,
      publicKeyPem: loginRequest.publicKeyPem,
      sandboxId: pollResult.sandboxId,
      userId: pollResult.userId,
      createdAt: new Date().toISOString()
    })
  }
}
