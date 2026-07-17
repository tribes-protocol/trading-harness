import { z } from 'zod';
import {
  AssetClassSchema,
  ConfidenceSchema,
  EvidenceTypeSchema,
  IsoTimestamp,
  SourcedSchema,
} from './common.js';

/**
 * Research signals. A signal is a claim with a methodology and an epistemic
 * label — never a bare number. Backtest fields carry mandatory caveats.
 */

export const SignalDirectionSchema = z.enum(['long', 'short', 'neutral']);

export const BacktestSummarySchema = z.object({
  periodStart: IsoTimestamp,
  periodEnd: IsoTimestamp,
  sampleSize: z.number().int().positive().optional(),
  annualizedReturnPct: z.number().finite().optional(),
  sharpe: z.number().finite().optional(),
  maxDrawdownPct: z.number().finite().optional(),
  outOfSample: z.boolean(),
  /** Required: overfitting risk, transaction-cost realism, data caveats. */
  caveats: z.array(z.string()).min(1),
});
export type BacktestSummary = z.infer<typeof BacktestSummarySchema>;

export const SignalSchema = SourcedSchema.extend({
  id: z.string().min(1),
  name: z.string(),
  hypothesis: z.string().min(1),
  methodology: z.string().min(1),
  assetClass: AssetClassSchema,
  instruments: z.array(z.string()).default([]),
  direction: SignalDirectionSchema,
  value: z.number().finite().optional(),
  unit: z.string().optional(),
  horizon: z.string(),
  confidence: ConfidenceSchema,
  evidenceType: EvidenceTypeSchema,
  asOf: IsoTimestamp,
  expiresAt: IsoTimestamp.optional(),
  backtest: BacktestSummarySchema.optional(),
  assumptions: z.array(z.string()).default([]),
  limitations: z.array(z.string()).default([]),
});
export type Signal = z.infer<typeof SignalSchema>;
