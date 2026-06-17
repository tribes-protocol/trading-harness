import { z } from 'zod'

export const AskFundamentalsAnalystCliOptionsSchema = z.object({
  query: z.string().min(1)
})
export type AskFundamentalsAnalystCliOptions = z.infer<
  typeof AskFundamentalsAnalystCliOptionsSchema
>

export const FundamentalsAnalystResponseSchema = z.object({
  result: z.string()
})
export type FundamentalsAnalystResponse = z.infer<typeof FundamentalsAnalystResponseSchema>

export type FundamentalsAnalystServiceParams = {
  readonly apiBaseUrl: string
  readonly apiBearerToken: string
}

export type FetchFundamentalsAnalystResponseParams = {
  readonly apiBaseUrl: string
  readonly apiBearerToken: string
  readonly query: string
}
