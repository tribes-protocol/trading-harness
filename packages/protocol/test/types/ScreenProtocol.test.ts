import { describe, expect, it } from 'vitest'

import { PROTOCOL_VERSION } from '@/common/Constants'
import { ScreenBlockSchema } from '@/types/ScreenBlock'
import { ScreenCommandSchema } from '@/types/ScreenCommand'
import { ScreenEventSchema, ToolInvocationSchema } from '@/types/ScreenEvent'
import { ClientFrameSchema, ServerFrameSchema } from '@/types/ScreenProtocol'

/**
 * The gateway and the browser are separate processes that only agree through
 * these schemas, and both sides `safeParse` everything they receive. That makes
 * the schemas the contract itself rather than documentation of it — so these
 * tests pin the shapes that a rename or a widened field would silently break.
 */

describe('ClientFrameSchema', () => {
  it('accepts an attach with and without a durable cursor', () => {
    expect(
      ClientFrameSchema.safeParse({ t: 'attach', screenId: 'main', sinceEntryId: '3e2acee1' })
        .success
    ).toBe(true)
    expect(
      ClientFrameSchema.safeParse({ t: 'attach', screenId: 'main', sinceEntryId: null }).success
    ).toBe(true)
    expect(ClientFrameSchema.safeParse({ t: 'attach', screenId: 'main' }).success).toBe(true)
  })

  it('accepts a prompt with each streaming behaviour Pi supports', () => {
    for (const behavior of ['steer', 'followUp', null]) {
      const parsed = ClientFrameSchema.safeParse({
        t: 'prompt',
        screenId: 'main',
        text: 'what should I trade',
        streamingBehavior: behavior
      })
      expect(parsed.success, `streamingBehavior ${String(behavior)}`).toBe(true)
    }
  })

  it('rejects a streaming behaviour Pi does not have', () => {
    const parsed = ClientFrameSchema.safeParse({
      t: 'prompt',
      screenId: 'main',
      text: 'hi',
      streamingBehavior: 'interrupt'
    })
    expect(parsed.success).toBe(false)
  })

  it('rejects an unknown frame kind and a frame missing its screen', () => {
    expect(ClientFrameSchema.safeParse({ t: 'shutdown', screenId: 'main' }).success).toBe(false)
    expect(ClientFrameSchema.safeParse({ t: 'abort' }).success).toBe(false)
  })

  it('rejects the empty object a hostile socket is most likely to send', () => {
    expect(ClientFrameSchema.safeParse({}).success).toBe(false)
    expect(ClientFrameSchema.safeParse(null).success).toBe(false)
    expect(ClientFrameSchema.safeParse('attach').success).toBe(false)
  })
})

describe('ServerFrameSchema', () => {
  it('round-trips a hello carrying the negotiated version', () => {
    const parsed = ServerFrameSchema.safeParse({
      t: 'hello',
      protocolVersion: PROTOCOL_VERSION,
      screens: [{ screenId: 'main', title: 'main' }]
    })
    expect(parsed.success).toBe(true)
  })

  it('round-trips a snapshot with every block type', () => {
    const blocks = [
      { type: 'user', id: 'local-1', text: 'go' },
      { type: 'assistant', id: 'asst-1', text: 'on it', status: 'streaming' },
      { type: 'thinking', id: 'asst-1-thinking', text: 'weighing', status: 'done' },
      {
        type: 'tool',
        id: 'call-1',
        invocation: {
          toolCallId: 'call-1',
          toolName: 'bash',
          title: 'bash',
          subtitle: 'tribes-cli market list',
          argsPreview: '{ "command": "tribes-cli market list" }'
        },
        output: 'BTC 64000',
        status: 'done'
      },
      { type: 'notice', id: 'notice-0', level: 'warning', text: 'compacted' }
    ]
    const parsed = ServerFrameSchema.safeParse({
      t: 'screen.snapshot',
      screenId: 'main',
      seq: 7,
      leafEntryId: '3e2acee1',
      blocks,
      state: {
        status: 'streaming',
        model: 'openrouter/z-ai/glm-5.2',
        thinkingLevel: 'medium',
        contextPercent: 31,
        costUsd: 0.42,
        queue: { steering: [], followUp: [] }
      }
    })
    expect(parsed.success).toBe(true)
    expect(parsed.success ? parsed.data.t : null).toBe('screen.snapshot')
  })

  it('allows the nullable state fields that are genuinely unknown early on', () => {
    // `model` is null until one resolves and `contextPercent` is null until the
    // first assistant response reports usage. Both are real states, not errors.
    const parsed = ServerFrameSchema.safeParse({
      t: 'screen.state',
      screenId: 'main',
      seq: 1,
      state: {
        status: 'idle',
        model: null,
        thinkingLevel: 'off',
        contextPercent: null,
        costUsd: 0,
        queue: { steering: [], followUp: [] }
      }
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects a status the UI has no rendering for', () => {
    const parsed = ServerFrameSchema.safeParse({
      t: 'screen.state',
      screenId: 'main',
      seq: 1,
      state: {
        status: 'thinking',
        model: null,
        thinkingLevel: 'off',
        contextPercent: null,
        costUsd: 0,
        queue: { steering: [], followUp: [] }
      }
    })
    expect(parsed.success).toBe(false)
  })
})

describe('ScreenEventSchema', () => {
  it('accepts every event kind the gateway can emit', () => {
    const events = [
      { kind: 'agent_start' },
      { kind: 'agent_end', willRetry: false },
      { kind: 'turn_start' },
      { kind: 'turn_end' },
      { kind: 'text_delta', messageId: 'asst-1', text: 'hel' },
      { kind: 'text_end', messageId: 'asst-1' },
      { kind: 'thinking_delta', messageId: 'asst-1', text: 'hmm' },
      { kind: 'thinking_end', messageId: 'asst-1' },
      {
        kind: 'tool_start',
        invocation: {
          toolCallId: 'call-1',
          toolName: 'bash',
          title: 'bash',
          subtitle: 'ls',
          argsPreview: '{}'
        }
      },
      { kind: 'tool_output', toolCallId: 'call-1', text: 'a\nb', replace: true },
      { kind: 'tool_end', toolCallId: 'call-1', isError: false, text: 'a\nb' },
      { kind: 'queue', steering: ['tighten it'], followUp: [] },
      { kind: 'compaction_start' },
      { kind: 'compaction_end', summary: 'so far…' },
      { kind: 'retry', attempt: 1, maxAttempts: 3, delayMs: 2000, message: 'overloaded' },
      { kind: 'error', message: 'aborted' }
    ]
    for (const event of events) {
      expect(ScreenEventSchema.safeParse(event).success, `${event.kind} must parse`).toBe(true)
    }
  })

  it('requires tool_output to declare its replace semantics', () => {
    // Pi's bash streams a cumulative tail-truncated snapshot: a client that
    // appends when it should replace silently corrupts the output. Making the
    // flag required is what stops that from ever being implicit.
    const parsed = ScreenEventSchema.safeParse({
      kind: 'tool_output',
      toolCallId: 'call-1',
      text: 'partial'
    })
    expect(parsed.success).toBe(false)
  })

  it('rejects a raw Pi event forwarded verbatim', () => {
    // The normalized union is deliberately not AgentSessionEvent — forwarding
    // Pi's own events would ship the whole partial assistant message on every
    // token, plus `any`-typed tool payloads and host paths.
    const parsed = ScreenEventSchema.safeParse({
      type: 'message_update',
      message: {},
      assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'hi', partial: {} }
    })
    expect(parsed.success).toBe(false)
  })
})

describe('ScreenBlockSchema', () => {
  it('rejects a tool block without its invocation', () => {
    const parsed = ScreenBlockSchema.safeParse({
      type: 'tool',
      id: 'call-1',
      output: '',
      status: 'pending'
    })
    expect(parsed.success).toBe(false)
  })

  it('rejects a notice at a level the UI cannot style', () => {
    const parsed = ScreenBlockSchema.safeParse({
      type: 'notice',
      id: 'notice-0',
      level: 'critical',
      text: 'boom'
    })
    expect(parsed.success).toBe(false)
  })
})

describe('the `/` palette and `!` bash frames', () => {
  it('accepts a bash frame', () => {
    const parsed = ClientFrameSchema.safeParse({
      t: 'bash',
      screenId: 'main',
      command: 'tribes-cli market list'
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects a bash frame with no command', () => {
    // A hostile socket sends this; the gateway must not reach executeBash with
    // undefined.
    expect(ClientFrameSchema.safeParse({ t: 'bash', screenId: 'main' }).success).toBe(false)
    expect(ClientFrameSchema.safeParse({ t: 'bash', screenId: 'main', command: 42 }).success).toBe(
      false
    )
  })

  it('accepts a commands frame carrying all three sources', () => {
    const parsed = ServerFrameSchema.safeParse({
      t: 'screen.commands',
      screenId: 'main',
      commands: [
        { name: 'tribes:login', description: 'Log in to Tribes', source: 'extension' },
        { name: 'thesis', description: 'Run the thesis desk', source: 'prompt' },
        { name: 'skill:alpha-scout', description: 'Find trending tokens', source: 'skill' }
      ]
    })
    expect(parsed.success).toBe(true)
  })

  it('accepts a command with no description', () => {
    // An extension may register without one.
    const parsed = ScreenCommandSchema.safeParse({ name: 'refresh', source: 'extension' })
    expect(parsed.success).toBe(true)
  })

  it('rejects a command from a source the palette cannot badge', () => {
    const parsed = ScreenCommandSchema.safeParse({ name: 'x', source: 'builtin' })
    expect(parsed.success).toBe(false)
  })

  it('accepts an empty palette', () => {
    const parsed = ServerFrameSchema.safeParse({
      t: 'screen.commands',
      screenId: 'main',
      commands: []
    })
    expect(parsed.success).toBe(true)
  })

  it('accepts a tool invocation with and without an origin', () => {
    // Nullish for wire compatibility: a frame minted before the field existed must
    // still parse, and means `agent`.
    const base = {
      toolCallId: 'call-1',
      toolName: 'bash',
      title: 'bash',
      subtitle: 'ls',
      argsPreview: '{}'
    }
    expect(ToolInvocationSchema.safeParse(base).success).toBe(true)
    expect(ToolInvocationSchema.safeParse({ ...base, origin: 'user' }).success).toBe(true)
    expect(ToolInvocationSchema.safeParse({ ...base, origin: 'agent' }).success).toBe(true)
    expect(ToolInvocationSchema.safeParse({ ...base, origin: 'system' }).success).toBe(false)
  })
})
