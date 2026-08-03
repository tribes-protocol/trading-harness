import { z } from 'zod'

export const WebSearchCliOptionsSchema = z.object({
  query: z.string().min(1)
})
export type WebSearchCliOptions = z.infer<typeof WebSearchCliOptionsSchema>

export const WebExtractCliOptionsSchema = z.object({
  url: z.string().min(1)
})
export type WebExtractCliOptions = z.infer<typeof WebExtractCliOptionsSchema>

export const WebSearchResultSchema = z.object({
  title: z.string(),
  url: z.string(),
  content: z.string(),
  publishedDate: z.string().nullish()
})

export const WebSearchResponseSchema = z.object({
  query: z.string(),
  results: z.array(WebSearchResultSchema)
})
export type WebSearchResponse = z.infer<typeof WebSearchResponseSchema>

export const WebExtractResultSchema = z.object({
  url: z.string(),
  title: z.string().nullish(),
  rawContent: z.string()
})

export const WebExtractResponseSchema = z.object({
  url: z.string(),
  results: z.array(WebExtractResultSchema)
})
export type WebExtractResponse = z.infer<typeof WebExtractResponseSchema>

export type WebSearchServiceParams = {
  readonly apiBaseUrl: string
  readonly apiBearerToken: string
}

export type FetchWebSearchParams = {
  readonly apiBaseUrl: string
  readonly apiBearerToken: string
  readonly query: string
}

export type FetchWebExtractParams = {
  readonly apiBaseUrl: string
  readonly apiBearerToken: string
  readonly url: string
}
