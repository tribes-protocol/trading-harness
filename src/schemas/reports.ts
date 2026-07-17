import { z } from 'zod';
import {
  ConfidenceSchema,
  DataSourceSchema,
  EvidenceTypeSchema,
  IsoTimestamp,
} from './common.js';

/**
 * Research artifacts and inter-department handoffs. These are the units of
 * auditability: every material claim carries its evidence type, and every
 * handoff records provenance, confidence, limitations, and open questions.
 * Disagreement is preserved as first-class data, never averaged away.
 */

export const FindingSchema = z.object({
  statement: z.string().min(1),
  evidenceType: EvidenceTypeSchema,
  /** Data sources and/or citations supporting the statement. */
  support: z.array(z.string()).default([]),
  confidence: ConfidenceSchema,
});
export type Finding = z.infer<typeof FindingSchema>;

export const ResearchNoteSchema = z.object({
  id: z.string().min(1),
  department: z.string().min(1),
  author: z.string().min(1),
  title: z.string().min(1),
  createdAt: IsoTimestamp,
  asOfDataDate: IsoTimestamp.optional(),
  summary: z.string().min(1),
  findings: z.array(FindingSchema).min(1),
  dataSources: z.array(DataSourceSchema).default([]),
  methods: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
  limitations: z.array(z.string()).default([]),
  openQuestions: z.array(z.string()).default([]),
  schemaVersion: z.string().default('1.0.0'),
});
export type ResearchNote = z.infer<typeof ResearchNoteSchema>;

/** A recorded dissent — kept verbatim alongside the majority view. */
export const DissentSchema = z.object({
  by: z.string().min(1),
  department: z.string().min(1),
  position: z.string().min(1),
  rationale: z.string().min(1),
  at: IsoTimestamp,
});
export type Dissent = z.infer<typeof DissentSchema>;

export const HandoffSchema = z.object({
  id: z.string().min(1),
  fromDepartment: z.string().min(1),
  toDepartment: z.string().min(1),
  at: IsoTimestamp,
  subject: z.string().min(1),
  /** Providers/endpoints/documents that fed this work. */
  dataSources: z.array(z.string()).min(1),
  analyticalMethods: z.array(z.string()).default([]),
  findings: z.array(FindingSchema).min(1),
  confidence: ConfidenceSchema,
  assumptions: z.array(z.string()).default([]),
  limitations: z.array(z.string()).default([]),
  unresolvedQuestions: z.array(z.string()).default([]),
  recommendedNextAction: z.string().min(1),
  /** Paths/ids of attached artifacts (notes, series, memos). */
  artifacts: z.array(z.string()).default([]),
  dissents: z.array(DissentSchema).default([]),
  schemaVersion: z.string().default('1.0.0'),
});
export type Handoff = z.infer<typeof HandoffSchema>;

export const IcDecisionSchema = z.enum([
  'approved',
  'approved_with_conditions',
  'rejected',
  'deferred',
]);

export const IcMemoSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  createdAt: IsoTimestamp,
  sponsorDepartment: z.string().min(1),
  thesis: z.string().min(1),
  supportingNotes: z.array(z.string()).default([]),
  /** Independent risk's view — recorded separately from the sponsor's. */
  riskView: z.string().optional(),
  complianceView: z.string().optional(),
  decision: IcDecisionSchema.optional(),
  decisionAt: IsoTimestamp.optional(),
  conditions: z.array(z.string()).default([]),
  dissents: z.array(DissentSchema).default([]),
  reviewDate: IsoTimestamp.optional(),
  schemaVersion: z.string().default('1.0.0'),
});
export type IcMemo = z.infer<typeof IcMemoSchema>;
