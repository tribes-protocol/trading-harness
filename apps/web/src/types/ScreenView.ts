import type { ScreenBlock } from '@tribes-harness/protocol/types/ScreenBlock'
import type { ScreenState, ServerFrame } from '@tribes-harness/protocol/types/ScreenProtocol'

/**
 * The browser's view model. The wire types describe what the gateway SENDS; these
 * describe what a tab has to remember between frames — the resume cursor, the gap
 * detector's bookkeeping, and the ids that let a delta replace exactly one block.
 */

/** Transport state of the single gateway socket. */
export type GatewayStatus = 'connecting' | 'open' | 'reconnecting'

/**
 * Three-state load phase for a screen. `connecting` means NO snapshot has ever
 * landed, so the UI shows a skeleton — never an empty state, which would claim the
 * agent has done nothing when the truth is that we have not asked yet.
 */
export type ScreenLoadPhase = 'connecting' | 'loaded' | 'error'

export interface ScreenViewState {
  screenId: string
  title: string
  blocks: ScreenBlock[]
  state: ScreenState
  /** Last `seq` seen on this screen; null before the first frame. */
  lastSeq: number | null
  /** The DURABLE resume cursor, replayed on every re-attach. */
  leafEntryId: string | null
  /** A `seq` gap was seen and no fresh snapshot has landed yet. Drives the UI badge. */
  needsResync: boolean
  /**
   * Monotonic count of `seq` gaps. The provider's re-attach effect keys on this
   * rather than on `needsResync`, so it fires exactly once per gap instead of
   * twice per gap (once on the flag going up, once on the snapshot clearing it).
   */
  resyncCount: number
  /** True once a snapshot has landed. Gates the skeleton. */
  hydrated: boolean
  /** The pending assistant placeholder awaiting adoption, or null. */
  pendingBlockId: string | null
  /**
   * Wire `messageId` -> the id of the block carrying that message's text. Needed
   * because an adopted placeholder keeps the placeholder's id, so the block id and
   * the message id diverge for exactly the blocks that started as a spinner.
   */
  assistantBlockIdByMessageId: Record<string, string>
  turnCount: number
  noticeCount: number
  promptCount: number
}

export interface PiScreensState {
  /** The gateway's `hello` reported a protocol version this build cannot render. */
  protocolMismatch: boolean
  /** Screen ids in the order the gateway listed them. */
  screenOrder: string[]
  screens: Record<string, ScreenViewState>
}

export type ScreensAction =
  | { type: 'frame'; frame: ServerFrame }
  | { type: 'prompt'; screenId: string; text: string }

export interface PiScreensContextValue {
  status: GatewayStatus
  loadPhase: ScreenLoadPhase
  protocolMismatch: boolean
  screens: ScreenViewState[]
  activeScreen: ScreenViewState | null
  selectScreen: (screenId: string) => void
  sendPrompt: (text: string) => void
  abort: () => void
}

export interface CollapsedToolOutput {
  visible: string
  hiddenLines: number
}

/**
 * The wire union's members, named. `ScreenBlockSchema` is a single discriminated
 * union, so the individual variants have no exported names of their own — and a
 * renderer that switches on `type` needs one per branch.
 */
export type UserScreenBlock = Extract<ScreenBlock, { type: 'user' }>
export type AssistantScreenBlock = Extract<ScreenBlock, { type: 'assistant' }>
export type ThinkingScreenBlock = Extract<ScreenBlock, { type: 'thinking' }>
export type ToolScreenBlock = Extract<ScreenBlock, { type: 'tool' }>
export type NoticeScreenBlock = Extract<ScreenBlock, { type: 'notice' }>
