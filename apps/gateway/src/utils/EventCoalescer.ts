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
 * `tool_output` arrives with BOTH semantics and they merge in opposite ways:
 *  - `replace: true` is a cumulative snapshot (Pi's own tool stream), so merging
 *    keeps the latest and discards the earlier one. Concatenating would duplicate
 *    the output.
 *  - `replace: false` is a chunk (a `!` bash run streams through `onChunk`), so
 *    merging concatenates exactly like a text delta. Keeping the latest would
 *    throw output away.
 *
 * The two never merge into each other even on the same id: a snapshot followed by
 * a chunk has no coherent combination, so the buffered one is flushed first.
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
    if (pending.toolCallId !== next.toolCallId || pending.replace !== next.replace) {
      return null
    }
    return next.replace ? next : { ...pending, text: `${pending.text}${next.text}` }
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
 * The cap bounds how large a merged delta frame may get, so it applies to exactly
 * the events that concatenate. A `tool_output` SNAPSHOT (`replace: true`) does
 * not: merging never grows the buffer, and `renderToolOutput` has already bounded
 * it at MAX_TOOL_OUTPUT_CHARS. Applying the cap to it would emit every snapshot
 * over 2 KB on arrival, so a single `bun test` would ship one ~20 KB frame per
 * output chunk — exactly the frame storm this file exists to prevent. A
 * `tool_output` CHUNK (`replace: false`) does concatenate, so it is capped like a
 * text delta.
 */
function bufferOrFlushBySize(pending: MergeableScreenEvent, sinceMs: number): CoalesceOutcome {
  const accumulates = pending.kind !== 'tool_output' || !pending.replace
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
