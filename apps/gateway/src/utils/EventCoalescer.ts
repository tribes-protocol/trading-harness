import {
  COALESCE_INTERVAL_MS,
  COALESCE_MAX_BUFFER_CHARS
} from '@tribes-harness/protocol/common/Constants'
import type { ScreenEvent } from '@tribes-harness/protocol/types/ScreenEvent'

import type { CoalesceOutcome, CoalescerState, MergeableScreenEvent } from '@/types/EventCoalescer'

/**
 * Delta coalescer.
 *
 * A pure state machine with no timers inside it: the caller owns the clock and
 * calls `tickCoalescer` on an interval. The invariant that matters is ORDER —
 * anything that is not mergeable into the current buffer flushes the buffer
 * first, so the sequence leaving here is always the sequence Pi produced.
 */

const EMPTY_STATE: CoalescerState = { pending: null, pendingSinceMs: 0 }

export function createCoalescerState(): CoalescerState {
  return EMPTY_STATE
}

function isMergeable(event: ScreenEvent): event is MergeableScreenEvent {
  return (
    event.kind === 'text_delta' || event.kind === 'thinking_delta' || event.kind === 'tool_output'
  )
}

/**
 * Merge `next` into `pending`, or null when they target different blocks.
 *
 * `tool_output` has REPLACE semantics — it is a cumulative snapshot — so merging
 * two of them keeps the latest and discards the earlier one. Concatenating would
 * duplicate the output.
 */
function mergeEvents(
  pending: MergeableScreenEvent,
  next: MergeableScreenEvent
): MergeableScreenEvent | null {
  if (pending.kind === 'text_delta' && next.kind === 'text_delta') {
    return pending.messageId === next.messageId
      ? { ...pending, text: `${pending.text}${next.text}` }
      : null
  }
  if (pending.kind === 'thinking_delta' && next.kind === 'thinking_delta') {
    return pending.messageId === next.messageId
      ? { ...pending, text: `${pending.text}${next.text}` }
      : null
  }
  if (pending.kind === 'tool_output' && next.kind === 'tool_output') {
    return pending.toolCallId === next.toolCallId && next.replace ? next : null
  }
  return null
}

export function flushCoalescer(state: CoalescerState): CoalesceOutcome {
  if (state.pending === null) {
    return { state: EMPTY_STATE, emit: [] }
  }
  return { state: EMPTY_STATE, emit: [state.pending] }
}

/** Flush once the buffered event has been held for the coalescing window. */
export function tickCoalescer(state: CoalescerState, nowMs: number): CoalesceOutcome {
  if (state.pending === null || nowMs - state.pendingSinceMs < COALESCE_INTERVAL_MS) {
    return { state, emit: [] }
  }
  return flushCoalescer(state)
}

/**
 * Buffer the event, or emit it immediately once an ACCUMULATING buffer has grown
 * past the size cap.
 *
 * The cap bounds how large a merged delta frame may get, and only `text_delta`
 * and `thinking_delta` concatenate. `tool_output` is a cumulative snapshot that
 * REPLACES: merging never grows the buffer, and `renderToolOutput` has already
 * bounded it at MAX_TOOL_OUTPUT_CHARS. Applying the cap to it would emit every
 * snapshot over 2 KB on arrival, so a single `bun test` would ship one ~20 KB
 * frame per output chunk — exactly the frame storm this file exists to prevent.
 */
function bufferOrFlushBySize(pending: MergeableScreenEvent, sinceMs: number): CoalesceOutcome {
  const accumulates = pending.kind !== 'tool_output'
  if (accumulates && pending.text.length >= COALESCE_MAX_BUFFER_CHARS) {
    return { state: EMPTY_STATE, emit: [pending] }
  }
  return { state: { pending, pendingSinceMs: sinceMs }, emit: [] }
}

export function pushCoalescedEvent(
  state: CoalescerState,
  event: ScreenEvent,
  nowMs: number
): CoalesceOutcome {
  if (!isMergeable(event)) {
    const flushed = flushCoalescer(state)
    return { state: flushed.state, emit: [...flushed.emit, event] }
  }

  const pending = state.pending
  if (pending === null) {
    return bufferOrFlushBySize(event, nowMs)
  }

  const merged = mergeEvents(pending, event)
  if (merged === null) {
    // Different target: the buffered event must land before the new one starts.
    const buffered = bufferOrFlushBySize(event, nowMs)
    return { state: buffered.state, emit: [pending, ...buffered.emit] }
  }

  return bufferOrFlushBySize(merged, state.pendingSinceMs)
}
