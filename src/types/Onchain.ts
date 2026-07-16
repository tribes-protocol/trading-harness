import { z } from 'zod'

import { ChainIdSchema, EvmChainIdSchema } from '@/types/ChainId'

// Onchain wallet-forensics types (Moralis, Alchemy, Helius).
// Raw provider schemas are defensive: every field a provider might omit is
// nullish. Normalized shapes use plain numbers for amounts/USD values and
// ISO-8601 strings for timestamps.

// --- Moralis EVM raw schemas ---------------------------------------------------

const MoralisWalletTokenSchema = z.object({
  token_address: z.string().nullish(),
  symbol: z.string().nullish(),
  name: z.string().nullish(),
  decimals: z.number().nullish(),
  balance: z.string().nullish(),
  balance_formatted: z.string().nullish(),
  native_token: z.boolean().nullish(),
  usd_value: z.number().nullish()
})
export type MoralisWalletToken = z.infer<typeof MoralisWalletTokenSchema>

export const MoralisWalletTokensResponseSchema = z.object({
  result: MoralisWalletTokenSchema.array().nullish()
})
export type MoralisWalletTokensResponse = z.infer<typeof MoralisWalletTokensResponseSchema>

const MoralisNetWorthChainSchema = z.object({
  chain: z.string(),
  networth_usd: z.string().nullish()
})

export const MoralisNetWorthResponseSchema = z.object({
  total_networth_usd: z.string().nullish(),
  chains: MoralisNetWorthChainSchema.array().nullish()
})
export type MoralisNetWorthResponse = z.infer<typeof MoralisNetWorthResponseSchema>

const MoralisHistoryErc20TransferSchema = z.object({
  token_symbol: z.string().nullish(),
  value_formatted: z.string().nullish()
})

const MoralisHistoryNativeTransferSchema = z.object({
  token_symbol: z.string().nullish(),
  value_formatted: z.string().nullish()
})

const MoralisHistoryItemSchema = z.object({
  hash: z.string(),
  block_timestamp: z.string().nullish(),
  category: z.string().nullish(),
  summary: z.string().nullish(),
  from_address: z.string().nullish(),
  to_address: z.string().nullish(),
  erc20_transfers: MoralisHistoryErc20TransferSchema.array().nullish(),
  native_transfers: MoralisHistoryNativeTransferSchema.array().nullish()
})
export type MoralisHistoryItem = z.infer<typeof MoralisHistoryItemSchema>

export const MoralisHistoryResponseSchema = z.object({
  result: MoralisHistoryItemSchema.array().nullish()
})
export type MoralisHistoryResponse = z.infer<typeof MoralisHistoryResponseSchema>

// --- Moralis Solana raw schemas ------------------------------------------------

const MoralisSolanaNativeBalanceSchema = z.object({
  solana: z.string().nullish(),
  lamports: z.string().nullish()
})

const MoralisSolanaTokenSchema = z.object({
  mint: z.string().nullish(),
  name: z.string().nullish(),
  symbol: z.string().nullish(),
  amount: z.string().nullish(),
  amountRaw: z.string().nullish(),
  decimals: z.number().nullish()
})
export type MoralisSolanaToken = z.infer<typeof MoralisSolanaTokenSchema>

export const MoralisSolanaPortfolioResponseSchema = z.object({
  nativeBalance: MoralisSolanaNativeBalanceSchema.nullish(),
  tokens: MoralisSolanaTokenSchema.array().nullish()
})
export type MoralisSolanaPortfolioResponse = z.infer<typeof MoralisSolanaPortfolioResponseSchema>

// --- JSON-RPC envelope (Alchemy + Helius) --------------------------------------

const JsonRpcErrorSchema = z.object({
  code: z.number().nullish(),
  message: z.string().nullish()
})

export const JsonRpcResponseSchema = z.object({
  result: z.unknown(),
  error: JsonRpcErrorSchema.nullish()
})
export type JsonRpcResponse = z.infer<typeof JsonRpcResponseSchema>

// --- Alchemy raw schemas -------------------------------------------------------

const AlchemyTokenBalanceSchema = z.object({
  contractAddress: z.string(),
  tokenBalance: z.string().nullish(),
  error: z.string().nullish()
})

export const AlchemyTokenBalancesResultSchema = z.object({
  address: z.string().nullish(),
  tokenBalances: AlchemyTokenBalanceSchema.array().nullish(),
  // Cursor for the next page; the 'erc20' token spec pages at maxCount entries.
  pageKey: z.string().nullish()
})
export type AlchemyTokenBalancesResult = z.infer<typeof AlchemyTokenBalancesResultSchema>

export const AlchemyTokenMetadataResultSchema = z.object({
  name: z.string().nullish(),
  symbol: z.string().nullish(),
  decimals: z.number().nullish(),
  logo: z.string().nullish()
})
export type AlchemyTokenMetadataResult = z.infer<typeof AlchemyTokenMetadataResultSchema>

const AlchemyRawContractSchema = z.object({
  value: z.string().nullish(),
  address: z.string().nullish(),
  decimal: z.string().nullish()
})

const AlchemyTransferMetadataSchema = z.object({
  blockTimestamp: z.string().nullish()
})

const AlchemyAssetTransferSchema = z.object({
  blockNum: z.string().nullish(),
  uniqueId: z.string(),
  hash: z.string(),
  from: z.string().nullish(),
  to: z.string().nullish(),
  value: z.number().nullish(),
  asset: z.string().nullish(),
  category: z.string(),
  rawContract: AlchemyRawContractSchema.nullish(),
  metadata: AlchemyTransferMetadataSchema.nullish()
})
export type AlchemyAssetTransfer = z.infer<typeof AlchemyAssetTransferSchema>

export const AlchemyAssetTransfersResultSchema = z.object({
  transfers: AlchemyAssetTransferSchema.array().nullish(),
  pageKey: z.string().nullish()
})
export type AlchemyAssetTransfersResult = z.infer<typeof AlchemyAssetTransfersResultSchema>

// --- Helius raw schemas --------------------------------------------------------

const HeliusPriceInfoSchema = z.object({
  price_per_token: z.number().nullish(),
  total_price: z.number().nullish(),
  currency: z.string().nullish()
})

const HeliusTokenInfoSchema = z.object({
  symbol: z.string().nullish(),
  balance: z.number().nullish(),
  decimals: z.number().nullish(),
  price_info: HeliusPriceInfoSchema.nullish()
})

const HeliusAssetMetadataSchema = z.object({
  name: z.string().nullish(),
  symbol: z.string().nullish()
})

const HeliusAssetContentSchema = z.object({
  metadata: HeliusAssetMetadataSchema.nullish()
})

const HeliusAssetSchema = z.object({
  id: z.string(),
  content: HeliusAssetContentSchema.nullish(),
  token_info: HeliusTokenInfoSchema.nullish()
})
export type HeliusAsset = z.infer<typeof HeliusAssetSchema>

const HeliusNativeBalanceSchema = z.object({
  lamports: z.number().nullish(),
  price_per_sol: z.number().nullish(),
  total_price: z.number().nullish()
})
export type HeliusNativeBalance = z.infer<typeof HeliusNativeBalanceSchema>

// Docs show searchAssets results nested under an `assets` wrapper while the
// official SDK types the result flat; accept both and let the service unwrap.
const HeliusSearchAssetsPayloadSchema = z.object({
  items: HeliusAssetSchema.array().nullish(),
  nativeBalance: HeliusNativeBalanceSchema.nullish()
})

export const HeliusSearchAssetsResultSchema = HeliusSearchAssetsPayloadSchema.extend({
  assets: HeliusSearchAssetsPayloadSchema.nullish()
})
export type HeliusSearchAssetsResult = z.infer<typeof HeliusSearchAssetsResultSchema>

const HeliusNativeTransferSchema = z.object({
  fromUserAccount: z.string().nullish(),
  toUserAccount: z.string().nullish(),
  amount: z.number().nullish()
})

const HeliusTokenTransferSchema = z.object({
  fromUserAccount: z.string().nullish(),
  toUserAccount: z.string().nullish(),
  mint: z.string().nullish(),
  tokenAmount: z.number().nullish()
})

const HeliusEnhancedTransactionSchema = z.object({
  signature: z.string(),
  type: z.string().nullish(),
  source: z.string().nullish(),
  timestamp: z.number().nullish(),
  nativeTransfers: HeliusNativeTransferSchema.array().nullish(),
  tokenTransfers: HeliusTokenTransferSchema.array().nullish()
})
export type HeliusEnhancedTransaction = z.infer<typeof HeliusEnhancedTransactionSchema>

export const HeliusEnhancedTransactionsResponseSchema = HeliusEnhancedTransactionSchema.array()
export type HeliusEnhancedTransactionsResponse = z.infer<
  typeof HeliusEnhancedTransactionsResponseSchema
>

// --- Normalized internal shapes ------------------------------------------------

const OnchainProviderSchema = z.enum(['moralis', 'alchemy', 'helius'])
export type OnchainProvider = z.infer<typeof OnchainProviderSchema>

const OnchainDirectionSchema = z.enum(['in', 'out'])
export type OnchainDirection = z.infer<typeof OnchainDirectionSchema>

const OnchainAssetSchema = z.object({
  // null for the chain's native asset (ETH/BNB/MATIC/SOL...).
  token_address: z.string().nullish(),
  symbol: z.string().nullish(),
  name: z.string().nullish(),
  decimals: z.number().nullish(),
  // Decimal-adjusted (human) amount.
  amount: z.number(),
  usd_value: z.number().nullish()
})
export type OnchainAsset = z.infer<typeof OnchainAssetSchema>

export const OnchainBalancesSchema = z.object({
  source: OnchainProviderSchema,
  address: z.string().min(1),
  chain_id: ChainIdSchema,
  // Sorted by usd_value descending, nulls last, truncated to the CLI --limit.
  assets: OnchainAssetSchema.array()
})
export type OnchainBalances = z.infer<typeof OnchainBalancesSchema>

const OnchainNetWorthChainSchema = z.object({
  chain_id: EvmChainIdSchema,
  networth_usd: z.number()
})

export const OnchainNetWorthSchema = z.object({
  source: z.literal('moralis'),
  address: z.string().min(1),
  total_networth_usd: z.number(),
  chains: OnchainNetWorthChainSchema.array()
})
export type OnchainNetWorth = z.infer<typeof OnchainNetWorthSchema>

const OnchainTransferSchema = z.object({
  hash: z.string(),
  // ISO-8601 timestamp, null when the provider omits it.
  timestamp: z.string().nullish(),
  direction: OnchainDirectionSchema.nullish(),
  counterparty: z.string().nullish(),
  // Token symbol when known, otherwise the mint/contract address.
  asset: z.string().nullish(),
  amount: z.number().nullish(),
  // Provider-native category/type string ('external', 'token send', 'SWAP'...).
  category: z.string()
})
export type OnchainTransfer = z.infer<typeof OnchainTransferSchema>

export const OnchainTransfersSchema = z.object({
  source: OnchainProviderSchema,
  address: z.string().min(1),
  chain_id: ChainIdSchema,
  transfers: OnchainTransferSchema.array()
})
export type OnchainTransfers = z.infer<typeof OnchainTransfersSchema>

// --- CLI command options -------------------------------------------------------

export const OnchainBalancesCommandOptionsSchema = z.object({
  address: z.string().trim().min(1),
  chain: ChainIdSchema,
  limit: z.coerce.number().int().min(1).max(200).default(50),
  out: z.string().nullish()
})
export type OnchainBalancesCommandOptions = z.infer<typeof OnchainBalancesCommandOptionsSchema>

export const OnchainNetWorthCommandOptionsSchema = z.object({
  address: z.string().trim().min(1),
  // Comma-separated EVM chain ids; defaults to all six supported EVM chains.
  chains: z.string().trim().min(1).nullish(),
  out: z.string().nullish()
})
export type OnchainNetWorthCommandOptions = z.infer<typeof OnchainNetWorthCommandOptionsSchema>

export const OnchainTransfersCommandOptionsSchema = z.object({
  address: z.string().trim().min(1),
  chain: ChainIdSchema,
  limit: z.coerce.number().int().min(1).max(100).default(25),
  out: z.string().nullish()
})
export type OnchainTransfersCommandOptions = z.infer<typeof OnchainTransfersCommandOptionsSchema>
