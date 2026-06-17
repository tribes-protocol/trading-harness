import { z } from 'zod'

export const AskAlphaScoutCliOptionsSchema = z.object({
  query: z.string().min(1)
})
export type AskAlphaScoutCliOptions = z.infer<typeof AskAlphaScoutCliOptionsSchema>

export const AlphaScoutResponseSchema = z.object({
  result: z.string()
})
export type AlphaScoutResponse = z.infer<typeof AlphaScoutResponseSchema>

export type AlphaScoutServiceParams = {
  readonly apiBaseUrl: string
  readonly apiBearerToken: string
}

export type FetchAlphaScoutResponseParams = {
  readonly apiBaseUrl: string
  readonly apiBearerToken: string
  readonly query: string
}
