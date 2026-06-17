import { z } from 'zod'

export const TokenSearchCommandOptionsSchema = z.object({
  query: z.string().trim().min(1, 'query is required'),
  out: z.string().nullish()
})
