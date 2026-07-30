import type { AgentSessionEvent } from '@earendil-works/pi-coding-agent'
import type { ScreenEvent } from '@tribes-harness/protocol/types/ScreenEvent'

import { messageBlockId } from '@/utils/ScreenIdentity'
import { renderToolInvocation, renderToolOutput } from '@/utils/ToolRendering'

/**
 * Pi's `AgentSessionEvent` -> the normalized `ScreenEvent` wire union.
 *
 * The three rules this file exists to enforce:
 *
 *  1. Never forward `assistantMessageEvent.partial`. Every delta variant also
 *     carries the entire partial assistant message; forwarding it verbatim costs
 *     O(n²) bytes per turn. Only the delta text crosses the wire.
 *  2. Never forward a raw tool payload. `args`, `partialResult` and `result` are
 *     typed `any` and carry `details` full of absolute host paths, so they go
 *     through the zod-narrowing renderers.
 *  3. Never forward a stack. `AssistantMessageDiagnostic.error.stack` is not read
 *     here at all; only the user-facing `errorMessage` becomes an `error` event.
 */
export function mapAgentSessionEvent(event: AgentSessionEvent): ScreenEvent[] {
  switch (event.type) {
    case 'agent_start':
      return [{ kind: 'agent_start' }]

    case 'agent_end':
      return [{ kind: 'agent_end', willRetry: event.willRetry }]

    case 'turn_start':
      return [{ kind: 'turn_start' }]

    case 'turn_end':
      return [{ kind: 'turn_end' }]

    case 'message_start':
      // The transcript-level effect of a new message is handled by a snapshot
      // refresh; there is nothing to stream yet.
      return []

    case 'message_update':
      return mapAssistantMessageEvent(event)

    case 'message_end':
      return mapMessageEnd(event)

    case 'tool_execution_start':
      return [
        {
          kind: 'tool_start',
          invocation: renderToolInvocation(event.toolCallId, event.toolName, event.args)
        }
      ]

    case 'tool_execution_update':
      // `partialResult` is a CUMULATIVE snapshot, not a delta: Pi's bash tool
      // tail-truncates it, so it stops prefix-extending and appending would
      // corrupt the output. It always replaces.
      return [
        {
          kind: 'tool_output',
          toolCallId: event.toolCallId,
          text: renderToolOutput(event.partialResult),
          replace: true
        }
      ]

    case 'tool_execution_end':
      return [
        {
          kind: 'tool_end',
          toolCallId: event.toolCallId,
          isError: event.isError,
          text: renderToolOutput(event.result)
        }
      ]

    case 'queue_update':
      return [
        {
          kind: 'queue',
          steering: [...event.steering],
          followUp: [...event.followUp]
        }
      ]

    case 'compaction_start':
      return [{ kind: 'compaction_start' }]

    case 'compaction_end':
      return mapCompactionEnd(event)

    case 'auto_retry_start':
      return [
        {
          kind: 'retry',
          attempt: event.attempt,
          maxAttempts: event.maxAttempts,
          delayMs: event.delayMs,
          message: event.errorMessage
        }
      ]

    case 'auto_retry_end':
      return event.success
        ? []
        : [{ kind: 'error', message: event.finalError ?? 'Automatic retry failed' }]

    case 'session_info_changed':
    case 'thinking_level_changed':
      // Both are screen state, not transcript content; they ride the next
      // `screen.state` frame.
      return []
  }
}

function mapAssistantMessageEvent(
  event: Extract<AgentSessionEvent, { type: 'message_update' }>
): ScreenEvent[] {
  const messageId = messageBlockId(event.message)
  const inner = event.assistantMessageEvent
  switch (inner.type) {
    case 'text_delta':
      return [{ kind: 'text_delta', messageId, text: inner.delta }]
    case 'text_end':
      return [{ kind: 'text_end', messageId }]
    case 'thinking_delta':
      return [{ kind: 'thinking_delta', messageId, text: inner.delta }]
    case 'thinking_end':
      return [{ kind: 'thinking_end', messageId }]
    case 'start':
    case 'text_start':
    case 'thinking_start':
    case 'toolcall_start':
    case 'toolcall_delta':
    case 'toolcall_end':
    case 'done':
    case 'error':
      // No delta to forward. `done` and `error` both carry the whole final
      // message; the blocks they would close are closed by `message_end`.
      return []
  }
}

/**
 * Close the blocks the message opened, and surface a failed turn.
 *
 * The per-stream `text_end` / `thinking_end` already close blocks on the happy
 * path; these are re-emitted because an aborted or errored stream terminates
 * with `error` and never sends them, and a block stuck in `streaming` renders as
 * a spinner that never stops. Both events are idempotent for the client — they
 * only move a block to `done` — so the duplicate is cheaper than the state
 * needed to suppress it in a pure mapper.
 */
function mapMessageEnd(event: Extract<AgentSessionEvent, { type: 'message_end' }>): ScreenEvent[] {
  const message = event.message
  if (message.role !== 'assistant') {
    return []
  }
  const messageId = messageBlockId(message)
  const events: ScreenEvent[] = []
  if (message.content.some((block) => block.type === 'thinking')) {
    events.push({ kind: 'thinking_end', messageId })
  }
  if (message.content.some((block) => block.type === 'text')) {
    events.push({ kind: 'text_end', messageId })
  }
  if (message.stopReason === 'error' && message.errorMessage !== undefined) {
    events.push({ kind: 'error', message: message.errorMessage })
  }
  return events
}

function mapCompactionEnd(
  event: Extract<AgentSessionEvent, { type: 'compaction_end' }>
): ScreenEvent[] {
  const events: ScreenEvent[] = [{ kind: 'compaction_end', summary: event.result?.summary ?? null }]
  if (event.errorMessage !== undefined) {
    events.push({ kind: 'error', message: event.errorMessage })
  }
  return events
}

/**
 * Whether this event can change anything in `ScreenState` (status, cost, context
 * usage, queue, model, thinking level). Deltas deliberately do not, so a token
 * storm never turns into a `screen.state` storm.
 */
export function affectsScreenState(event: AgentSessionEvent): boolean {
  switch (event.type) {
    case 'agent_start':
    case 'agent_end':
    case 'turn_start':
    case 'turn_end':
    case 'message_end':
    case 'queue_update':
    case 'compaction_start':
    case 'compaction_end':
    case 'thinking_level_changed':
    case 'auto_retry_start':
    case 'auto_retry_end':
      return true
    case 'message_start':
    case 'message_update':
    case 'tool_execution_start':
    case 'tool_execution_update':
    case 'tool_execution_end':
    case 'session_info_changed':
      return false
  }
}

/**
 * Whether the transcript gained a block that has no `ScreenEvent` to describe it.
 *
 * `ScreenEvent` covers assistant output and tools; user prompts, `!` bash runs,
 * extension messages and summaries only exist as blocks. The screen answers
 * these with a fresh `screen.snapshot` — Pi appends the message to
 * `AgentState.messages` at `message_end`, so by the time this returns true the
 * snapshot will contain it.
 */
export function requiresSnapshotRefresh(event: AgentSessionEvent): boolean {
  if (event.type !== 'message_end') {
    return false
  }
  const role = event.message.role
  return role !== 'assistant' && role !== 'toolResult'
}
