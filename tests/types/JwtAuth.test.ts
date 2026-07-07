import { describe, expect, it } from 'vitest'

import { AgentAuthorizationKeySchema } from '@/types/JwtAuth'

const BASE = {
  schema: 'agent-authorization-key.v1',
  curve: 'P-256',
  privateKeyPem: 'private-key-pem',
  publicKeyPem: 'public-key-pem',
  sandboxId: 'sandbox-id',
  userId: 'user-id',
  createdAt: '2026-07-07T00:00:00.000Z'
}

describe('AgentAuthorizationKeySchema keyQuorumId', () => {
  it('parses a host-minted key with no keyQuorumId (logged-out shape)', () => {
    const parsed = AgentAuthorizationKeySchema.parse(BASE)
    expect(parsed.keyQuorumId).toBeUndefined()
  })

  it('parses a logged-in key that carries a keyQuorumId', () => {
    const parsed = AgentAuthorizationKeySchema.parse({ ...BASE, keyQuorumId: 'quorum-123' })
    expect(parsed.keyQuorumId).toBe('quorum-123')
  })

  it('rejects an empty keyQuorumId', () => {
    expect(() => AgentAuthorizationKeySchema.parse({ ...BASE, keyQuorumId: '' })).toThrow()
  })
})
