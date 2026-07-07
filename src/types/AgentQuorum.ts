import { z } from 'zod'

// Response of GET /agent/quorum (sandbox-authed) on the control plane. quorumId
// is null for a sandbox that was not booted from the web trading-agent flow, so
// the caller treats null as "not logged in".
export const SandboxKeyQuorumResponseSchema = z.object({
  quorumId: z.string().min(1).nullish()
})
export type SandboxKeyQuorumResponse = z.infer<typeof SandboxKeyQuorumResponseSchema>
