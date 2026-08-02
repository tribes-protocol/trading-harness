import { z } from 'zod'

// ---------------------------------------------------------------------------
// The trading organization's artifact envelope (skills/org-protocol/SKILL.md,
// docs/org/ORGANIZATION.md). These schemas are the machine-checkable floor of
// that spec: unknown extra keys are allowed, missing contract keys are not.
// ---------------------------------------------------------------------------

// ISO-8601 timestamp with an explicit offset ('Z' or +hh:mm), per the
// `date -u +%Y-%m-%dT%H:%M:%SZ` stamping convention in the protocol.
const OrgTimestampSchema = z.string().datetime({ offset: true })

export const OrgArtifactStateSchema = z.enum([
  // Happy path, states 1-8.
  'observation',
  'validated-signal',
  'strategy-proposal',
  'approved-strategy',
  'trade-instruction',
  'submitted-order',
  'confirmed-fill',
  'portfolio-position',
  // Intent-journal state written before an order-mutating command runs.
  'submitting',
  // Terminal states, exactly one per artifact.
  'rejected',
  'expired',
  'cancelled',
  'failed',
  'unknown',
  'superseded'
])
export type OrgArtifactState = z.infer<typeof OrgArtifactStateSchema>

export const OrgFreshnessSchema = z.enum(['live', 'recent', 'daily', 'static', 'stale'])
export type OrgFreshness = z.infer<typeof OrgFreshnessSchema>

export const OrgEvidenceTypeSchema = z.enum([
  'observed',
  'calculated',
  'model_estimate',
  'hypothesis',
  'assumption',
  'analyst_judgment'
])
export type OrgEvidenceType = z.infer<typeof OrgEvidenceTypeSchema>

// `source_ts` is nullable because several provider payloads carry no as-of
// field; `retrieved_at` is always stamped by the producer itself.
export const OrgSourceSchema = z.object({
  provider: z.string().min(1),
  command: z.string().min(1),
  source_ts: OrgTimestampSchema.nullish(),
  retrieved_at: OrgTimestampSchema,
  freshness: OrgFreshnessSchema
})
export type OrgSource = z.infer<typeof OrgSourceSchema>

export const OrgDissentSchema = z.object({
  by: z.string().min(1),
  at: OrgTimestampSchema,
  text: z.string().min(1)
})
export type OrgDissent = z.infer<typeof OrgDissentSchema>

// The spec is a floor, not a ceiling: `.passthrough()` keeps unknown
// top-level keys instead of rejecting richer artifacts.
export const OrgEnvelopeSchema = z
  .object({
    id: z.string().min(1),
    state: OrgArtifactStateSchema,
    created_at: OrgTimestampSchema,
    expires_at: OrgTimestampSchema.nullish(),
    producer: z.string().min(1),
    sources: z.array(OrgSourceSchema),
    upstream: z.array(z.string()),
    checks: z.array(z.string()),
    dissents: z.array(OrgDissentSchema).nullish(),
    payload: z.record(z.unknown())
  })
  .passthrough()
export type OrgEnvelope = z.infer<typeof OrgEnvelopeSchema>

export const OrgAckVerdictSchema = z.enum(['ack', 'reject'])
export type OrgAckVerdict = z.infer<typeof OrgAckVerdictSchema>

// Handoff sidecar `<id>.ack.json`: a rejection must say why.
export const OrgAckSchema = z
  .object({
    by: z.string().min(1),
    at: OrgTimestampSchema,
    verdict: OrgAckVerdictSchema,
    reason: z.string().min(1).nullish()
  })
  .superRefine((value, ctx) => {
    if (value.verdict === 'reject' && (value.reason === null || value.reason === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason'],
        message: "reason is required when verdict is 'reject'"
      })
    }
  })
export type OrgAck = z.infer<typeof OrgAckSchema>

// ---------------------------------------------------------------------------
// Validation results surfaced by `tribes-cli org validate`.
// ---------------------------------------------------------------------------

export const OrgValidationErrorSchema = z.object({
  rule: z.string().min(1),
  message: z.string().min(1)
})
export type OrgValidationError = z.infer<typeof OrgValidationErrorSchema>

export const OrgValidateKindSchema = z.enum(['artifact', 'ack'])
export type OrgValidateKind = z.infer<typeof OrgValidateKindSchema>

export const OrgValidationResultSchema = z.object({
  valid: z.boolean(),
  kind: OrgValidateKindSchema,
  file: z.string().min(1),
  state: z.string().nullish(),
  id: z.string().nullish(),
  errors: z.array(OrgValidationErrorSchema)
})
export type OrgValidationResult = z.infer<typeof OrgValidationResultSchema>

export const OrgValidateCommandOptionsSchema = z.object({
  kind: OrgValidateKindSchema.nullish(),
  out: z.string().nullish()
})
export type OrgValidateCommandOptions = z.infer<typeof OrgValidateCommandOptionsSchema>
