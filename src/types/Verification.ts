import z from 'zod'

const TOKEN_VERIFICATION_STATUS_VALUES = [
  'unknown',
  'standard',
  'spam',
  'verified',
  'meme',
  'risky'
] as const

const TOKEN_VERIFICATION_STATUS_SET: ReadonlySet<string> = new Set(TOKEN_VERIFICATION_STATUS_VALUES)

// Legacy stored tokens may still carry 'none' (or other removed values) from the
// previous enum. Coerce unrecognized strings to 'unknown' so reads never fail on
// historical data; new writes always use the current enum.
export const TokenVerificationStatusSchema = z.preprocess(
  (value) =>
    typeof value === 'string' && !TOKEN_VERIFICATION_STATUS_SET.has(value) ? 'unknown' : value,
  z.enum(TOKEN_VERIFICATION_STATUS_VALUES)
)
export type TokenVerificationStatus = z.infer<typeof TokenVerificationStatusSchema>

export const VerificationSchema = z.object({
  verified: TokenVerificationStatusSchema,
  verificationReason: z.string(),
  report: z.string(),
  updatedAt: z.number()
})
export type Verification = z.infer<typeof VerificationSchema>
