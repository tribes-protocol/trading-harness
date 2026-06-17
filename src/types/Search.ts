import { z } from 'zod'

import { BasePoolItemSchema, BaseTokenItemSchema } from '@/types/crosschain'

export const SearchTokenItemSchema = BaseTokenItemSchema
export type SearchTokenItem = z.infer<typeof SearchTokenItemSchema>

export const SearchPoolItemSchema = BasePoolItemSchema
export type SearchPoolItem = z.infer<typeof SearchPoolItemSchema>

export const SearchItemSchema = z.discriminatedUnion('kind', [
  SearchPoolItemSchema,
  SearchTokenItemSchema
])
export type SearchItem = z.infer<typeof SearchItemSchema>
