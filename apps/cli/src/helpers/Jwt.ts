import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { decodeJwt, importPKCS8, SignJWT } from 'jose'

import { readAgentAuthorizationKey } from '@/helpers/AuthKey'
import {
  type AgentAuthorizationKey,
  type JwtTokenCache,
  JwtTokenCacheSchema,
  type JwtTokenClaims,
  JwtTokenClaimsSchema
} from '@/types/JwtAuth'
import { ensureJsonTreeString, isNullish } from '@/utils/Lang'

const TOKEN_TTL = '7d'
const LOGIN_PROOF_TTL = '5m'
const TOKEN_REFRESH_BUFFER_SECONDS = 60
const TOKEN_CACHE_PATH = resolve(process.cwd(), '.tribes/jwt-token-cache.json')

let memoryCache: JwtTokenCache | null = null

interface IsReusableCacheParams {
  readonly cache: JwtTokenCache
  readonly key: AgentAuthorizationKey
}

interface GetApiBearerTokenParams {
  readonly force?: boolean
}

interface WriteDiskCacheParams {
  readonly cache: JwtTokenCache
}

function nowEpochSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

function decodeTokenClaims(token: string): JwtTokenClaims | null {
  try {
    const claims = decodeJwt(token)
    return JwtTokenClaimsSchema.parse(claims)
  } catch {
    return null
  }
}

function isReusableCache(params: IsReusableCacheParams): boolean {
  const { cache, key } = params
  const epochSeconds = nowEpochSeconds()

  if (cache.userId !== key.userId || cache.sandboxId !== key.sandboxId) {
    return false
  }
  if (cache.expiresAtEpochSeconds <= epochSeconds + TOKEN_REFRESH_BUFFER_SECONDS) {
    return false
  }

  const claims = decodeTokenClaims(cache.token)
  if (isNullish(claims)) {
    return false
  }
  if (claims.sub !== key.userId || claims.sandboxId !== key.sandboxId) {
    return false
  }
  if (claims.exp !== cache.expiresAtEpochSeconds) {
    return false
  }
  return claims.exp > epochSeconds + TOKEN_REFRESH_BUFFER_SECONDS
}

async function readDiskCache(): Promise<JwtTokenCache | null> {
  try {
    const text = await readFile(TOKEN_CACHE_PATH, 'utf8')
    const parsed: unknown = JSON.parse(text)
    return JwtTokenCacheSchema.parse(parsed)
  } catch {
    return null
  }
}

async function writeDiskCache(params: WriteDiskCacheParams): Promise<void> {
  await mkdir(dirname(TOKEN_CACHE_PATH), { recursive: true })
  await writeFile(TOKEN_CACHE_PATH, ensureJsonTreeString(params.cache), {
    encoding: 'utf8',
    mode: 0o600
  })
}

async function mintTokenCache(key: AgentAuthorizationKey): Promise<JwtTokenCache> {
  const privateKey = await importPKCS8(key.privateKeyPem, 'ES256')
  const app = key.app ?? undefined
  const token = await new SignJWT({ sandboxId: key.sandboxId, app })
    .setProtectedHeader({ alg: 'ES256' })
    .setSubject(key.userId)
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(privateKey)

  const claims = decodeTokenClaims(token)
  if (isNullish(claims)) {
    throw new Error('Unable to decode freshly minted JWT token claims')
  }

  const nowIso = new Date().toISOString()
  return JwtTokenCacheSchema.parse({
    schema: 'jwt-token-cache.v1',
    token,
    expiresAtEpochSeconds: claims.exp,
    app,
    sandboxId: key.sandboxId,
    userId: key.userId,
    createdAt: nowIso,
    updatedAt: nowIso
  })
}

interface SignLoginProofParams {
  readonly privateKeyPem: string
  readonly requestId: string
}

// Proof-of-possession for the login-result poll: an ES256 JWT signed with the
// login's own private key, with `sub` bound to the login requestId. The server
// (verifyRemoteLoginProof) verifies it against the stored agentPublicKey.
export async function signLoginProof(params: SignLoginProofParams): Promise<string> {
  const privateKey = await importPKCS8(params.privateKeyPem, 'ES256')
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256' })
    .setSubject(params.requestId)
    .setExpirationTime(LOGIN_PROOF_TTL)
    .sign(privateKey)
}

export async function getApiBearerToken(params: GetApiBearerTokenParams = {}): Promise<string> {
  const key = await readAgentAuthorizationKey()
  if (isNullish(key)) {
    throw new Error('Authorization key missing')
  }

  if (!params.force && !isNullish(memoryCache)) {
    const reusableMemoryCache = isReusableCache({
      key,
      cache: memoryCache
    })
    if (reusableMemoryCache) {
      return memoryCache.token
    }
  }

  const diskCache = !params.force ? await readDiskCache() : null
  if (!isNullish(diskCache)) {
    const reusableDiskCache = isReusableCache({
      key,
      cache: diskCache
    })
    if (reusableDiskCache) {
      memoryCache = diskCache
      return diskCache.token
    }
  }

  const freshCache = await mintTokenCache(key)
  await writeDiskCache({ cache: freshCache })
  memoryCache = freshCache
  return freshCache.token
}
