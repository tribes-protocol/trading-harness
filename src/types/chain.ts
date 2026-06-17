import z from 'zod'

export const NetworkSchema = z.enum(['evm', 'solana'])
export type Network = z.infer<typeof NetworkSchema>
