import { z } from 'zod';
import {
  ChainSchema,
  CurrencySchema,
  EvidenceTypeSchema,
  IsoTimestamp,
  SourcedSchema,
} from './common.js';

/**
 * On-chain and crypto-market shapes. Token identity is chain + contract
 * address (or a provider-native id) — symbols alone are ambiguous and are
 * never used as a join key.
 */

export const TokenRefSchema = z.object({
  chain: ChainSchema,
  /** Contract/mint address; absent for native assets (ETH, SOL, BTC). */
  address: z.string().optional(),
  symbol: z.string().optional(),
  name: z.string().optional(),
  decimals: z.number().int().min(0).max(36).optional(),
  /** Native identifier per provider, e.g. { coingecko: "bitcoin" }. */
  providerIds: z.record(z.string()).default({}),
});
export type TokenRef = z.infer<typeof TokenRefSchema>;

export const TokenPriceSchema = SourcedSchema.extend({
  token: TokenRefSchema,
  price: z.number().finite(),
  currency: CurrencySchema.default('USD'),
  asOf: IsoTimestamp,
  liquidityUsd: z.number().finite().optional(),
  volume24hUsd: z.number().finite().optional(),
  marketCapUsd: z.number().finite().optional(),
  fullyDilutedValuationUsd: z.number().finite().optional(),
});
export type TokenPrice = z.infer<typeof TokenPriceSchema>;

export const TokenBalanceSchema = z.object({
  token: TokenRefSchema,
  /** Raw integer amount as decimal string (never rounded). */
  rawAmount: z.string().regex(/^\d+$/),
  /** Human units after decimals adjustment (lossy; for display). */
  amount: z.number().finite().optional(),
  valueUsd: z.number().finite().optional(),
});
export type TokenBalance = z.infer<typeof TokenBalanceSchema>;

export const WalletBalancesSchema = SourcedSchema.extend({
  chain: ChainSchema,
  address: z.string().min(1),
  asOf: IsoTimestamp,
  balances: z.array(TokenBalanceSchema),
});
export type WalletBalances = z.infer<typeof WalletBalancesSchema>;

export const TransferSchema = z.object({
  chain: ChainSchema,
  txHash: z.string(),
  blockNumber: z.number().int().optional(),
  timestamp: IsoTimestamp.optional(),
  from: z.string(),
  to: z.string(),
  token: TokenRefSchema.optional(),
  rawAmount: z.string().optional(),
  amount: z.number().finite().optional(),
  valueUsd: z.number().finite().optional(),
  category: z.string().optional(),
});
export type Transfer = z.infer<typeof TransferSchema>;

export const TransferBatchSchema = SourcedSchema.extend({
  chain: ChainSchema,
  address: z.string().optional(),
  transfers: z.array(TransferSchema),
  nextCursor: z.string().optional(),
});
export type TransferBatch = z.infer<typeof TransferBatchSchema>;

export const DexPairSchema = SourcedSchema.extend({
  chain: ChainSchema,
  pairAddress: z.string(),
  dex: z.string().optional(),
  baseToken: TokenRefSchema,
  quoteToken: TokenRefSchema.optional(),
  priceUsd: z.number().finite().optional(),
  liquidityUsd: z.number().finite().optional(),
  volume24hUsd: z.number().finite().optional(),
  asOf: IsoTimestamp,
});
export type DexPair = z.infer<typeof DexPairSchema>;

/**
 * Labeled-flow analytics (e.g. Nansen smart-money). Labels are the
 * provider's proprietary model output — evidenceType defaults accordingly.
 */
export const LabeledFlowSchema = SourcedSchema.extend({
  token: TokenRefSchema,
  window: z.string(),
  netFlowUsd: z.number().finite(),
  inflowUsd: z.number().finite().optional(),
  outflowUsd: z.number().finite().optional(),
  labelCohort: z.string(),
  labelSource: z.string(),
  evidenceType: EvidenceTypeSchema.default('model_estimate'),
  asOf: IsoTimestamp,
});
export type LabeledFlow = z.infer<typeof LabeledFlowSchema>;
