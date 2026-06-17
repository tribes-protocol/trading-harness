import { z } from 'zod'

export const AskResearchAnalystCliOptionsSchema = z.object({
  query: z.string().min(1)
})
export type AskResearchAnalystCliOptions = z.infer<typeof AskResearchAnalystCliOptionsSchema>

export const ResearchAnalystResponseSchema = z.object({
  result: z.string()
})
export type ResearchAnalystResponse = z.infer<typeof ResearchAnalystResponseSchema>

export type ResearchAnalystServiceParams = {
  readonly apiBaseUrl: string
  readonly apiBearerToken: string
}

export type FetchResearchAnalystResponseParams = {
  readonly apiBaseUrl: string
  readonly apiBearerToken: string
  readonly query: string
}
