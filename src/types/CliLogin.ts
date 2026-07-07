import { z } from 'zod'

export const CliLoginKeySchema = z.object({
  schema: z.literal('cli-login-key.v1'),
  curve: z.literal('P-256'),
  privateKeyPem: z.string().min(1),
  publicKeyPem: z.string().min(1),
  createdAt: z.string().min(1)
})
export type CliLoginKey = z.infer<typeof CliLoginKeySchema>

export const CliLoginPollResponseSchema = z.object({
  sandboxId: z.string().min(1),
  userId: z.string().min(1),
  // Key quorum bound as an additional signer on the agent wallet during the
  // browser approval — its presence in the authorization key is what marks the
  // agent as genuinely logged in.
  quorumId: z.string().min(1)
})
export type CliLoginPollResponse = z.infer<typeof CliLoginPollResponseSchema>
