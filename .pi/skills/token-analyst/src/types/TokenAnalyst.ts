import { z } from 'zod'

export const AskTokenAnalystCliOptionsSchema = z.object({
  query: z.string().min(1)
})
export type AskTokenAnalystCliOptions = z.infer<typeof AskTokenAnalystCliOptionsSchema>

export const TokenAnalystResponseSchema = z.object({
  result: z.string()
})
export type TokenAnalystResponse = z.infer<typeof TokenAnalystResponseSchema>

export type TokenAnalystServiceParams = {
  readonly apiBaseUrl: string
  readonly apiBearerToken: string
}

export type FetchTokenAnalystResponseParams = {
  readonly apiBaseUrl: string
  readonly apiBearerToken: string
  readonly query: string
}
