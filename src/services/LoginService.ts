import { generateKeyPair, randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

import { API_BASE_URL, WEB_BASE_URL } from '@/common/Env'
import { retry } from '@/helpers/AsyncControl'
import { writeAgentAuthorizationKey } from '@/helpers/AuthKey'
import { writeCliLoginKey } from '@/helpers/CliLoginKey'
import { getApiBearerToken } from '@/helpers/Jwt'
import { openUrlInBrowser } from '@/helpers/OpenUrlInBrowser'
import { type CliLoginPollResponse, CliLoginPollResponseSchema } from '@/types/CliLogin'

const LOGIN_POLL_INTERVAL_MS = 2_000
const LOGIN_POLL_TIMEOUT_MS = 3 * 60_000
const LOGIN_POLL_MAX_RETRIES = LOGIN_POLL_TIMEOUT_MS / LOGIN_POLL_INTERVAL_MS

const ENV_PATH = resolve(process.cwd(), '.env')
const ENV_PASSTHROUGH = ['PRIVY_APP_ID'] as const

const generateKeyPairAsync = promisify(generateKeyPair)

function bold(text: string): string {
  return `\x1b[1m${text}\x1b[22m`
}

function blue(text: string): string {
  return `\x1b[34m${text}\x1b[39m`
}

function parseLoginPollResponse(data: unknown): CliLoginPollResponse {
  return CliLoginPollResponseSchema.parse(data)
}

export type LoginRequestContext = {
  readonly requestId: string
  readonly privateKeyPem: string
  readonly publicKeyPem: string
  // base64url(DER) of the SPKI public key
  readonly publicKeyCompact: string
  readonly loginUrl: string
}

export class LoginService {
  private async readDotEnv(): Promise<Map<string, string>> {
    const env = new Map<string, string>()
    try {
      const content = await readFile(ENV_PATH, 'utf8')
      for (const line of content.split(/\r?\n/u)) {
        const separator = line.indexOf('=')
        const key = line.slice(0, separator).trim()
        if (separator > 0 && key.length > 0 && !key.startsWith('#')) {
          env.set(key, line.slice(separator + 1))
        }
      }
    } catch {
      // No existing .env yet — start fresh.
    }
    return env
  }

  private async writeAuthEnv(): Promise<void> {
    const env = await this.readDotEnv()
    for (const name of ENV_PASSTHROUGH) {
      const value = process.env[name]
      if (value) env.set(name, value)
    }
    env.set('API_BEARER_TOKEN', await getApiBearerToken())

    const body = [...env].map(([key, value]) => `${key}=${value}`).join('\n')
    await writeFile(ENV_PATH, `${body}\n`, { mode: 0o600 })
  }

  private async pollLoginResult(requestId: string): Promise<CliLoginPollResponse> {
    const resultUrl = new URL('/agent/remote/login/result', API_BASE_URL)
    resultUrl.searchParams.set('id', requestId)

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

  async runLogin(): Promise<void> {
    const loginRequest = await this.createLoginRequest()

    process.stdout.write(`${bold('Log in to Tribes')}\n`)
    process.stdout.write(`${bold('Open this URL and approve this agent:')}\n\n`)
    process.stdout.write(`${bold('URL:')}\u00A0${blue(loginRequest.loginUrl)}\n\n`)
    process.stdout.write('Waiting for you to finish signing in...\n')

    const opened = await openUrlInBrowser(loginRequest.loginUrl)
    if (!opened) {
      process.stdout.write('Could not auto-open browser. Use the URL above to continue.\n')
    }

    await this.finalizeLogin(loginRequest)
    process.stdout.write('Logged in.\n')
  }

  private async createLoginRequest(): Promise<LoginRequestContext> {
    const requestId = randomUUID()
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
    loginUrl.searchParams.set('id', requestId)
    loginUrl.searchParams.set('pubKey', publicKeyCompact)

    return {
      requestId,
      privateKeyPem,
      publicKeyPem,
      publicKeyCompact,
      loginUrl: loginUrl.toString()
    }
  }

  private async finalizeLogin(loginRequest: LoginRequestContext): Promise<void> {
    const pollResult = await this.pollLoginResult(loginRequest.requestId)

    await writeAgentAuthorizationKey({
      schema: 'agent-authorization-key.v1',
      curve: 'P-256',
      privateKeyPem: loginRequest.privateKeyPem,
      publicKeyPem: loginRequest.publicKeyPem,
      app: 'external',
      sandboxId: pollResult.sandboxId,
      userId: pollResult.userId,
      createdAt: new Date().toISOString()
    })

    await this.writeAuthEnv()
  }
}
