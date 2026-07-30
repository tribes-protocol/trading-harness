import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { ScreenBlock } from '@tribes-harness/protocol/types/ScreenBlock'
import type { ServerFrame } from '@tribes-harness/protocol/types/ScreenProtocol'

/** Static description of one hostable screen. Never sent to the browser as-is: it carries host paths. */
export type ScreenConfig = {
  screenId: string
  /** Display name. This, and only this, reaches the client as `ScreenSummary.title`. */
  title: string
  cwd: string
  sessionDir: string
}

/**
 * One consumer of a screen's frame stream. The screen fans out to N of these and
 * never inspects a socket; the socket controller decides what "delivering" means
 * and reports saturation back so the agent-level hook can slow down.
 */
export type ScreenSubscriber = {
  deliver: (frame: ServerFrame) => void
  isSaturated: () => boolean
}

/** The `tool` variant of `ScreenBlock`, so replay can build one without a type assertion. */
export type ScreenToolBlock = Extract<ScreenBlock, { type: 'tool' }>

/**
 * Input to the replay fold. `streamingMessage` is separate because Pi only
 * pushes a message into `AgentState.messages` at `message_end`; mid-turn it
 * lives in `AgentState.streamingMessage` and would otherwise be missing from a
 * snapshot taken while the agent is talking.
 */
export type ScreenReplayInput = {
  messages: AgentMessage[]
  streamingMessage: AgentMessage | null
}

/** Per-socket data Bun carries on the upgraded connection. */
export type ScreenSocketData = {
  socketId: string
}

export type ScreenSocket = BunServerWebSocket<ScreenSocketData>

/** Gateway-side bookkeeping for one browser connection. */
export type ScreenSocketConnection = {
  socket: ScreenSocket
  /** Set once `close` fires, so an in-flight attach cannot register a subscriber on a dead socket. */
  closed: boolean
  /** True between a `send()` that returned -1 and the next `drain`. */
  saturated: boolean
  /** screenId -> unsubscribe. */
  attachments: Map<string, () => void>
}
