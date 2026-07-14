import { z } from 'zod'

import {
  CoinGeckoDaysSchema,
  CoinGeckoIntervalSchema,
  CoinGeckoOhlcDaysSchema,
  SupplyKindSchema,
  TickersOrderSchema
} from '@/types/CoinGecko'

const CoinIdSchema = z.string().trim().min(1, 'id is required')
const NetworkSchema = z.string().trim().min(1, 'network is required')
const AddressSchema = z.string().trim().min(1, 'address is required')
const VsSchema = z.string().trim().min(1).default('usd')
const OutSchema = z.string().nullish()
const FromSchema = z.coerce.number().int().nonnegative().nullish()
const ToSchema = z.coerce.number().int().nonnegative().nullish()
const ChartLimitSchema = z.coerce.number().int().min(1).max(5000).nullish()

export const CoinCommandOptionsSchema = z.object({
  id: CoinIdSchema,
  community: z.boolean().default(false),
  developer: z.boolean().default(false),
  out: OutSchema
})

export const CoinSearchCommandOptionsSchema = z.object({
  query: z.string().trim().min(1, 'query is required'),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  out: OutSchema
})

export const CoinHistoryCommandOptionsSchema = z.object({
  id: CoinIdSchema,
  date: z.string().regex(/^\d{2}-\d{2}-\d{4}$/, 'date must be dd-mm-yyyy'),
  out: OutSchema
})

export const MarketChartCommandOptionsSchema = z.object({
  id: CoinIdSchema,
  vs: VsSchema,
  days: CoinGeckoDaysSchema.default(1),
  from: FromSchema,
  to: ToSchema,
  interval: CoinGeckoIntervalSchema.nullish(),
  precision: z.enum(['full', '0', '1', '2', '3', '4', '5', '6']).nullish(),
  limit: ChartLimitSchema,
  out: OutSchema
})

export const OhlcCommandOptionsSchema = z.object({
  id: CoinIdSchema,
  vs: VsSchema,
  days: CoinGeckoOhlcDaysSchema.default('1'),
  from: FromSchema,
  to: ToSchema,
  interval: CoinGeckoIntervalSchema.nullish(),
  limit: ChartLimitSchema,
  out: OutSchema
})

export const SupplyChartCommandOptionsSchema = z.object({
  id: CoinIdSchema,
  kind: SupplyKindSchema,
  days: CoinGeckoDaysSchema.default(1),
  from: FromSchema,
  to: ToSchema,
  limit: ChartLimitSchema,
  out: OutSchema
})

export const TickersCommandOptionsSchema = z.object({
  id: CoinIdSchema,
  exchangeIds: z.string().nullish(),
  page: z.coerce.number().int().min(1).nullish(),
  order: TickersOrderSchema.nullish(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  out: OutSchema
})

export const ContractCommandOptionsSchema = z.object({
  network: NetworkSchema,
  address: AddressSchema,
  out: OutSchema
})

export const ContractMarketChartCommandOptionsSchema = z.object({
  network: NetworkSchema,
  address: AddressSchema,
  vs: VsSchema,
  days: CoinGeckoDaysSchema.default(1),
  from: FromSchema,
  to: ToSchema,
  limit: ChartLimitSchema,
  out: OutSchema
})

export const TokenPriceCommandOptionsSchema = z.object({
  platform: z.string().trim().min(1, 'platform is required'),
  addresses: z.string().trim().min(1, 'addresses is required'),
  vs: z.string().trim().min(1).default('usd'),
  out: OutSchema
})

export const NoArgCommandOptionsSchema = z.object({
  out: OutSchema
})
