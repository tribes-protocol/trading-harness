import { PROTOCOL_VERSION } from '@tribes-harness/protocol/common/Constants'
import type { ScreenBlock } from '@tribes-harness/protocol/types/ScreenBlock'
import type { ScreenEvent, ToolInvocation } from '@tribes-harness/protocol/types/ScreenEvent'
import type { ScreenState, ServerFrame } from '@tribes-harness/protocol/types/ScreenProtocol'
import { describe, expect, it } from 'vitest'

import type { PiScreensState, ScreenViewState } from '@/types/ScreenView'
import { INITIAL_SCREENS_STATE, reduceScreens } from '@/utils/ScreenState'

const SCREEN_ID = 'main'

const IDLE_STATE: ScreenState = {
  status: 'idle',
  model: 'anthropic/claude-opus-4',
  thinkingLevel: 'medium',
  contextPercent: 12,
  costUsd: 0.42,
  queue: { steering: [], followUp: [] }
}

const INVOCATION: ToolInvocation = {
  toolCallId: 'call-1',
  toolName: 'bash',
  title: 'bash',
  subtitle: 'bun run build',
  argsPreview: '{ "command": "bun run build" }'
}

function hello(): ServerFrame {
  return {
    t: 'hello',
    protocolVersion: PROTOCOL_VERSION,
    screens: [{ screenId: SCREEN_ID, title: 'main' }]
  }
}

function snapshot(seq: number, blocks: ScreenBlock[]): ServerFrame {
  return {
    t: 'screen.snapshot',
    screenId: SCREEN_ID,
    seq,
    leafEntryId: 'entry-9',
    blocks,
    state: IDLE_STATE
  }
}

function event(seq: number, screenEvent: ScreenEvent): ServerFrame {
  return { t: 'screen.event', screenId: SCREEN_ID, seq, event: screenEvent }
}

function apply(state: PiScreensState, ...frames: ServerFrame[]): PiScreensState {
  return frames.reduce((current, frame) => reduceScreens(current, { type: 'frame', frame }), state)
}

function screenOf(state: PiScreensState): ScreenViewState {
  const screen = state.screens[SCREEN_ID]
  if (screen === undefined) {
    throw new Error('expected the main screen to exist')
  }
  return screen
}

function attached(...frames: ServerFrame[]): PiScreensState {
  return apply(INITIAL_SCREENS_STATE, hello(), snapshot(1, []), ...frames)
}

describe('reduceScreens — handshake', () => {
  it('creates a screen per summary and clears the mismatch flag', () => {
    const state = apply(INITIAL_SCREENS_STATE, hello())
    expect(state.screenOrder).toEqual([SCREEN_ID])
    expect(state.protocolMismatch).toBe(false)
    expect(screenOf(state).hydrated).toBe(false)
  })

  it('refuses a foreign protocol version instead of rendering it', () => {
    const state = apply(INITIAL_SCREENS_STATE, {
      t: 'hello',
      protocolVersion: PROTOCOL_VERSION + 1,
      screens: [{ screenId: SCREEN_ID, title: 'main' }]
    })
    expect(state.protocolMismatch).toBe(true)
    expect(state.screenOrder).toEqual([])
  })

  it('keeps existing blocks when a reconnect re-announces a known screen', () => {
    const withBlocks = attached(event(2, { kind: 'turn_start' }))
    const reconnected = apply(withBlocks, hello())
    expect(screenOf(reconnected).blocks).toHaveLength(1)
    expect(screenOf(reconnected).hydrated).toBe(true)
  })

  it('adopts the snapshot as authoritative and records the resume cursor', () => {
    const state = attached()
    const screen = screenOf(state)
    expect(screen.hydrated).toBe(true)
    expect(screen.leafEntryId).toBe('entry-9')
    expect(screen.lastSeq).toBe(1)
    expect(screen.state.costUsd).toBe(0.42)
  })
})

describe('reduceScreens — assistant text', () => {
  it('appends a pending placeholder on turn_start', () => {
    const screen = screenOf(attached(event(2, { kind: 'turn_start' })))
    expect(screen.blocks).toEqual([
      { type: 'assistant', id: 'pending-0', text: '', status: 'pending' }
    ])
    expect(screen.pendingBlockId).toBe('pending-0')
  })

  it('adopts the placeholder IN PLACE on the first delta — same id, no remount', () => {
    const state = attached(
      event(2, { kind: 'turn_start' }),
      event(3, { kind: 'text_delta', messageId: 'msg-1', text: 'Hel' })
    )
    const screen = screenOf(state)
    expect(screen.blocks).toHaveLength(1)
    expect(screen.blocks[0]).toEqual({
      type: 'assistant',
      id: 'pending-0',
      text: 'Hel',
      status: 'streaming'
    })
    expect(screen.pendingBlockId).toBeNull()
  })

  it('routes later deltas of the same message to the adopted block', () => {
    const state = attached(
      event(2, { kind: 'turn_start' }),
      event(3, { kind: 'text_delta', messageId: 'msg-1', text: 'Hel' }),
      event(4, { kind: 'text_delta', messageId: 'msg-1', text: 'lo' })
    )
    const screen = screenOf(state)
    expect(screen.blocks).toHaveLength(1)
    expect(screen.blocks[0]).toMatchObject({ id: 'pending-0', text: 'Hello' })
  })

  it('opens a block keyed by messageId when there is no placeholder to adopt', () => {
    const screen = screenOf(
      attached(event(2, { kind: 'text_delta', messageId: 'msg-9', text: 'hi' }))
    )
    expect(screen.blocks[0]).toEqual({
      type: 'assistant',
      id: 'msg-9',
      text: 'hi',
      status: 'streaming'
    })
  })

  it('settles the adopted block on text_end even though its id is not the messageId', () => {
    const state = attached(
      event(2, { kind: 'turn_start' }),
      event(3, { kind: 'text_delta', messageId: 'msg-1', text: 'done' }),
      event(4, { kind: 'text_end', messageId: 'msg-1' })
    )
    expect(screenOf(state).blocks[0]).toMatchObject({ id: 'pending-0', status: 'done' })
  })

  it('drops a placeholder no delta ever adopted and settles streaming text on turn_end', () => {
    const state = attached(
      event(2, { kind: 'text_delta', messageId: 'msg-1', text: 'partial' }),
      event(3, { kind: 'turn_start' }),
      event(4, { kind: 'turn_end' })
    )
    const screen = screenOf(state)
    expect(screen.blocks).toEqual([
      { type: 'assistant', id: 'msg-1', text: 'partial', status: 'done' }
    ])
    expect(screen.pendingBlockId).toBeNull()
  })

  it('gives each turn its own placeholder id so an adopted one is never overwritten', () => {
    const state = attached(
      event(2, { kind: 'turn_start' }),
      event(3, { kind: 'text_delta', messageId: 'msg-1', text: 'first' }),
      event(4, { kind: 'turn_end' }),
      event(5, { kind: 'turn_start' })
    )
    expect(screenOf(state).blocks.map((block) => block.id)).toEqual(['pending-0', 'pending-1'])
  })
})

describe('reduceScreens — thinking', () => {
  it('keys reasoning to messageId + "-thinking" and accumulates in place', () => {
    const state = attached(
      event(2, { kind: 'thinking_delta', messageId: 'msg-1', text: 'weigh' }),
      event(3, { kind: 'thinking_delta', messageId: 'msg-1', text: 'ing' }),
      event(4, { kind: 'thinking_end', messageId: 'msg-1' })
    )
    expect(screenOf(state).blocks).toEqual([
      { type: 'thinking', id: 'msg-1-thinking', text: 'weighing', status: 'done' }
    ])
  })

  it('keeps reasoning and prose in separate blocks for the same message', () => {
    const state = attached(
      event(2, { kind: 'thinking_delta', messageId: 'msg-1', text: 'hmm' }),
      event(3, { kind: 'text_delta', messageId: 'msg-1', text: 'answer' })
    )
    expect(screenOf(state).blocks.map((block) => block.id)).toEqual(['msg-1-thinking', 'msg-1'])
  })
})

describe('reduceScreens — tools', () => {
  it('appends a running block keyed by toolCallId and appends output by default', () => {
    const state = attached(
      event(2, { kind: 'tool_start', invocation: INVOCATION }),
      event(3, { kind: 'tool_output', toolCallId: 'call-1', text: 'line 1\n', replace: false }),
      event(4, { kind: 'tool_output', toolCallId: 'call-1', text: 'line 2\n', replace: false })
    )
    expect(screenOf(state).blocks[0]).toMatchObject({
      id: 'call-1',
      output: 'line 1\nline 2\n',
      status: 'streaming'
    })
  })

  it('REPLACES the buffer when replace is true — a cumulative snapshot, not a delta', () => {
    const state = attached(
      event(2, { kind: 'tool_start', invocation: INVOCATION }),
      event(3, { kind: 'tool_output', toolCallId: 'call-1', text: 'aaa', replace: false }),
      event(4, {
        kind: 'tool_output',
        toolCallId: 'call-1',
        text: '…truncated tail',
        replace: true
      })
    )
    expect(screenOf(state).blocks[0]).toMatchObject({ output: '…truncated tail' })
  })

  it('marks a failed tool as an error and swaps in the finalized text', () => {
    const state = attached(
      event(2, { kind: 'tool_start', invocation: INVOCATION }),
      event(3, { kind: 'tool_output', toolCallId: 'call-1', text: 'partial', replace: false }),
      event(4, { kind: 'tool_end', toolCallId: 'call-1', isError: true, text: 'exit 1' })
    )
    expect(screenOf(state).blocks[0]).toMatchObject({ output: 'exit 1', status: 'error' })
  })

  it('keeps the streamed buffer when tool_end carries no text of its own', () => {
    const state = attached(
      event(2, { kind: 'tool_start', invocation: INVOCATION }),
      event(3, { kind: 'tool_output', toolCallId: 'call-1', text: 'kept', replace: false }),
      event(4, { kind: 'tool_end', toolCallId: 'call-1', isError: false, text: '' })
    )
    expect(screenOf(state).blocks[0]).toMatchObject({ output: 'kept', status: 'done' })
  })
})

describe('reduceScreens — referential stability', () => {
  it('replaces exactly one block object per delta and leaves the rest identical', () => {
    const before = attached(
      event(2, { kind: 'text_delta', messageId: 'msg-1', text: 'prose' }),
      event(3, { kind: 'tool_start', invocation: INVOCATION }),
      event(4, { kind: 'thinking_delta', messageId: 'msg-2', text: 'hmm' })
    )
    const after = apply(
      before,
      event(5, { kind: 'tool_output', toolCallId: 'call-1', text: 'out', replace: false })
    )

    const beforeBlocks = screenOf(before).blocks
    const afterBlocks = screenOf(after).blocks
    expect(afterBlocks).toHaveLength(3)
    expect(afterBlocks[0]).toBe(beforeBlocks[0])
    expect(afterBlocks[1]).not.toBe(beforeBlocks[1])
    expect(afterBlocks[2]).toBe(beforeBlocks[2])
  })

  it('leaves other screens untouched when one screen receives a frame', () => {
    const twoScreens = apply(INITIAL_SCREENS_STATE, {
      t: 'hello',
      protocolVersion: PROTOCOL_VERSION,
      screens: [
        { screenId: SCREEN_ID, title: 'main' },
        { screenId: 'research', title: 'research' }
      ]
    })
    const after = apply(twoScreens, snapshot(1, []))
    expect(after.screens.research).toBe(twoScreens.screens.research)
    expect(after.screens[SCREEN_ID]).not.toBe(twoScreens.screens[SCREEN_ID])
  })
})

describe('reduceScreens — seq gap detection', () => {
  it('accepts a contiguous seq without asking for a resync', () => {
    const screen = screenOf(attached(event(2, { kind: 'turn_start' })))
    expect(screen.needsResync).toBe(false)
    expect(screen.resyncCount).toBe(0)
    expect(screen.lastSeq).toBe(2)
  })

  it('flags a gap and bumps the monotonic resync counter', () => {
    const screen = screenOf(attached(event(7, { kind: 'turn_start' })))
    expect(screen.needsResync).toBe(true)
    expect(screen.resyncCount).toBe(1)
    expect(screen.lastSeq).toBe(7)
  })

  it('flags a repeated seq too — a duplicate is as corrupting as a hole', () => {
    const state = attached(event(2, { kind: 'turn_start' }), event(2, { kind: 'turn_end' }))
    expect(screenOf(state).needsResync).toBe(true)
  })

  it('gap-checks screen.state frames on the same clock', () => {
    const state = attached({ t: 'screen.state', screenId: SCREEN_ID, seq: 9, state: IDLE_STATE })
    expect(screenOf(state).needsResync).toBe(true)
    expect(screenOf(state).state.status).toBe('idle')
  })

  it('never gap-checks a snapshot — a restarted gateway restarts seq', () => {
    const state = apply(attached(event(2, { kind: 'turn_start' })), snapshot(1, []))
    const screen = screenOf(state)
    expect(screen.needsResync).toBe(false)
    expect(screen.lastSeq).toBe(1)
  })

  it('repairs on the next snapshot: blocks replaced, cursors and maps reset', () => {
    const gapped = attached(
      event(2, { kind: 'turn_start' }),
      event(9, { kind: 'text_delta', messageId: 'msg-1', text: 'x' })
    )
    expect(screenOf(gapped).needsResync).toBe(true)

    const repaired = apply(
      gapped,
      snapshot(3, [{ type: 'user', id: 'entry-1', text: 'do the thing' }])
    )
    const screen = screenOf(repaired)
    expect(screen.needsResync).toBe(false)
    expect(screen.blocks).toEqual([{ type: 'user', id: 'entry-1', text: 'do the thing' }])
    expect(screen.pendingBlockId).toBeNull()
    expect(screen.assistantBlockIdByMessageId).toEqual({})
    // Monotonic: the provider's re-attach effect must not re-fire after the repair.
    expect(screen.resyncCount).toBe(1)
  })

  it('continues the streaming assistant block a snapshot restored, instead of forking it', () => {
    // Attaching mid-stream is the ordinary case, not an edge one: the gateway
    // folds the in-flight assistant message into the snapshot, and that same
    // snapshot resets the id map. The delta that follows therefore carries a
    // messageId the map has never seen but which IS already on screen. Pushing a
    // second block here puts two blocks under one id — React keys them as one,
    // and the text interleaves ("Hello ld" beside "world").
    const state = apply(
      INITIAL_SCREENS_STATE,
      hello(),
      snapshot(1, [{ type: 'assistant', id: 'asst-1700', text: 'Hello ', status: 'streaming' }]),
      event(2, { kind: 'text_delta', messageId: 'asst-1700', text: 'wor' }),
      event(3, { kind: 'text_delta', messageId: 'asst-1700', text: 'ld' })
    )

    expect(screenOf(state).blocks).toEqual([
      { type: 'assistant', id: 'asst-1700', text: 'Hello world', status: 'streaming' }
    ])
    expect(screenOf(state).needsResync).toBe(false)
  })

  it('settles that restored block on text_end rather than leaving it spinning', () => {
    const state = apply(
      INITIAL_SCREENS_STATE,
      hello(),
      snapshot(1, [{ type: 'assistant', id: 'asst-1700', text: 'Hello ', status: 'streaming' }]),
      event(2, { kind: 'text_delta', messageId: 'asst-1700', text: 'world' }),
      event(3, { kind: 'text_end', messageId: 'asst-1700' })
    )

    expect(screenOf(state).blocks).toEqual([
      { type: 'assistant', id: 'asst-1700', text: 'Hello world', status: 'done' }
    ])
  })

  it('promotes a snapshot-restored tool block to streaming as soon as output arrives', () => {
    // The gateway restores every tool block as 'pending'. Attaching during a long
    // bash would otherwise render "queued" beside output visibly streaming in.
    const state = apply(
      INITIAL_SCREENS_STATE,
      hello(),
      snapshot(1, [
        { type: 'tool', id: 'call-1', invocation: INVOCATION, output: '', status: 'pending' }
      ]),
      event(2, { kind: 'tool_output', toolCallId: 'call-1', text: 'tick', replace: true })
    )

    expect(screenOf(state).blocks).toEqual([
      { type: 'tool', id: 'call-1', invocation: INVOCATION, output: 'tick', status: 'streaming' }
    ])
  })

  it('leaves an already-settled tool block settled when late output lands', () => {
    const state = apply(
      INITIAL_SCREENS_STATE,
      hello(),
      snapshot(1, [
        { type: 'tool', id: 'call-1', invocation: INVOCATION, output: 'done', status: 'error' }
      ]),
      event(2, { kind: 'tool_output', toolCallId: 'call-1', text: 'trailing', replace: true })
    )

    expect(screenOf(state).blocks).toEqual([
      { type: 'tool', id: 'call-1', invocation: INVOCATION, output: 'trailing', status: 'error' }
    ])
  })
})

describe('reduceScreens — notices, queue and local prompts', () => {
  it('renders retries, compaction and errors as notice blocks with stable ids', () => {
    const state = attached(
      event(2, { kind: 'compaction_start' }),
      event(3, { kind: 'retry', attempt: 2, maxAttempts: 5, delayMs: 1000, message: '429' }),
      event(4, { kind: 'error', message: 'tool crashed' })
    )
    expect(screenOf(state).blocks.map((block) => block.id)).toEqual([
      'notice-0',
      'notice-1',
      'notice-2'
    ])
    expect(screenOf(state).blocks[1]).toMatchObject({ level: 'warning' })
    expect(screenOf(state).blocks[2]).toMatchObject({ level: 'error', text: 'tool crashed' })
  })

  it('surfaces a screen.error frame as an error notice', () => {
    const state = attached({ t: 'screen.error', screenId: SCREEN_ID, message: 'gateway said no' })
    expect(screenOf(state).blocks[0]).toMatchObject({
      type: 'notice',
      level: 'error',
      text: 'gateway said no'
    })
  })

  it('tracks queue depth from the queue event', () => {
    const state = attached(
      event(2, { kind: 'queue', steering: ['now'], followUp: ['later', 'after'] })
    )
    expect(screenOf(state).state.queue).toEqual({
      steering: ['now'],
      followUp: ['later', 'after']
    })
  })

  it('mirrors the sender own prompt so the chat is not blank until the next snapshot', () => {
    const state = reduceScreens(attached(), {
      type: 'prompt',
      screenId: SCREEN_ID,
      text: 'buy the dip'
    })
    expect(screenOf(state).blocks).toEqual([{ type: 'user', id: 'local-0', text: 'buy the dip' }])
  })

  it('ignores frames and prompts aimed at a screen the gateway never announced', () => {
    const state = attached()
    expect(reduceScreens(state, { type: 'prompt', screenId: 'ghost', text: 'hi' })).toBe(state)
    expect(apply(state, { t: 'screen.error', screenId: 'ghost', message: 'x' })).toBe(state)
  })
})
