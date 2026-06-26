import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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
const TOKEN_REFRESH_BUFFER_SECONDS = 60
const HARNESS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../')
const TOKEN_CACHE_PATH = resolve(HARNESS_ROOT, '.pi/jwt-token-cache.json')

let memoryCache: JwtTokenCache | null = null

interface IsReusableCacheParams {
  readonly cache: JwtTokenCache
  readonly key: AgentAuthorizationKey
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
  const token = await new SignJWT({ sandboxId: key.sandboxId })
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
    sandboxId: key.sandboxId,
    userId: key.userId,
    createdAt: nowIso,
    updatedAt: nowIso
  })
}

export async function getApiBearerToken(): Promise<string> {
  const key = await readAgentAuthorizationKey()
  if (isNullish(key)) {
    throw new Error('Authorization key missing')
  }

  if (!isNullish(memoryCache)) {
    const reusableMemoryCache = isReusableCache({
      key,
      cache: memoryCache
    })
    if (reusableMemoryCache) {
      return memoryCache.token
    }
  }

  const diskCache = await readDiskCache()
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
