import { afterEach, describe, expect, it, vi } from 'vitest'

// Env.ts requires PRIVY_APP_ID at module load under NODE_ENV=test; set it before
// the imports below (which pull in @/common/Env transitively) evaluate.
vi.hoisted(() => {
  process.env.PRIVY_APP_ID = process.env.PRIVY_APP_ID ?? 'test-privy-app-id'
})

import * as agentQuorum from '@/helpers/AgentQuorum'
import * as authKey from '@/helpers/AuthKey'
import { LoginService } from '@/services/LoginService'
import type { AgentAuthorizationKey } from '@/types/JwtAuth'

const BASE_KEY: AgentAuthorizationKey = {
  schema: 'agent-authorization-key.v1',
  curve: 'P-256',
  privateKeyPem: 'private-key-pem',
  publicKeyPem: 'public-key-pem',
  app: 'web',
  sandboxId: 'sandbox-id',
  userId: 'user-id',
  createdAt: '2026-07-07T00:00:00.000Z'
}

describe('LoginService.syncKeyQuorum', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('backfills keyQuorumId when the control plane returns one (web-booted sandbox)', async () => {
    vi.spyOn(authKey, 'readAgentAuthorizationKey').mockResolvedValue(BASE_KEY)
    vi.spyOn(agentQuorum, 'fetchSandboxKeyQuorum').mockResolvedValue('quorum-123')
    const write = vi.spyOn(authKey, 'writeAgentAuthorizationKey').mockResolvedValue()

    await new LoginService().syncKeyQuorum()

    expect(write).toHaveBeenCalledWith({ ...BASE_KEY, keyQuorumId: 'quorum-123' })
  })

  it('leaves the key untouched when the sandbox is not web-booted (null quorum)', async () => {
    vi.spyOn(authKey, 'readAgentAuthorizationKey').mockResolvedValue(BASE_KEY)
    vi.spyOn(agentQuorum, 'fetchSandboxKeyQuorum').mockResolvedValue(null)
    const write = vi.spyOn(authKey, 'writeAgentAuthorizationKey').mockResolvedValue()

    await new LoginService().syncKeyQuorum()

    expect(write).not.toHaveBeenCalled()
  })

  it('is a no-op when the key already has a keyQuorumId', async () => {
    vi.spyOn(authKey, 'readAgentAuthorizationKey').mockResolvedValue({
      ...BASE_KEY,
      keyQuorumId: 'existing'
    })
    const fetchQuorum = vi.spyOn(agentQuorum, 'fetchSandboxKeyQuorum')
    const write = vi.spyOn(authKey, 'writeAgentAuthorizationKey').mockResolvedValue()

    await new LoginService().syncKeyQuorum()

    expect(fetchQuorum).not.toHaveBeenCalled()
    expect(write).not.toHaveBeenCalled()
  })

  it('is a no-op when there is no authorization key at all', async () => {
    vi.spyOn(authKey, 'readAgentAuthorizationKey').mockResolvedValue(null)
    const fetchQuorum = vi.spyOn(agentQuorum, 'fetchSandboxKeyQuorum')
    const write = vi.spyOn(authKey, 'writeAgentAuthorizationKey').mockResolvedValue()

    await new LoginService().syncKeyQuorum()

    expect(fetchQuorum).not.toHaveBeenCalled()
    expect(write).not.toHaveBeenCalled()
  })
})
