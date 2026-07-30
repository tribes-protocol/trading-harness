import {
  COALESCE_INTERVAL_MS,
  COALESCE_MAX_BUFFER_CHARS
} from '@tribes-harness/protocol/common/Constants'
import type { ScreenEvent } from '@tribes-harness/protocol/types/ScreenEvent'
import { describe, expect, it } from 'vitest'

import type { CoalescerState } from '@/types/EventCoalescer'
import {
  createCoalescerState,
  flushCoalescer,
  pushCoalescedEvent,
  tickCoalescer
} from '@/utils/EventCoalescer'

function pushAll(events: ScreenEvent[], nowMs: number): ScreenEvent[] {
  let state: CoalescerState = createCoalescerState()
  const emitted: ScreenEvent[] = []
  for (const event of events) {
    const outcome = pushCoalescedEvent(state, event, nowMs)
    state = outcome.state
    emitted.push(...outcome.emit)
  }
  emitted.push(...flushCoalescer(state).emit)
  return emitted
}

function textDelta(messageId: string, text: string): ScreenEvent {
  return { kind: 'text_delta', messageId, text }
}

describe('pushCoalescedEvent', () => {
  it('merges consecutive deltas aimed at the same target', () => {
    expect(
      pushAll([textDelta('m1', 'he'), textDelta('m1', 'll'), textDelta('m1', 'o')], 0)
    ).toEqual([textDelta('m1', 'hello')])
  })

  it('flushes the buffer when the target changes, preserving order', () => {
    expect(pushAll([textDelta('m1', 'a'), textDelta('m2', 'b'), textDelta('m1', 'c')], 0)).toEqual([
      textDelta('m1', 'a'),
      textDelta('m2', 'b'),
      textDelta('m1', 'c')
    ])
  })

  it('does not merge a text delta into a thinking delta', () => {
    expect(
      pushAll(
        [{ kind: 'thinking_delta', messageId: 'm1', text: 'think' }, textDelta('m1', 'speak')],
        0
      )
    ).toEqual([
      { kind: 'thinking_delta', messageId: 'm1', text: 'think' },
      textDelta('m1', 'speak')
    ])
  })

  it('flushes the buffer before a non-mergeable event so wire order matches Pi order', () => {
    expect(
      pushAll(
        [textDelta('m1', 'a'), { kind: 'text_end', messageId: 'm1' }, { kind: 'turn_end' }],
        0
      )
    ).toEqual([textDelta('m1', 'a'), { kind: 'text_end', messageId: 'm1' }, { kind: 'turn_end' }])
  })

  it('keeps the latest tool_output snapshot instead of concatenating', () => {
    const first: ScreenEvent = {
      kind: 'tool_output',
      toolCallId: 'call-1',
      text: 'line one',
      replace: true
    }
    const second: ScreenEvent = {
      kind: 'tool_output',
      toolCallId: 'call-1',
      text: 'line one\nline two',
      replace: true
    }

    expect(pushAll([first, second], 0)).toEqual([second])
  })

  it('does not merge tool_output for different tool calls', () => {
    const a: ScreenEvent = { kind: 'tool_output', toolCallId: 'a', text: 'x', replace: true }
    const b: ScreenEvent = { kind: 'tool_output', toolCallId: 'b', text: 'y', replace: true }

    expect(pushAll([a, b], 0)).toEqual([a, b])
  })

  it('flushes as soon as the buffer crosses the size cap', () => {
    const chunk = 'x'.repeat(COALESCE_MAX_BUFFER_CHARS)
    const outcome = pushCoalescedEvent(createCoalescerState(), textDelta('m1', chunk), 0)

    expect(outcome.emit).toEqual([textDelta('m1', chunk)])
    expect(outcome.state.pending).toBeNull()
  })

  it('holds a delta below the size cap until the caller flushes it', () => {
    const outcome = pushCoalescedEvent(createCoalescerState(), textDelta('m1', 'small'), 0)

    expect(outcome.emit).toEqual([])
    expect(outcome.state.pending).toEqual(textDelta('m1', 'small'))
  })

  it('does not apply the size cap to a tool_output snapshot', () => {
    // Replacing never grows the buffer, so the cap would only defeat coalescing:
    // every chunk of a long bash run would ship its own full snapshot frame.
    const snapshot: ScreenEvent = {
      kind: 'tool_output',
      toolCallId: 'call-1',
      text: 'z'.repeat(COALESCE_MAX_BUFFER_CHARS * 4),
      replace: true
    }
    const outcome = pushCoalescedEvent(createCoalescerState(), snapshot, 0)

    expect(outcome.emit).toEqual([])
    expect(outcome.state.pending).toEqual(snapshot)
  })
})

describe('tickCoalescer', () => {
  it('holds the buffer until the coalescing window elapses', () => {
    const buffered = pushCoalescedEvent(createCoalescerState(), textDelta('m1', 'a'), 1_000)

    expect(tickCoalescer(buffered.state, 1_000 + COALESCE_INTERVAL_MS - 1).emit).toEqual([])
    expect(tickCoalescer(buffered.state, 1_000 + COALESCE_INTERVAL_MS).emit).toEqual([
      textDelta('m1', 'a')
    ])
  })

  it('keeps the start time of the first merged delta, not the last', () => {
    let state = pushCoalescedEvent(createCoalescerState(), textDelta('m1', 'a'), 1_000).state
    state = pushCoalescedEvent(state, textDelta('m1', 'b'), 1_050).state

    expect(tickCoalescer(state, 1_000 + COALESCE_INTERVAL_MS).emit).toEqual([textDelta('m1', 'ab')])
  })

  it('is a no-op on an empty buffer', () => {
    expect(tickCoalescer(createCoalescerState(), 10_000).emit).toEqual([])
  })
})
