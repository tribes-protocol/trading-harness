import { z } from 'zod'

export const CliLoginKeySchema = z.object({
  schema: z.literal('cli-login-key.v1'),
  curve: z.literal('P-256'),
  privateKeyPem: z.string().min(1),
  publicKeyPem: z.string().min(1),
  createdAt: z.string().min(1)
})
export type CliLoginKey = z.infer<typeof CliLoginKeySchema>

export const CliLoginResultSchema = z.object({
  publicKeyPem: z.string().min(1),
  loginUrl: z.string().url(),
  keyPath: z.string().min(1)
})
export type CliLoginResult = z.infer<typeof CliLoginResultSchema>
