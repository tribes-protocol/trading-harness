import { z } from 'zod'

export const EnsResolutionSchema = z.object({
  source: z.literal('ens-mainnet'),
  query: z.string().min(1),
  address: z.string().nullish(),
  name: z.string().nullish(),
  resolved: z.boolean()
})
export type EnsResolution = z.infer<typeof EnsResolutionSchema>

export const EnsResolveCommandOptionsSchema = z
  .object({
    name: z.string().trim().min(1).nullish(),
    address: z
      .string()
      .trim()
      .regex(/^0x[0-9a-fA-F]{40}$/, 'expected a 0x EVM address')
      .nullish(),
    out: z.string().nullish()
  })
  .refine((v) => (v.name ? !v.address : Boolean(v.address)), {
    message: 'Provide exactly one of --name or --address'
  })
export type EnsResolveCommandOptions = z.infer<typeof EnsResolveCommandOptionsSchema>
