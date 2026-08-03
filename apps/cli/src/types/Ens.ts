import { z } from 'zod'

import { HexStringSchema } from '@/types/Lang'

// ---------------------------------------------------------------------------
// Raw ENS subgraph payload (api.thegraph.com/subgraphs/name/ensdomains/ens).
// Shaped from the public ENS subgraph schema docs
// (https://docs.ens.domains/web/subgraph): Domain.name plus the derived
// Registration.expiryDate in unix seconds, encoded as a decimal string.
// ---------------------------------------------------------------------------

export const EnsSubgraphDomainsResponseSchema = z.object({
  data: z
    .object({
      domains: z
        .array(
          z.object({
            name: z.string().nullish(),
            registration: z.object({ expiryDate: z.string().nullish() }).nullish()
          })
        )
        .nullish()
    })
    .nullish(),
  errors: z.array(z.object({ message: z.string().nullish() })).nullish()
})
export type EnsSubgraphDomainsResponse = z.infer<typeof EnsSubgraphDomainsResponseSchema>

// ---------------------------------------------------------------------------
// Agent-facing output shapes printed by `tribes-cli ens`.
// ---------------------------------------------------------------------------

export const EnsResolutionSchema = z.object({
  source: z.literal('ens'),
  name: z.string(),
  address: z.string().nullish(),
  avatar: z.string().nullish(),
  records: z.object({
    url: z.string().nullish(),
    twitter: z.string().nullish(),
    github: z.string().nullish()
  })
})
export type EnsResolution = z.infer<typeof EnsResolutionSchema>

const EnsOwnedDomainSchema = z.object({
  name: z.string(),
  expiry: z.number().nullish()
})

export const EnsReverseLookupSchema = z.object({
  source: z.literal('ens'),
  address: z.string(),
  primary_name: z.string().nullish(),
  owned: z.array(EnsOwnedDomainSchema)
})
export type EnsReverseLookup = z.infer<typeof EnsReverseLookupSchema>

// ---------------------------------------------------------------------------
// `tribes-cli ens` command options.
// ---------------------------------------------------------------------------

export const EnsEvmAddressSchema = HexStringSchema.refine(
  (value) => value.length === 42,
  'address must be a 20-byte 0x-prefixed hex string'
)
export type EnsEvmAddress = z.infer<typeof EnsEvmAddressSchema>

export const EnsResolveCommandOptionsSchema = z.object({
  name: z.string().min(1),
  out: z.string().nullish()
})
export type EnsResolveCommandOptions = z.infer<typeof EnsResolveCommandOptionsSchema>

export const EnsReverseCommandOptionsSchema = z.object({
  address: EnsEvmAddressSchema,
  out: z.string().nullish()
})
export type EnsReverseCommandOptions = z.infer<typeof EnsReverseCommandOptionsSchema>
