import BigNumber from 'bignumber.js'
import { z } from 'zod'

/* eslint-disable lucy/no-raw-zod-bigint */
// BigintSchema IS the sanctioned z.bigint() wrapper that adds
// string-to-bigint coercion for JSON payloads. All other code
// must use BigintSchema instead of z.bigint() directly.
export const BigintSchema = z.union([z.bigint(), z.string().transform((arg) => BigInt(arg))])
/* eslint-enable lucy/no-raw-zod-bigint */

export const BooleanSchema = z.union([
  z.literal('true').transform(() => true),
  z.literal('false').transform(() => false),
  z.boolean(),
  z.null().transform(() => false),
  z.undefined().transform(() => false)
])

export const HexStringSchema = z.custom<`0x${string}`>(
  (val): val is `0x${string}` => typeof val === 'string' && /^0x(?:[a-fA-F0-9]+)?$/.test(val)
)

export type HexString = z.infer<typeof HexStringSchema>

export const BigNumberSchema = z
  .union([z.string(), z.number(), z.instanceof(BigNumber)])
  .transform<BigNumber>((val) => {
    if (val instanceof BigNumber) return val
    return new BigNumber(val)
  })
  .refine((val) => val.isFinite() && !val.isNaN(), { message: 'Unable to convert to BigNumber' })

export const PositiveBigNumberSchema = BigNumberSchema.pipe(
  z.custom<BigNumber>((val) => val instanceof BigNumber && val.isGreaterThan(new BigNumber(0)), {
    message: 'Value must be a positive BigNumber'
  })
)

export const BigNumberFallbackSchema = z.preprocess((value) => {
  return value ?? BigNumber(0)
}, BigNumberSchema)
