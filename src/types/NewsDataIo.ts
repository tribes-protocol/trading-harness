import { z } from 'zod'

import { isNullish } from '@/utils/Lang'

// NewsData.io direct-API types (base https://newsdata.io, paths /api/1/latest
// and /api/1/crypto).
//
// Raw API quirks this file defends against:
// - Plan-gated fields are returned as PLACEHOLDER STRINGS, not omitted (e.g.
//   "ONLY AVAILABLE IN PAID PLANS"), so array-typed fields can arrive as plain
//   strings — raw fields are typed as unions and coerced during normalization.
// - Error responses replace the articles array with {message, code}, so the
//   response envelope is a discriminated union on `status`.

// Documented category enum for /api/1/latest (the crypto endpoint has no
// category filter).
const NewsDataIoCategorySchema = z.enum([
  'business',
  'crime',
  'domestic',
  'education',
  'entertainment',
  'environment',
  'food',
  'health',
  'lifestyle',
  'other',
  'politics',
  'science',
  'sports',
  'technology',
  'top',
  'tourism',
  'world'
])

// Fields the provider documents as arrays but plan-gates into placeholder strings.
const NewsDataIoRawStringListSchema = z.union([z.string().array(), z.string()]).nullish()

const NewsDataIoRawArticleSchema = z.object({
  article_id: z.string().min(1),
  title: z.string(),
  link: z.string(),
  description: z.string().nullish(),
  pubDate: z.string(),
  pubDateTZ: z.string().nullish(),
  source_id: z.string().nullish(),
  source_name: z.string().nullish(),
  language: z.string().nullish(),
  country: NewsDataIoRawStringListSchema,
  category: NewsDataIoRawStringListSchema,
  sentiment: z.string().nullish()
})
export type NewsDataIoRawArticle = z.infer<typeof NewsDataIoRawArticleSchema>

const NewsDataIoSuccessResponseSchema = z.object({
  status: z.literal('success'),
  totalResults: z.number().nullish(),
  results: NewsDataIoRawArticleSchema.array().nullish(),
  nextPage: z.string().nullish()
})
export type NewsDataIoSuccessResponse = z.infer<typeof NewsDataIoSuccessResponseSchema>

const NewsDataIoErrorResponseSchema = z.object({
  status: z.literal('error'),
  results: z
    .object({
      message: z.string().nullish(),
      code: z.string().nullish()
    })
    .nullish()
})

export const NewsDataIoResponseSchema = z.discriminatedUnion('status', [
  NewsDataIoSuccessResponseSchema,
  NewsDataIoErrorResponseSchema
])
export type NewsDataIoResponse = z.infer<typeof NewsDataIoResponseSchema>

// Normalized internal shape. Free-tier placeholder strings are coerced to null
// (or to empty arrays for array fields); sentiment is kept only when it is a
// real provider value.
export const NewsDataIoSentimentSchema = z.enum(['positive', 'negative', 'neutral'])
export type NewsDataIoSentiment = z.infer<typeof NewsDataIoSentimentSchema>

// pub_date keeps the provider's 'YYYY-MM-DD HH:MM:SS' wall-clock string; the
// zone is named separately by pub_date_tz (typically 'UTC').
const NewsDataIoHeadlineSchema = z.object({
  article_id: z.string(),
  title: z.string(),
  link: z.string(),
  description: z.string().nullish(),
  pub_date: z.string(),
  pub_date_tz: z.string().nullish(),
  source_id: z.string().nullish(),
  source_name: z.string().nullish(),
  language: z.string().nullish(),
  countries: z.string().array(),
  categories: z.string().array(),
  sentiment: NewsDataIoSentimentSchema.nullish()
})
export type NewsDataIoHeadline = z.infer<typeof NewsDataIoHeadlineSchema>

export const NewsDataIoHeadlinesSchema = z.object({
  source: z.literal('newsdataio'),
  total_results: z.number(),
  next_page: z.string().nullish(),
  items: NewsDataIoHeadlineSchema.array()
})
export type NewsDataIoHeadlines = z.infer<typeof NewsDataIoHeadlinesSchema>

// CLI option parsing: comma-separated list flags are split, trimmed, and
// validated per-item (the provider caps each list filter at 5 values).
function splitCsv(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

const NewsDataIoCoinListSchema = z
  .string()
  .transform(splitCsv)
  .pipe(
    z
      .string()
      .regex(/^[a-z0-9]{1,15}$/, 'coin symbols must be lowercase short-forms, e.g. btc,eth')
      .array()
      .min(1)
      .max(5)
  )

const NewsDataIoCategoryListSchema = z
  .string()
  .transform(splitCsv)
  .pipe(NewsDataIoCategorySchema.array().min(1).max(5))

const NewsDataIoCountryListSchema = z
  .string()
  .transform(splitCsv)
  .pipe(
    z
      .string()
      .regex(/^[a-z]{2}$/, 'countries must be lowercase ISO-3166 alpha-2 codes, e.g. us,gb')
      .array()
      .min(1)
      .max(5)
  )

const NewsDataIoLanguageListSchema = z
  .string()
  .transform(splitCsv)
  .pipe(
    z
      .string()
      .regex(/^[a-z]{2,3}$/, 'languages must be lowercase codes, e.g. en')
      .array()
      .min(1)
      .max(5)
  )

export const NewsDataIoHeadlinesCommandOptionsSchema = z
  .object({
    query: z.string().trim().min(1).max(512).nullish(),
    coin: NewsDataIoCoinListSchema.nullish(),
    category: NewsDataIoCategoryListSchema.nullish(),
    country: NewsDataIoCountryListSchema.nullish(),
    language: NewsDataIoLanguageListSchema.default('en'),
    timeframe: z.coerce.number().int().min(1).max(48).nullish(),
    size: z.coerce.number().int().min(1).max(50).default(10),
    page: z.string().trim().min(1).nullish(),
    out: z.string().nullish()
  })
  .superRefine((value, ctx) => {
    if (isNullish(value.coin) && isNullish(value.query) && isNullish(value.category)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'provide at least one of --query, --coin, or --category'
      })
    }
    if (!isNullish(value.coin) && !isNullish(value.category)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['category'],
        message:
          '--category cannot be combined with --coin: the NewsData.io crypto endpoint does not support category filters'
      })
    }
    if (!isNullish(value.coin) && !isNullish(value.country)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['country'],
        message:
          '--country cannot be combined with --coin: the NewsData.io crypto endpoint does not support country filters'
      })
    }
  })
export type NewsDataIoHeadlinesCommandOptions = z.infer<
  typeof NewsDataIoHeadlinesCommandOptionsSchema
>
