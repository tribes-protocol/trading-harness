import { z } from 'zod'

// ---------------------------------------------------------------------------
// Trade journal — SQLite-backed trade + decision-report records.
// Schema v1.0 per the ingest spec (eng-head/shared/trade-journal-ingest-schema.md).
// ---------------------------------------------------------------------------

export const JournalTradeStatusSchema = z.enum([
  'open',
  'filled',
  'closed',
  'stopped',
  'tp_hit'
])
export type JournalTradeStatus = z.infer<typeof JournalTradeStatusSchema>

export const JournalSourceSchema = z.object({
  reason: z.string(),
  url: z.string().nullish(),
  ts: z.string().nullish()
})
export type JournalSource = z.infer<typeof JournalSourceSchema>

export const JournalAccountSnapshotSchema = z.object({
  equityUsd: z.number(),
  withdrawableUsd: z.number().nullish(),
  date: z.string()
})
export type JournalAccountSnapshot = z.infer<typeof JournalAccountSnapshotSchema>

export const JournalReportSchema = z.object({
  thesis: z.string(),
  bullCase: z.string().nullish(),
  bearCase: z.string().nullish(),
  bias: z.enum(['long', 'short', 'neutral']).default('neutral'),
  confidenceAtDecision: z.number().min(0).max(1).nullish(),
  riskUsd: z.number().nullish(),
  riskPctAccount: z.number().nullish(),
  rr: z.number().nullish(),
  accountSnapshot: JournalAccountSnapshotSchema.nullish(),
  equityCurve: z
    .array(
      z.object({
        date: z.string(),
        equityUsd: z.number()
      })
    )
    .default([]),
  sources: z.array(JournalSourceSchema).default([]),
  statusAtDecision: JournalTradeStatusSchema.nullish()
})
export type JournalReport = z.infer<typeof JournalReportSchema>

export const JournalTradeSchema = z.object({
  id: z.string().trim().min(1),
  timestamp: z.number().int().nonnegative(),
  ticker: z.string().trim().min(1),
  dex: z.string().default(''),
  side: z.enum(['long', 'short']),
  entryPrice: z.number(),
  sizeBase: z.number(),
  notionalUsd: z.number(),
  marginUsd: z.number(),
  leverage: z.number().int().positive(),
  stopPx: z.number().nullish(),
  targetPx: z.number().nullish(),
  riskUsd: z.number().nullish(),
  riskPctAccount: z.number().nullish(),
  rr: z.number().nullish(),
  status: JournalTradeStatusSchema.default('open'),
  realizedPnlUsd: z.number().default(0),
  report: JournalReportSchema.nullish()
})
export type JournalTrade = z.infer<typeof JournalTradeSchema>

export const JournalInsertInputSchema = JournalTradeSchema
export type JournalInsertInput = z.infer<typeof JournalInsertInputSchema>

export const JournalImportResultSchema = z.object({
  inserted: z.number(),
  updated: z.number(),
  skipped: z.number(),
  file: z.string()
})
export type JournalImportResult = z.infer<typeof JournalImportResultSchema>