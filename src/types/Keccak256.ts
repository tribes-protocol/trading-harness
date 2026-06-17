import { z } from 'zod'

export const Keccak256Schema = z
  .custom<`0x${string}`>((val): val is `0x${string}` => typeof val === 'string' && /^0x[0-9a-f]{64}$/i.test(val))
  .transform((val) => val.toLowerCase())
export type Keccak256 = z.infer<typeof Keccak256Schema>
