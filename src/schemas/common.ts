import { z } from 'zod';
import { FREQUENCIES } from '../core/time.js';

/**
 * Shared schema primitives. Every dataset that crosses a module boundary
 * is validated against these, carries a schema version, its source, its
 * quality flags, and its transformation lineage.
 *
 * Versioning: bump SCHEMA_VERSION (semver) on any breaking change to the
 * shapes in src/schemas/*. Persisted artifacts record the version they
 * were written with.
 */

export const SCHEMA_VERSION = '1.0.0';

export const IsoTimestamp = z.string().datetime({ offset: true });
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

export const FrequencySchema = z.enum(FREQUENCIES);
export type Frequency = z.infer<typeof FrequencySchema>;

export const AssetClassSchema = z.enum([
  'equity',
  'equity_index',
  'etf',
  'fixed_income',
  'rates',
  'credit',
  'commodity',
  'future',
  'fx',
  'macro',
  'option',
  'volatility',
  'crypto',
  'defi',
  'nft',
  'multi_asset',
  'other',
]);
export type AssetClass = z.infer<typeof AssetClassSchema>;

export const ChainSchema = z.enum([
  'ethereum',
  'solana',
  'polygon',
  'arbitrum',
  'optimism',
  'base',
  'bsc',
  'avalanche',
  'bitcoin',
  'other',
]);
export type Chain = z.infer<typeof ChainSchema>;

/**
 * Quality flags travel WITH the data. Anything delayed, cached, estimated,
 * revised, or incomplete must say so — delayed/EOD/cached data must never
 * be presented as real-time.
 */
export const QualityFlagSchema = z.enum([
  'realtime',
  'delayed',
  'eod',
  'stale',
  'estimated',
  'preliminary',
  'revised',
  'cached',
  'incomplete',
  'provider_disagreement',
  'fallback_source',
  'converted',
  'adjusted',
  'unverified',
]);
export type QualityFlag = z.infer<typeof QualityFlagSchema>;

/**
 * Epistemic classification required on findings, signals, and report
 * statements: observed facts vs calculations vs model output vs judgment.
 */
export const EvidenceTypeSchema = z.enum([
  'observed',
  'calculated',
  'model_estimate',
  'hypothesis',
  'assumption',
  'analyst_judgment',
]);
export type EvidenceType = z.infer<typeof EvidenceTypeSchema>;

export const FreshnessSchema = z.enum(['realtime', 'delayed', 'eod', 'historical', 'unknown']);
export type Freshness = z.infer<typeof FreshnessSchema>;

/** Where a payload came from: provider, endpoint, and when. */
export const DataSourceSchema = z.object({
  provider: z.string().min(1),
  endpoint: z.string().min(1),
  apiVersion: z.string().optional(),
  requestedAt: IsoTimestamp,
  receivedAt: IsoTimestamp,
  cacheHit: z.boolean().default(false),
  freshness: FreshnessSchema.default('unknown'),
});
export type DataSource = z.infer<typeof DataSourceSchema>;

/** One explicit, reproducible transformation step. */
export const LineageStepSchema = z.object({
  step: z.string().min(1),
  description: z.string().min(1),
  at: IsoTimestamp,
  params: z.record(z.unknown()).optional(),
});
export type LineageStep = z.infer<typeof LineageStepSchema>;

/** Base fields shared by every sourced dataset. Extend with .extend(). */
export const SourcedSchema = z.object({
  schemaVersion: z.string().default(SCHEMA_VERSION),
  source: DataSourceSchema,
  /** Additional sources when data was merged or cross-checked. */
  additionalSources: z.array(DataSourceSchema).default([]),
  quality: z.array(QualityFlagSchema).default([]),
  lineage: z.array(LineageStepSchema).default([]),
});
export type Sourced = z.infer<typeof SourcedSchema>;

export const CurrencySchema = z
  .string()
  .regex(/^[A-Z0-9]{2,10}$/, 'expected ISO-4217 code or crypto ticker (uppercase)');

export const MoneySchema = z.object({
  amount: z.number().finite(),
  currency: CurrencySchema,
});
export type Money = z.infer<typeof MoneySchema>;

/** Confidence grading used across research artifacts. */
export const ConfidenceSchema = z.enum(['high', 'medium', 'low']);
export type Confidence = z.infer<typeof ConfidenceSchema>;
