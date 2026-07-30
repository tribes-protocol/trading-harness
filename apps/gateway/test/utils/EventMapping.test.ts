import type { AgentSessionEvent } from '@earendil-works/pi-coding-agent'
import { describe, expect, it } from 'vitest'

import {
  affectsScreenState,
  mapAgentSessionEvent,
  requiresSnapshotRefresh
} from '@/utils/EventMapping'
import { toJsonText } from '@/utils/JsonText'

import { assistantMessage, userMessage } from './PiFixtures'

const HOST_PATH = '/Users/leo/Desktop/harness/runtime/secret.txt'

describe('mapAgentSessionEvent', () => {
  it('forwards only the delta text and never the partial assistant message', () => {
    const partial = assistantMessage({ timestamp: 1000, text: 'hello wor' })
    const event: AgentSessionEvent = {
      type: 'message_update',
      message: partial,
      assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'ld', partial }
    }

    const mapped = mapAgentSessionEvent(event)

    expect(mapped).toEqual([{ kind: 'text_delta', messageId: 'asst-1000', text: 'ld' }])
    const wire = toJsonText(mapped)
    expect(wire).not.toContain('partial')
    expect(wire).not.toContain('hello wor')
  })

  it('maps thinking deltas to their own target', () => {
    const partial = assistantMessage({ timestamp: 2000, thinking: 'hm' })
    const mapped = mapAgentSessionEvent({
      type: 'message_update',
      message: partial,
      assistantMessageEvent: { type: 'thinking_delta', contentIndex: 0, delta: 'hm', partial }
    })

    expect(mapped).toEqual([{ kind: 'thinking_delta', messageId: 'asst-2000', text: 'hm' }])
  })

  it('drops assistant stream events that carry no delta', () => {
    const partial = assistantMessage({ timestamp: 3000, text: '' })
    const mapped = mapAgentSessionEvent({
      type: 'message_update',
      message: partial,
      assistantMessageEvent: { type: 'toolcall_delta', contentIndex: 0, delta: '{"a', partial }
    })

    expect(mapped).toEqual([])
  })

  it('renders tool_execution_update as a replacing snapshot and drops details', () => {
    const mapped = mapAgentSessionEvent({
      type: 'tool_execution_update',
      toolCallId: 'call-1',
      toolName: 'bash',
      args: { command: 'ls' },
      partialResult: {
        content: [{ type: 'text', text: 'a.ts\nb.ts' }],
        details: { fullOutputPath: HOST_PATH }
      }
    })

    expect(mapped).toEqual([
      { kind: 'tool_output', toolCallId: 'call-1', text: 'a.ts\nb.ts', replace: true }
    ])
    expect(toJsonText(mapped)).not.toContain(HOST_PATH)
  })

  it('never forwards image bytes from a tool result', () => {
    const mapped = mapAgentSessionEvent({
      type: 'tool_execution_end',
      toolCallId: 'call-2',
      toolName: 'read',
      isError: false,
      result: {
        content: [{ type: 'image', mimeType: 'image/png', data: 'AAAABBBBCCCCDDDD' }],
        details: { path: HOST_PATH }
      }
    })

    expect(mapped).toEqual([
      { kind: 'tool_end', toolCallId: 'call-2', isError: false, text: '[image image/png]' }
    ])
    const wire = toJsonText(mapped)
    expect(wire).not.toContain('AAAABBBBCCCCDDDD')
    expect(wire).not.toContain(HOST_PATH)
  })

  it('closes blocks and surfaces the error message without the stack', () => {
    const message = assistantMessage({
      timestamp: 4000,
      thinking: 'uh oh',
      text: 'partial answer',
      stopReason: 'error',
      errorMessage: 'provider returned 529',
      diagnosticStack: `Error: boom\n    at stream (${HOST_PATH}:12:3)`
    })

    const mapped = mapAgentSessionEvent({ type: 'message_end', message })

    expect(mapped).toEqual([
      { kind: 'thinking_end', messageId: 'asst-4000' },
      { kind: 'text_end', messageId: 'asst-4000' },
      { kind: 'error', message: 'provider returned 529' }
    ])
    expect(toJsonText(mapped)).not.toContain(HOST_PATH)
  })

  it('produces no transcript events for a non-assistant message end', () => {
    expect(mapAgentSessionEvent({ type: 'message_end', message: userMessage(5000, 'hi') })).toEqual(
      []
    )
  })

  it('copies the queue into mutable arrays', () => {
    const mapped = mapAgentSessionEvent({
      type: 'queue_update',
      steering: ['stop that'],
      followUp: ['then this']
    })

    expect(mapped).toEqual([{ kind: 'queue', steering: ['stop that'], followUp: ['then this'] }])
  })

  it('maps a retry to a retry event and a failed retry to an error', () => {
    expect(
      mapAgentSessionEvent({
        type: 'auto_retry_start',
        attempt: 2,
        maxAttempts: 5,
        delayMs: 1000,
        errorMessage: 'overloaded'
      })
    ).toEqual([{ kind: 'retry', attempt: 2, maxAttempts: 5, delayMs: 1000, message: 'overloaded' }])

    expect(
      mapAgentSessionEvent({
        type: 'auto_retry_end',
        success: false,
        attempt: 5,
        finalError: 'gave up'
      })
    ).toEqual([{ kind: 'error', message: 'gave up' }])

    expect(mapAgentSessionEvent({ type: 'auto_retry_end', success: true, attempt: 3 })).toEqual([])
  })

  it('emits nothing for events that only change screen metadata', () => {
    expect(mapAgentSessionEvent({ type: 'session_info_changed', name: 'renamed' })).toEqual([])
    expect(mapAgentSessionEvent({ type: 'thinking_level_changed', level: 'high' })).toEqual([])
  })
})

describe('affectsScreenState', () => {
  it('is true for lifecycle events and false for deltas', () => {
    const partial = assistantMessage({ timestamp: 6000, text: 'x' })

    expect(affectsScreenState({ type: 'agent_start' })).toBe(true)
    expect(affectsScreenState({ type: 'queue_update', steering: [], followUp: [] })).toBe(true)
    expect(
      affectsScreenState({
        type: 'message_update',
        message: partial,
        assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'x', partial }
      })
    ).toBe(false)
  })
})

describe('requiresSnapshotRefresh', () => {
  it('is true only for transcript messages that have no ScreenEvent of their own', () => {
    expect(requiresSnapshotRefresh({ type: 'message_end', message: userMessage(7000, 'hi') })).toBe(
      true
    )
    expect(
      requiresSnapshotRefresh({
        type: 'message_end',
        message: assistantMessage({ timestamp: 7100, text: 'hi back' })
      })
    ).toBe(false)
    expect(requiresSnapshotRefresh({ type: 'agent_start' })).toBe(false)
  })
})
