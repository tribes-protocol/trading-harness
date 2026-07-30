import { PROTOCOL_VERSION } from '@tribes-harness/protocol/common/Constants'
import type { ScreenBlock, ScreenNoticeLevel } from '@tribes-harness/protocol/types/ScreenBlock'
import type { ScreenEvent } from '@tribes-harness/protocol/types/ScreenEvent'
import type {
  ScreenState,
  ScreenSummary,
  ServerFrame
} from '@tribes-harness/protocol/types/ScreenProtocol'

import type { PiScreensState, ScreensAction, ScreenViewState } from '@/types/ScreenView'

/**
 * The pure fold from `ServerFrame`s to renderable state. No I/O, no clocks, no
 * randomness — the provider owns the socket, this owns the truth.
 *
 * Two invariants everything else depends on:
 *
 *  1. **Referential stability.** Block ids are derived, never generated per frame
 *     (assistant = the Pi message id, thinking = message id + '-thinking', tool =
 *     the tool call id), and every update replaces exactly the one block object it
 *     touches. Untouched blocks keep their identity, so a memoized renderer turns
 *     one token into one re-rendered node.
 *  2. **`seq` is a gap DETECTOR, not a replay log.** Deltas are coalesced upstream
 *     and `tool_output` frames are cumulative snapshots, so there is nothing
 *     coherent to replay from delta N+1. A gap raises `needsResync`, the provider
 *     re-attaches, and the resulting snapshot is the repair.
 */

const THINKING_ID_SUFFIX = '-thinking'
const PENDING_ID_PREFIX = 'pending-'
const NOTICE_ID_PREFIX = 'notice-'
const LOCAL_PROMPT_ID_PREFIX = 'local-'

/**
 * What a screen looks like before its first snapshot. Never rendered as content —
 * `hydrated: false` puts the UI in its skeleton state — but it keeps every consumer
 * free of null checks on `state`.
 */
const UNHYDRATED_SCREEN_STATE: ScreenState = {
  status: 'idle',
  model: null,
  thinkingLevel: 'off',
  contextPercent: null,
  costUsd: 0,
  queue: { steering: [], followUp: [] }
}

export const INITIAL_SCREENS_STATE: PiScreensState = {
  protocolMismatch: false,
  screenOrder: [],
  screens: {}
}

export function createScreenViewState(summary: ScreenSummary): ScreenViewState {
  return {
    screenId: summary.screenId,
    title: summary.title,
    blocks: [],
    state: UNHYDRATED_SCREEN_STATE,
    lastSeq: null,
    leafEntryId: null,
    needsResync: false,
    resyncCount: 0,
    hydrated: false,
    pendingBlockId: null,
    assistantBlockIdByMessageId: {},
    turnCount: 0,
    noticeCount: 0,
    promptCount: 0
  }
}

/**
 * Replace exactly the block with `id`, leaving every other block object
 * referentially identical.
 */
function replaceBlock(
  blocks: ScreenBlock[],
  id: string,
  update: (block: ScreenBlock) => ScreenBlock
): ScreenBlock[] {
  return blocks.map((block) => (block.id === id ? update(block) : block))
}

function dropPendingBlock(screen: ScreenViewState): ScreenBlock[] {
  const pendingId = screen.pendingBlockId
  return pendingId === null
    ? screen.blocks
    : screen.blocks.filter((block) => block.id !== pendingId)
}

function appendNotice(
  screen: ScreenViewState,
  level: ScreenNoticeLevel,
  text: string
): ScreenViewState {
  return {
    ...screen,
    noticeCount: screen.noticeCount + 1,
    blocks: [
      ...screen.blocks,
      { type: 'notice', id: `${NOTICE_ID_PREFIX}${screen.noticeCount}`, level, text }
    ]
  }
}

/**
 * An assistant text delta.
 *
 * The first delta of a turn ADOPTS the pending placeholder in place — same id, same
 * position, same DOM node — so the spinner becomes the reply without a remount. That
 * makes the block id diverge from the message id for adopted blocks, which is what
 * `assistantBlockIdByMessageId` exists to bridge.
 */
function foldTextDelta(screen: ScreenViewState, messageId: string, text: string): ScreenViewState {
  const knownId = screen.assistantBlockIdByMessageId[messageId]
  if (knownId !== undefined) {
    return {
      ...screen,
      blocks: replaceBlock(screen.blocks, knownId, (block) =>
        block.type === 'assistant'
          ? { ...block, text: block.text + text, status: 'streaming' }
          : block
      )
    }
  }

  const pendingId = screen.pendingBlockId
  if (pendingId !== null) {
    return {
      ...screen,
      pendingBlockId: null,
      assistantBlockIdByMessageId: {
        ...screen.assistantBlockIdByMessageId,
        [messageId]: pendingId
      },
      blocks: replaceBlock(screen.blocks, pendingId, (block) =>
        block.type === 'assistant' ? { ...block, text, status: 'streaming' } : block
      )
    }
  }

  // A snapshot rebuilds `blocks` from the gateway's fold and resets the id map,
  // so after attaching mid-stream the in-flight assistant block is ALREADY in
  // `blocks` under its message id while the map knows nothing about it. Adopting
  // it here is what keeps a mid-stream re-attach from growing a second block
  // with the same id (which React keys as one, and the next delta then appends
  // to the wrong one).
  if (screen.blocks.some((block) => block.id === messageId)) {
    return {
      ...screen,
      assistantBlockIdByMessageId: {
        ...screen.assistantBlockIdByMessageId,
        [messageId]: messageId
      },
      blocks: replaceBlock(screen.blocks, messageId, (block) =>
        block.type === 'assistant'
          ? { ...block, text: block.text + text, status: 'streaming' }
          : block
      )
    }
  }

  return {
    ...screen,
    assistantBlockIdByMessageId: {
      ...screen.assistantBlockIdByMessageId,
      [messageId]: messageId
    },
    blocks: [...screen.blocks, { type: 'assistant', id: messageId, text, status: 'streaming' }]
  }
}

function foldThinkingDelta(
  screen: ScreenViewState,
  messageId: string,
  text: string
): ScreenViewState {
  const id = `${messageId}${THINKING_ID_SUFFIX}`
  if (screen.blocks.some((block) => block.id === id)) {
    return {
      ...screen,
      blocks: replaceBlock(screen.blocks, id, (block) =>
        block.type === 'thinking'
          ? { ...block, text: block.text + text, status: 'streaming' }
          : block
      )
    }
  }
  return {
    ...screen,
    blocks: [...screen.blocks, { type: 'thinking', id, text, status: 'streaming' }]
  }
}

function settleBlock(screen: ScreenViewState, id: string): ScreenViewState {
  return {
    ...screen,
    blocks: replaceBlock(screen.blocks, id, (block) =>
      block.type === 'assistant' || block.type === 'thinking' ? { ...block, status: 'done' } : block
    )
  }
}

/**
 * Close out a turn: the placeholder never adopted by a delta is dropped, and every
 * still-streaming text or thinking block settles. Blocks already settled keep their
 * identity.
 */
function settleTurn(screen: ScreenViewState): ScreenViewState {
  const blocks = dropPendingBlock(screen).map(
    (block): ScreenBlock =>
      (block.type === 'assistant' || block.type === 'thinking') && block.status === 'streaming'
        ? { ...block, status: 'done' }
        : block
  )
  return { ...screen, pendingBlockId: null, blocks }
}

function foldEvent(screen: ScreenViewState, event: ScreenEvent): ScreenViewState {
  switch (event.kind) {
    case 'turn_start': {
      const pendingId = `${PENDING_ID_PREFIX}${screen.turnCount}`
      return {
        ...screen,
        turnCount: screen.turnCount + 1,
        pendingBlockId: pendingId,
        blocks: [
          ...dropPendingBlock(screen),
          { type: 'assistant', id: pendingId, text: '', status: 'pending' }
        ]
      }
    }
    case 'text_delta':
      return foldTextDelta(screen, event.messageId, event.text)
    case 'text_end': {
      const blockId = screen.assistantBlockIdByMessageId[event.messageId]
      return blockId === undefined ? screen : settleBlock(screen, blockId)
    }
    case 'thinking_delta':
      return foldThinkingDelta(screen, event.messageId, event.text)
    case 'thinking_end':
      return settleBlock(screen, `${event.messageId}${THINKING_ID_SUFFIX}`)
    case 'tool_start':
      return {
        ...screen,
        blocks: [
          ...screen.blocks,
          {
            type: 'tool',
            id: event.invocation.toolCallId,
            invocation: event.invocation,
            output: '',
            status: 'streaming'
          }
        ]
      }
    case 'tool_output':
      // `replace: true` carries the whole output so far. Pi's bash snapshot stops
      // prefix-extending once tail truncation kicks in, so appending corrupts it.
      return {
        ...screen,
        blocks: replaceBlock(screen.blocks, event.toolCallId, (block) =>
          block.type === 'tool'
            ? {
                ...block,
                output: event.replace ? event.text : block.output + event.text,
                // Output arriving IS the proof it is running. A snapshot restores
                // every tool block as 'pending', so a client that attaches during
                // a long bash would otherwise render "queued" next to output
                // visibly streaming in — the app's headline case.
                status: block.status === 'pending' ? 'streaming' : block.status
              }
            : block
        )
      }
    case 'tool_end':
      // `text` is the finalized result (or the error). An empty one means the tool
      // produced nothing beyond what already streamed, so the buffer stands.
      return {
        ...screen,
        blocks: replaceBlock(screen.blocks, event.toolCallId, (block) =>
          block.type === 'tool'
            ? {
                ...block,
                output: event.text.length > 0 ? event.text : block.output,
                status: event.isError ? 'error' : 'done'
              }
            : block
        )
      }
    case 'queue':
      return {
        ...screen,
        state: {
          ...screen.state,
          queue: { steering: event.steering, followUp: event.followUp }
        }
      }
    case 'turn_end':
    case 'agent_end':
      return settleTurn(screen)
    case 'compaction_start':
      return appendNotice(screen, 'info', 'Compacting context…')
    case 'compaction_end':
      return appendNotice(screen, 'info', event.summary ?? 'Context compacted.')
    case 'retry':
      return appendNotice(
        screen,
        'warning',
        `Retry ${event.attempt}/${event.maxAttempts} in ${event.delayMs}ms — ${event.message}`
      )
    case 'error':
      return appendNotice(screen, 'error', event.message)
    case 'agent_start':
      return screen
  }
}

/**
 * Advance the gap detector. A `seq` that is not exactly the successor of the last
 * one means frames were lost or duplicated; the buffer is now untrustworthy, so the
 * screen asks for a fresh snapshot rather than pretending the stream is intact.
 */
function advanceSeq(screen: ScreenViewState, seq: number): ScreenViewState {
  if (screen.lastSeq !== null && seq !== screen.lastSeq + 1) {
    return {
      ...screen,
      lastSeq: seq,
      needsResync: true,
      resyncCount: screen.resyncCount + 1
    }
  }
  return { ...screen, lastSeq: seq }
}

function withScreen(
  state: PiScreensState,
  screenId: string,
  update: (screen: ScreenViewState) => ScreenViewState
): PiScreensState {
  const screen = state.screens[screenId]
  if (screen === undefined) {
    return state
  }
  return { ...state, screens: { ...state.screens, [screenId]: update(screen) } }
}

function foldHello(
  state: PiScreensState,
  protocolVersion: number,
  summaries: ScreenSummary[]
): PiScreensState {
  if (protocolVersion !== PROTOCOL_VERSION) {
    return { ...state, protocolMismatch: true }
  }
  const screens: Record<string, ScreenViewState> = {}
  for (const summary of summaries) {
    const existing = state.screens[summary.screenId]
    // A reconnect re-announces screens we already render. Keeping the existing
    // blocks means the tab does not flash empty between `hello` and the snapshot.
    screens[summary.screenId] =
      existing === undefined
        ? createScreenViewState(summary)
        : { ...existing, title: summary.title }
  }
  return {
    protocolMismatch: false,
    screenOrder: summaries.map((summary) => summary.screenId),
    screens
  }
}

function foldFrame(state: PiScreensState, frame: ServerFrame): PiScreensState {
  switch (frame.t) {
    case 'hello':
      return foldHello(state, frame.protocolVersion, frame.screens)
    case 'screen.snapshot':
      // The snapshot is authoritative and self-contained: it resets the gap
      // detector (a restarted gateway restarts `seq`) and every id-tracking map.
      return withScreen(state, frame.screenId, (screen) => ({
        ...screen,
        blocks: frame.blocks,
        state: frame.state,
        lastSeq: frame.seq,
        leafEntryId: frame.leafEntryId ?? null,
        needsResync: false,
        hydrated: true,
        pendingBlockId: null,
        assistantBlockIdByMessageId: {}
      }))
    case 'screen.event':
      return withScreen(state, frame.screenId, (screen) =>
        foldEvent(advanceSeq(screen, frame.seq), frame.event)
      )
    case 'screen.state':
      return withScreen(state, frame.screenId, (screen) => ({
        ...advanceSeq(screen, frame.seq),
        state: frame.state
      }))
    case 'screen.error':
      return withScreen(state, frame.screenId, (screen) =>
        appendNotice(screen, 'error', frame.message)
      )
  }
}

export function reduceScreens(state: PiScreensState, action: ScreensAction): PiScreensState {
  switch (action.type) {
    case 'frame':
      return foldFrame(state, action.frame)
    case 'prompt':
      // The wire has no event that echoes a prompt back, so the sender's own message
      // is mirrored optimistically. A later snapshot replaces it with the gateway's
      // authoritative `user` block.
      return withScreen(state, action.screenId, (screen) => ({
        ...screen,
        promptCount: screen.promptCount + 1,
        blocks: [
          ...screen.blocks,
          {
            type: 'user',
            id: `${LOCAL_PROMPT_ID_PREFIX}${screen.promptCount}`,
            text: action.text
          }
        ]
      }))
  }
}
