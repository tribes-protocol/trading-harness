import { z } from 'zod'

export const AskMarketStrategistCliOptionsSchema = z.object({
  query: z.string().min(1)
})
export type AskMarketStrategistCliOptions = z.infer<typeof AskMarketStrategistCliOptionsSchema>

export const MarketStrategistResponseSchema = z.object({
  result: z.string()
})
export type MarketStrategistResponse = z.infer<typeof MarketStrategistResponseSchema>

export type MarketStrategistServiceParams = {
  readonly apiBaseUrl: string
  readonly apiBearerToken: string
}

export type FetchMarketStrategistResponseParams = {
  readonly apiBaseUrl: string
  readonly apiBearerToken: string
  readonly query: string
}
