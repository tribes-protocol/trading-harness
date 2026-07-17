import { z } from 'zod';
import { AssetClassSchema, ChainSchema, FreshnessSchema, IsoDate } from './common.js';

/**
 * Machine-readable provider capability registry schema. The registry data
 * (src/registry/providers.json) is seeded from documentation research and
 * carries an explicit verification status — nothing is ever marked
 * "live-tested" without an actual successful call.
 */

export const VerificationStatusSchema = z.enum(['unverified', 'docs-reviewed', 'live-tested']);
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;

/** Normalized operation ids used by routing. */
export const OperationSchema = z.enum([
  'market.quote',
  'market.daily_bars',
  'market.intraday_bars',
  'market.tickers',
  'market.exchanges',
  'market.corporate_actions',
  'macro.series',
  'macro.series_search',
  'macro.releases',
  'news.latest',
  'news.search',
  'news.archive',
  'search.web',
  'search.extract',
  'onchain.token_price',
  'onchain.token_market',
  'onchain.token_ohlcv',
  'onchain.wallet_balances',
  'onchain.transfers',
  'onchain.dex_pairs',
  'onchain.labeled_flows',
  'onchain.rpc',
]);
export type Operation = z.infer<typeof OperationSchema>;

export const CapabilitySchema = z.object({
  operation: OperationSchema,
  assetClasses: z.array(AssetClassSchema).min(1),
  chains: z.array(ChainSchema).optional(),
  freshness: FreshnessSchema,
  historicalDepth: z.string().optional(),
  verification: VerificationStatusSchema,
  lastVerifiedAt: z.string().optional(),
  notes: z.string().optional(),
  /** Higher = preferred when several providers offer the operation. */
  priority: z.number().int().min(0).max(100).default(50),
});
export type Capability = z.infer<typeof CapabilitySchema>;

export const RateLimitNoteSchema = z.object({
  plan: z.string(),
  limit: z.string(),
  source: z.string().optional(),
});

export const ProviderRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  docsUrl: z.string().url(),
  docsReviewDate: IsoDate,
  apiVersion: z.string(),
  baseUrl: z.string().url(),
  authMechanism: z.string().min(1),
  envVar: z.string().min(1),
  capabilities: z.array(CapabilitySchema),
  rateLimits: z.array(RateLimitNoteSchema).default([]),
  licensing: z.object({
    storageRestrictions: z.string().optional(),
    attribution: z.string().optional(),
    redistribution: z.string().optional(),
    notes: z.string().optional(),
  }),
  entitlementNotes: z.array(z.string()).default([]),
  limitations: z.array(z.string()).default([]),
  preferredUses: z.array(z.string()).default([]),
  /** Confidence in the docs review itself. */
  reviewConfidence: z.enum(['high', 'medium', 'low']),
  researchRecord: z.string().optional(),
});
export type ProviderRecord = z.infer<typeof ProviderRecordSchema>;

export const ProviderRegistryFileSchema = z.object({
  schemaVersion: z.string(),
  generatedAt: z.string(),
  providers: z.array(ProviderRecordSchema),
});
export type ProviderRegistryFile = z.infer<typeof ProviderRegistryFileSchema>;
