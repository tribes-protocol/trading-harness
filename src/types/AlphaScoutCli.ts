import { z } from 'zod'

import {
  BirdEyeChainSchema,
  BirdEyeSearchTargetSchema,
  BirdEyeSmartMoneyIntervalSchema,
  BirdEyeSmartMoneySortSchema,
  BirdEyeSortTypeSchema,
  BirdEyeTraderStyleSchema
} from '@/types/BirdEye'
import { NansenChainSchema, NansenHistoricalChainSchema } from '@/types/Nansen'

const OutSchema = z.string().nullish()
const PageSchema = z.coerce.number().int().min(1).default(1)
const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')

// `--chains eth,base` -> ['ethereum', 'base'] is not attempted: the provider
// names are exact, so a bad one fails loudly instead of being guessed at.
const NansenChainsSchema = z
  .string()
  .transform((value) => value.split(',').map((chain) => chain.trim().toLowerCase()))
  .pipe(z.array(NansenChainSchema).min(1))

const NansenHistoricalChainsSchema = z
  .string()
  .transform((value) => value.split(',').map((chain) => chain.trim().toLowerCase()))
  .pipe(z.array(NansenHistoricalChainSchema).min(1))

// Trending sorts by rank, where rank 1 is the most trending — so ascending is
// the top of the list. `desc` returns the bottom.
export const TrendingCommandOptionsSchema = z.object({
  chain: BirdEyeChainSchema.default('solana'),
  sortType: BirdEyeSortTypeSchema.default('asc'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  out: OutSchema
})

export const NewListingsCommandOptionsSchema = z.object({
  chain: BirdEyeChainSchema.default('solana'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  memePlatform: z.boolean().default(false),
  out: OutSchema
})

export const SmartMoneyTokensCommandOptionsSchema = z.object({
  interval: BirdEyeSmartMoneyIntervalSchema.default('1d'),
  traderStyle: BirdEyeTraderStyleSchema.default('all'),
  sortBy: BirdEyeSmartMoneySortSchema.default('smart_traders_no'),
  sortType: BirdEyeSortTypeSchema.default('desc'),
  limit: z.coerce.number().int().min(1).max(20).default(20),
  out: OutSchema
})

export const TokenSearchCommandOptionsSchema = z.object({
  query: z.string().trim().min(1, 'query is required'),
  chain: BirdEyeChainSchema.default('solana'),
  target: BirdEyeSearchTargetSchema.default('token'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  out: OutSchema
})

export const RecentlyUpdatedCommandOptionsSchema = z.object({
  network: z.string().trim().min(1).default('eth'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  out: OutSchema
})

export const SmartMoneyChainCommandOptionsSchema = z.object({
  chains: NansenChainsSchema,
  limit: z.coerce.number().int().min(1).max(1000).default(20),
  page: PageSchema,
  out: OutSchema
})

export const SmartMoneyHistoricalCommandOptionsSchema = z.object({
  chains: NansenHistoricalChainsSchema,
  from: DateOnlySchema,
  to: DateOnlySchema.nullish(),
  limit: z.coerce.number().int().min(1).max(1000).default(20),
  page: PageSchema,
  out: OutSchema
})

export const SmartMoneyGlobalCommandOptionsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(20),
  page: PageSchema,
  out: OutSchema
})
