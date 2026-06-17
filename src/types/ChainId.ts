import { arbitrum, base, bsc, mainnet, optimism, polygon } from 'viem/chains'
import { z } from 'zod'

type SupportedChainIdValue = number | 'solana'

function defineSupportedChainIds<
  const T extends readonly [SupportedChainIdValue, ...SupportedChainIdValue[]]
>(values: T): Readonly<T> {
  return Object.freeze(values)
}

function createLiteralUnionSchema<
  const T extends readonly [SupportedChainIdValue, ...SupportedChainIdValue[]]
>(values: T): z.ZodType<T[number]> {
  const [firstValue, ...remainingValues] = values
  let schema: z.ZodType<T[number]> = z.literal(firstValue)

  for (const value of remainingValues) {
    schema = z.union([schema, z.literal(value)])
  }

  return schema
}

const SOLANA_CHAIN_ID = 'solana'

export const SUPPORTED_EVM_CHAIN_IDS = defineSupportedChainIds([
  mainnet.id,
  base.id,
  bsc.id,
  arbitrum.id,
  optimism.id,
  polygon.id
])

export const SUPPORTED_CHAIN_IDS = defineSupportedChainIds([
  ...SUPPORTED_EVM_CHAIN_IDS,
  SOLANA_CHAIN_ID
])
export const SUPPORTED_CHAIN_IDS_TEXT = SUPPORTED_CHAIN_IDS.map(String).join(', ')

export const EvmChainIdSchema = z.preprocess(
  (v) => Number(v),
  createLiteralUnionSchema(SUPPORTED_EVM_CHAIN_IDS)
)

export type EvmChainId = z.infer<typeof EvmChainIdSchema>

export const SolanaChainIdSchema = createLiteralUnionSchema([SOLANA_CHAIN_ID])

export type SolanaChainId = z.infer<typeof SolanaChainIdSchema>

export const ChainIdSchema = z

  .preprocess((value) => {
    const parsedNumber = Number(value)
    return Number.isNaN(parsedNumber) ? value : parsedNumber
  }, createLiteralUnionSchema(SUPPORTED_CHAIN_IDS))
  .describe(
    'Chain identifier. Supported: "solana", 1 (Ethereum), 10 (Optimism), 56 (BSC), 137 (Polygon), 8453 (Base), 42161 (Arbitrum)'
  )

export type ChainId = z.infer<typeof ChainIdSchema>

export const NetworkSchema = z.enum(['evm', 'solana'])
export type Network = z.infer<typeof NetworkSchema>
