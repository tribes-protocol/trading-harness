import { z } from 'zod'

export const SandboxAppSchema = z.enum(['external', 'web', 'sandboxd'])
export type SandboxApp = z.infer<typeof SandboxAppSchema>

export const AgentAuthorizationKeySchema = z.object({
  schema: z.literal('agent-authorization-key.v1'),
  curve: z.literal('P-256'),
  privateKeyPem: z.string().min(1),
  publicKeyPem: z.string().min(1),
  app: SandboxAppSchema.nullish(),
  sandboxId: z.string().min(1),
  userId: z.string().min(1),
  // The agent-wallet key quorum bound to this key. Present only after a genuine
  // login (remote login, or a web-booted sandbox self-heal); a host-minted key
  // that was never logged in has none, so its absence means "not logged in".
  keyQuorumId: z.string().min(1).nullish(),
  createdAt: z.string().min(1)
})
export type AgentAuthorizationKey = z.infer<typeof AgentAuthorizationKeySchema>

export const JwtTokenClaimsSchema = z.object({
  sub: z.string().min(1),
  sandboxId: z.string().min(1),
  app: SandboxAppSchema.nullish(),
  exp: z.number().int().positive()
})
export type JwtTokenClaims = z.infer<typeof JwtTokenClaimsSchema>

export const JwtTokenCacheSchema = z.object({
  schema: z.literal('jwt-token-cache.v1'),
  token: z.string().min(1),
  expiresAtEpochSeconds: z.number().int().positive(),
  app: SandboxAppSchema.nullish(),
  sandboxId: z.string().min(1),
  userId: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
})
export type JwtTokenCache = z.infer<typeof JwtTokenCacheSchema>
