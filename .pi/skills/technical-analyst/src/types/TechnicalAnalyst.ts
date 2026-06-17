import { z } from 'zod'

export const AskTechnicalAnalystCliOptionsSchema = z.object({
  query: z.string().min(1)
})
export type AskTechnicalAnalystCliOptions = z.infer<typeof AskTechnicalAnalystCliOptionsSchema>

export const TechnicalAnalystResponseSchema = z.object({
  result: z.string()
})
export type TechnicalAnalystResponse = z.infer<typeof TechnicalAnalystResponseSchema>

export type TechnicalAnalystServiceParams = {
  readonly apiBaseUrl: string
  readonly apiBearerToken: string
}

export type FetchTechnicalAnalystResponseParams = {
  readonly apiBaseUrl: string
  readonly apiBearerToken: string
  readonly query: string
}
