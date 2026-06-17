import { QuoteRequestSchema } from '@shared/types/quote'
import { z } from 'zod'

export const QuoteCliOptionInputSchema = QuoteRequestSchema.extend({
  out: z.string().nullish()
})
export type QuoteCliOptionInput = z.infer<typeof QuoteCliOptionInputSchema>
