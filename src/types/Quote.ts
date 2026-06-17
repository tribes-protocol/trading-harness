import { z } from 'zod'

import { ChainIdSchema, EvmChainIdSchema, SolanaChainIdSchema } from '@/types/ChainId'
import { TokenIdSchema } from '@/types/Crosschain'
import { EthAddressSchema, EthTokenIdSchema } from '@/types/Eth'
import { BigintSchema, HexStringSchema } from '@/types/Lang'
import { SolInstructionSchema, SPLTokenIdSchema } from '@/types/Solana'
import { WalletAddressSchema } from '@/types/Wallet'

export const QuoteRequestSchema = z.object({
  fromToken: TokenIdSchema,
  fromAmount: BigintSchema,
  fromAddress: WalletAddressSchema,
  fromChain: ChainIdSchema,
  toChain: ChainIdSchema,
  toToken: TokenIdSchema,
  toAddress: WalletAddressSchema,
  slippage: z.coerce.number().nullish()
})

export type QuoteRequest = z.infer<typeof QuoteRequestSchema>

export const SolTransactionRequestSchema = z.object({
  data: SolInstructionSchema
})
export type SolTransactionRequest = z.infer<typeof SolTransactionRequestSchema>
export const EvmTransactionRequestSchema = z.object({
  to: EthAddressSchema,
  value: BigintSchema,
  data: HexStringSchema
})
export type EvmTransactionRequest = z.infer<typeof EvmTransactionRequestSchema>

export const TransactionRequestSchema = z.union([
  EvmTransactionRequestSchema,
  SolTransactionRequestSchema
])
export type TransactionRequest = z.infer<typeof TransactionRequestSchema>

export const EvmQuoteResponseSchema = z.object({
  kind: z.literal('evm'),
  fromToken: EthTokenIdSchema,
  fromChain: EvmChainIdSchema,
  fromAmount: BigintSchema,
  toToken: TokenIdSchema,
  toChain: ChainIdSchema,
  toAmountMin: BigintSchema,
  transactionRequests: z.array(EvmTransactionRequestSchema)
})

export type SolQuoteResponse = z.infer<typeof SolQuoteResponseSchema>

export const SolQuoteResponseSchema = z.object({
  kind: z.literal('solana'),
  fromToken: SPLTokenIdSchema,
  fromChain: SolanaChainIdSchema,
  fromAmount: BigintSchema,
  toToken: TokenIdSchema,
  toChain: ChainIdSchema,
  toAmountMin: BigintSchema,
  transactionRequests: z.array(SolTransactionRequestSchema)
})
export type EvmQuoteResponse = z.infer<typeof EvmQuoteResponseSchema>

export const QuoteResponseSchema = z.discriminatedUnion('kind', [
  EvmQuoteResponseSchema,
  SolQuoteResponseSchema
])

export type QuoteResponse = z.infer<typeof QuoteResponseSchema>

export const QuoteErrorSchema = z.object({
  error: z.string()
})

export type QuoteError = z.infer<typeof QuoteErrorSchema>
