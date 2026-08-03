import type { ScreenEvent } from '@tribes-harness/protocol/types/ScreenEvent'

/**
 * The events worth merging: Pi emits one of these per token or per tool output
 * chunk. Everything else passes straight through, which is what keeps wire order
 * identical to Pi's order.
 */
export type MergeableScreenEvent =
  | Extract<ScreenEvent, { kind: 'text_delta' }>
  | Extract<ScreenEvent, { kind: 'thinking_delta' }>
  | Extract<ScreenEvent, { kind: 'tool_output' }>

/**
 * The coalescer holds at most one buffered event. A second target can never be
 * buffered concurrently — the arrival of a different target flushes the first —
 * so ordering needs no sorting and no timers live inside the state machine.
 */
export type CoalescerState = {
  pending: MergeableScreenEvent | null
  /** Wall clock of the first delta merged into `pending`. The caller owns the clock. */
  pendingSinceMs: number
}

export type CoalesceOutcome = {
  state: CoalescerState
  emit: ScreenEvent[]
}
