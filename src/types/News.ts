import { z } from 'zod'

import { AssetIdentitySchema } from '@/types/AssetIdentity'
import { ChainIdSchema } from '@/types/ChainId'
import { TokenIdSchema } from '@/types/crosschain'
import { Keccak256Schema } from '@/types/Keccak256'
import { isNullish } from '@/utils/lang'

const NewsSentimentSchema = z.enum(['bullish', 'bearish', 'neutral', 'unknown'])

export const GetNewsRequestSchema = z.object({
  assetIdentity: AssetIdentitySchema,
  cursor: z.string().nullish()
})
export type GetNewsRequest = z.infer<typeof GetNewsRequestSchema>

export const NewsItemSchema = z.object({
  id: Keccak256Schema,
  headline: z.string(),
  source: z.string(),
  timestamp: z.number(),
  analyzedAt: z.number().nullish(),
  sentiment: NewsSentimentSchema.nullish(),
  sentimentReason: z.string().nullish(),
  summary: z.string().nullish(),
  url: z.string().url()
})

export const NewsStateSchema = z.enum(['analyzing', 'completed'])

export const NewsStateResponseSchema = z.object({
  state: NewsStateSchema,
  items: z.array(NewsItemSchema),
  nextCursor: z.string().nullish()
})
export type NewsStateResponse = z.infer<typeof NewsStateResponseSchema>
export type NewsItem = z.infer<typeof NewsItemSchema>

export type FetchNewsStateParams = {
  apiBaseUrl: string
  request: GetNewsRequest
}

export type NewsServiceParams = {
  readonly apiBaseUrl: string
}

export const NewsCliKindSchema = z.enum(['token', 'perp', 'stock'])

export const FetchNewsCommandOptionsSchema = z
  .object({
    kind: NewsCliKindSchema,
    chainId: ChainIdSchema.nullish(),
    tokenId: TokenIdSchema.nullish(),
    coin: z.string().trim().min(1).nullish(),
    ticker: z.string().trim().min(1).nullish(),
    cursor: z.string().nullish(),
    out: z.string().nullish()
  })
  .superRefine((value, ctx) => {
    switch (value.kind) {
      case 'token': {
        if (isNullish(value.chainId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['chainId'],
            message: '--chain-id is required when --kind token'
          })
        }
        if (isNullish(value.tokenId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['tokenId'],
            message: '--token-id is required when --kind token'
          })
        }
        return
      }
      case 'perp': {
        if (isNullish(value.coin)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['coin'],
            message: '--coin is required when --kind perp'
          })
        }
        return
      }
      case 'stock': {
        if (isNullish(value.ticker)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['ticker'],
            message: '--ticker is required when --kind stock'
          })
        }
        return
      }
    }
  })
export type FetchNewsCommandOptions = z.infer<typeof FetchNewsCommandOptionsSchema>
