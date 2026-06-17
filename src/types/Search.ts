import { z } from 'zod'

import { BasePoolItemSchema, BaseTokenItemSchema } from '@/types/CrossChain'

export const SearchTokenItemSchema = BaseTokenItemSchema
export type SearchTokenItem = z.infer<typeof SearchTokenItemSchema>

export const SearchPoolItemSchema = BasePoolItemSchema
export type SearchPoolItem = z.infer<typeof SearchPoolItemSchema>

export const SearchItemSchema = z.discriminatedUnion('kind', [
  SearchPoolItemSchema,
  SearchTokenItemSchema
])
export type SearchItem = z.infer<typeof SearchItemSchema>

export const TokenSearchCommandOptionsSchema = z.object({
  query: z.string().trim().min(1, 'query is required'),
  out: z.string().nullish()
})
