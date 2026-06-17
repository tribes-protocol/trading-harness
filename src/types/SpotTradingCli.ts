import { z } from 'zod'

import { QuoteRequestSchema } from '@/types/quote'

export const QuoteCliOptionInputSchema = QuoteRequestSchema.extend({
  out: z.string().nullish()
})
export type QuoteCliOptionInput = z.infer<typeof QuoteCliOptionInputSchema>
