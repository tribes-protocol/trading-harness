import { z } from 'zod'

export const AskDefiAnalystCliOptionsSchema = z.object({
  query: z.string().min(1)
})
export type AskDefiAnalystCliOptions = z.infer<typeof AskDefiAnalystCliOptionsSchema>

export const DefiAnalystResponseSchema = z.object({
  result: z.string()
})
export type DefiAnalystResponse = z.infer<typeof DefiAnalystResponseSchema>

export type DefiAnalystServiceParams = {
  readonly apiBaseUrl: string
  readonly apiBearerToken: string
}

export type FetchDefiAnalystResponseParams = {
  readonly apiBaseUrl: string
  readonly apiBearerToken: string
  readonly query: string
}
