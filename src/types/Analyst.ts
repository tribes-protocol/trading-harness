import { z } from 'zod'

export const AskAnalystCliOptionsSchema = z.object({
  query: z.string().min(1)
})
export type AskAnalystCliOptions = z.infer<typeof AskAnalystCliOptionsSchema>

export const AnalystResponseSchema = z.object({
  result: z.string()
})
export type AnalystResponse = z.infer<typeof AnalystResponseSchema>

export type AnalystConfig = {
  readonly cliName: string
  readonly description: string
  readonly endpointPath: string
  readonly errorLabel: string
  readonly askDescription: string
}

export type AnalystServiceParams = {
  readonly apiBaseUrl: string
  readonly apiBearerToken: string
  readonly config: AnalystConfig
}

export type FetchAnalystResponseParams = {
  readonly apiBaseUrl: string
  readonly apiBearerToken: string
  readonly endpointPath: string
  readonly errorLabel: string
  readonly query: string
}
