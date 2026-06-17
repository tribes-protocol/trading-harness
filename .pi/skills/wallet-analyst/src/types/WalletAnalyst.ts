import { z } from 'zod'

export const AskWalletAnalystCliOptionsSchema = z.object({
  query: z.string().min(1)
})
export type AskWalletAnalystCliOptions = z.infer<typeof AskWalletAnalystCliOptionsSchema>

export const WalletAnalystResponseSchema = z.object({
  result: z.string()
})
export type WalletAnalystResponse = z.infer<typeof WalletAnalystResponseSchema>

export type WalletAnalystServiceParams = {
  readonly apiBaseUrl: string
  readonly apiBearerToken: string
}

export type FetchWalletAnalystResponseParams = {
  readonly apiBaseUrl: string
  readonly apiBearerToken: string
  readonly query: string
}
