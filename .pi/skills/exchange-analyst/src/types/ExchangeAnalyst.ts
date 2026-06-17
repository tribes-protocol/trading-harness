import { z } from 'zod'

export const AskExchangeAnalystCliOptionsSchema = z.object({
  query: z.string().min(1)
})
export type AskExchangeAnalystCliOptions = z.infer<typeof AskExchangeAnalystCliOptionsSchema>

export const ExchangeAnalystResponseSchema = z.object({
  result: z.string()
})
export type ExchangeAnalystResponse = z.infer<typeof ExchangeAnalystResponseSchema>

export type ExchangeAnalystServiceParams = {
  readonly apiBaseUrl: string
  readonly apiBearerToken: string
}

export type FetchExchangeAnalystResponseParams = {
  readonly apiBaseUrl: string
  readonly apiBearerToken: string
  readonly query: string
}
