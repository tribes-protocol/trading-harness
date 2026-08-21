import { z } from 'zod'

import { EthAddressSchema } from '@/types/Eth'

// The trail config: a decimal percentage (0.25 = 0.25%) or an absolute price
// distance. Exactly one is required on arm; the pct form is the default and
// matches the playbook's ATR-bounded stops.
export const TrailingStopTrailConfigSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('pct'), value: z.number().positive() }),
  z.object({ kind: z.literal('px'), value: z.number().positive() }),
  // PROFIT-TRAIL ENGINE (user rule, native mode): trail a fraction of the
  // PEAK-TO-ENTRY run once a position passes the engage-profit threshold in
  // dollars. bank = 1 − trailProfitPct (0.30 trails 30%, banking 70% of the
  // run). stop(long) = entry + bank×(peak−entry); short mirrored. No-lose:
  // the stop never crosses the entry until engaged.
  z.object({
    kind: z.literal('profit'),
    trailProfitPct: z.number().positive().lt(0.95),
    engageProfitUsd: z.number().positive()
  })
])
export type TrailingStopTrailConfig = z.infer<typeof TrailingStopTrailConfigSchema>

export const TrailingStopSideSchema = z.enum(['long', 'short'])
export type TrailingStopSide = z.infer<typeof TrailingStopSideSchema>

export const TrailingStopStatusSchema = z.enum([
  'armed',
  'triggered',
  'exited',
  'cancelled',
  'error'
])
export type TrailingStopStatus = z.infer<typeof TrailingStopStatusSchema>

export const TrailingStopSourceSchema = z.enum(['stream', 'poll'])
export type TrailingStopSource = z.infer<typeof TrailingStopSourceSchema>

// Durable per-stop state: the monitor loop writes peak/trough, the stop, and a
// heartbeat; list/cancel read it to reconcile a dead monitor.
export const TrailingStopStateSchema = z.object({
  id: z.string().trim().min(1),
  coin: z.string().trim().min(1),
  dex: z.string().default('main'),
  side: TrailingStopSideSchema,
  sizeAtArm: z.string().trim().min(1),
  entryPx: z.string().trim().min(1),
  trail: TrailingStopTrailConfigSchema,
  stopPx: z.string().trim().min(1),
  peakOrTrough: z.string().trim().min(1),
  source: TrailingStopSourceSchema,
  status: TrailingStopStatusSchema,
  firedAt: z.number().int().nonnegative().nullish(),
  exitFill: z.record(z.unknown()).nullish(),
  from: EthAddressSchema,
  walletId: z.string().trim().min(1),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  heartbeatAt: z.number().int().nonnegative().nullish(),
  lastMarkPx: z.string().nullish(),
  // Derived (not persisted as truth): true when a monitor has heartbeated
  // recently; list/cancel set it so the supervisor can reconcile a dead loop.
  monitorAlive: z.boolean().nullish()
})
export type TrailingStopState = z.infer<typeof TrailingStopStateSchema>

export const TrailingStopArmCommandOptionsSchema = z
  .object({
    coin: z.string().trim().min(1),
    dex: z.string().trim().nullish(),
    from: EthAddressSchema,
    side: TrailingStopSideSchema,
    trailPct: z.coerce.number().positive().nullish(),
    trailPx: z.coerce.number().positive().nullish(),
    trailProfitPct: z.coerce.number().positive().lt(0.95).nullish(),
    engageProfit: z.coerce.number().positive().nullish(),
    walletId: z.string().trim().min(1),
    out: z.string().nullish()
  })
  .superRefine((value, ctx) => {
    const hasPct = value.trailPct !== null && value.trailPct !== undefined
    const hasPx = value.trailPx !== null && value.trailPx !== undefined
    const hasProfit =
      value.trailProfitPct !== null &&
      value.trailProfitPct !== undefined &&
      value.engageProfit !== null &&
      value.engageProfit !== undefined
    const modeCount = [hasPct, hasPx, hasProfit].filter(Boolean).length
    if (modeCount !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['trail'],
        message:
          'exactly one trail mode: --trail-pct, --trail-px, or BOTH --trail-profit-pct + --engage-profit'
      })
    }
  })
export type TrailingStopArmCommandOptions = z.infer<typeof TrailingStopArmCommandOptionsSchema>

export const TrailingStopArmResultSchema = z.object({
  armed: z.literal(true),
  state: TrailingStopStateSchema,
  monitorPid: z.number().int().nonnegative().nullish()
})
export type TrailingStopArmResult = z.infer<typeof TrailingStopArmResultSchema>

export const TrailingStopListResultSchema = z.object({
  stops: z.array(TrailingStopStateSchema)
})
export type TrailingStopListResult = z.infer<typeof TrailingStopListResultSchema>

export const TrailingStopCancelResultSchema = z.object({
  cancelled: z.literal(true),
  id: z.string(),
  state: TrailingStopStateSchema
})
export type TrailingStopCancelResult = z.infer<typeof TrailingStopCancelResultSchema>

export const TrailingStopListCommandOptionsSchema = z.object({
  out: z.string().nullish()
})
export type TrailingStopListCommandOptions = z.infer<typeof TrailingStopListCommandOptionsSchema>

export const TrailingStopCancelCommandOptionsSchema = z.object({
  id: z.string().trim().min(1),
  out: z.string().nullish()
})
export type TrailingStopCancelCommandOptions = z.infer<
  typeof TrailingStopCancelCommandOptionsSchema
>

export const TrailingStopMonitorResultSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    id: z.string(),
    status: TrailingStopStatusSchema,
    exit: z.object({ ok: z.boolean(), message: z.string() }).nullish()
  }),
  z.object({
    ok: z.literal(false),
    id: z.string(),
    reason: z.string()
  })
])
export type TrailingStopMonitorResult = z.infer<typeof TrailingStopMonitorResultSchema>

export interface TrailingStopExitResult {
  readonly ok: boolean
  readonly message: string
  readonly orderId?: number
}

// Injected dependencies for the monitor loop so the core math + trigger logic
// is unit-testable without a live websocket or venue.
export interface TrailingStopMonitorDeps {
  readonly getMark: () => Promise<{ mark: string; source: TrailingStopSource } | null>
  readonly isCancelled: (id: string) => Promise<boolean>
  readonly exit: (state: TrailingStopState) => Promise<TrailingStopExitResult>
  readonly now: () => number
}
