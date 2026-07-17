import { z } from 'zod';
import {
  ConfidenceSchema,
  EvidenceTypeSchema,
  IsoTimestamp,
  SourcedSchema,
} from './common.js';

/** Independent-risk shapes: exposures, limits, breaches, stress tests. */

export const ExposureSchema = z.object({
  dimension: z.string().min(1),
  bucket: z.string().min(1),
  grossPct: z.number().finite().optional(),
  netPct: z.number().finite().optional(),
  grossUsd: z.number().finite().optional(),
  netUsd: z.number().finite().optional(),
});
export type Exposure = z.infer<typeof ExposureSchema>;

export const RiskLimitSchema = z.object({
  id: z.string().min(1),
  scope: z.string().min(1),
  metric: z.string().min(1),
  operator: z.enum(['<', '<=', '>', '>=']),
  threshold: z.number().finite(),
  unit: z.string(),
  /** Soft limits warn; hard limits require escalation / de-risking. */
  severity: z.enum(['soft', 'hard']),
  owner: z.string().default('independent-risk'),
});
export type RiskLimit = z.infer<typeof RiskLimitSchema>;

export const LimitBreachSchema = z.object({
  limitId: z.string(),
  observedValue: z.number().finite(),
  threshold: z.number().finite(),
  severity: z.enum(['soft', 'hard']),
  detectedAt: IsoTimestamp,
  status: z.enum(['open', 'acknowledged', 'remediated', 'accepted_with_signoff']),
  escalatedTo: z.string().optional(),
  resolutionNote: z.string().optional(),
});
export type LimitBreach = z.infer<typeof LimitBreachSchema>;

export const StressShockSchema = z.object({
  factor: z.string(),
  shock: z.string(),
  rationale: z.string().optional(),
});

export const StressScenarioSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  description: z.string(),
  shocks: z.array(StressShockSchema),
  /** Historical replay vs hypothetical construction. */
  kind: z.enum(['historical', 'hypothetical']),
});
export type StressScenario = z.infer<typeof StressScenarioSchema>;

export const RiskMetricSchema = z.object({
  name: z.string(),
  value: z.number().finite(),
  unit: z.string(),
  methodology: z.string(),
  evidenceType: EvidenceTypeSchema.default('model_estimate'),
  caveats: z.array(z.string()).default([]),
});
export type RiskMetric = z.infer<typeof RiskMetricSchema>;

export const RiskAssessmentSchema = SourcedSchema.extend({
  portfolioId: z.string(),
  asOf: IsoTimestamp,
  exposures: z.array(ExposureSchema).default([]),
  metrics: z.array(RiskMetricSchema).default([]),
  breaches: z.array(LimitBreachSchema).default([]),
  narrative: z.string(),
  confidence: ConfidenceSchema,
  /** Risk's independent view — may disagree with the PM; never merged. */
  objections: z.array(z.string()).default([]),
});
export type RiskAssessment = z.infer<typeof RiskAssessmentSchema>;
