import { BasePoolItemSchema, BaseTokenItemSchema } from '@shared/types/crosschain'
import { z } from 'zod'

export const SearchTokenItemSchema = BaseTokenItemSchema
export type SearchTokenItem = z.infer<typeof SearchTokenItemSchema>

export const SearchPoolItemSchema = BasePoolItemSchema
export type SearchPoolItem = z.infer<typeof SearchPoolItemSchema>

export const SearchItemSchema = z.discriminatedUnion('kind', [
  SearchPoolItemSchema,
  SearchTokenItemSchema
])
export type SearchItem = z.infer<typeof SearchItemSchema>
