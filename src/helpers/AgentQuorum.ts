import { API_BASE_URL } from '@/common/Env'
import { getApiBearerToken } from '@/helpers/Jwt'
import { SandboxKeyQuorumResponseSchema } from '@/types/AgentQuorum'

// Ask the control plane for this sandbox's agent key quorum id. The endpoint only
// returns one for a web-booted sandbox (whose browser boot bound the quorum as a
// wallet signer); every other origin — and any failure — yields null, which the
// caller reads as "not logged in".
export async function fetchSandboxKeyQuorum(): Promise<string | null> {
  const token = await getApiBearerToken()
  const response = await fetch(new URL('/agent/quorum', API_BASE_URL), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    }
  })
  if (!response.ok) {
    return null
  }
  const data: unknown = await response.json()
  return SandboxKeyQuorumResponseSchema.parse(data).quorumId ?? null
}
