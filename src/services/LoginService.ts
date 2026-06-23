import { generateKeyPair } from 'node:crypto'
import { promisify } from 'node:util'

import { CLI_LOGIN_KEY_PATH, writeCliLoginKey } from '@/helpers/CliLoginKey'
import { type CliLoginResult, CliLoginResultSchema } from '@/types/CliLogin'

const LOGIN_BASE_URL = 'http://localhost:3000'

const generateKeyPairAsync = promisify(generateKeyPair)

function resolveLoginBaseUrl(): string {
  const baseUrl = process.env.CLI_LOGIN_BASE_URL
  if (typeof baseUrl !== 'string' || baseUrl.trim().length === 0) {
    return LOGIN_BASE_URL
  }
  return baseUrl
}

export class LoginService {
  async generateLogin(): Promise<CliLoginResult> {
    const { privateKey, publicKey } = await generateKeyPairAsync('ec', {
      namedCurve: 'P-256'
    })

    const privateKeyPem = privateKey.export({
      type: 'pkcs8',
      format: 'pem'
    })
    const publicKeyPem = publicKey.export({
      type: 'spki',
      format: 'pem'
    })

    await writeCliLoginKey({
      schema: 'cli-login-key.v1',
      curve: 'P-256',
      privateKeyPem: privateKeyPem.toString(),
      publicKeyPem: publicKeyPem.toString(),
      createdAt: new Date().toISOString()
    })

    const publicKeyPemString = publicKeyPem.toString()
    const loginUrl = new URL('/agents/login-cli', resolveLoginBaseUrl())
    loginUrl.searchParams.set('pubkey', publicKeyPemString)

    return CliLoginResultSchema.parse({
      publicKeyPem: publicKeyPemString,
      loginUrl: loginUrl.toString(),
      keyPath: CLI_LOGIN_KEY_PATH
    })
  }
}
