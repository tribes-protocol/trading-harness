// The screen socket route is deliberately NOT declared here. It is one half of a
// handshake, so it lives in @tribes-harness/protocol and both sides import it —
// see the comment there for why a per-app copy is invisible to both test suites.

/** Liveness route, so a supervisor can probe without speaking the protocol. */
export const HEALTH_PATH = '/healthz'

/** `ServerWebSocket.readyState` value for an open socket. */
export const WEBSOCKET_OPEN = 1

/** `ServerWebSocket.send()` return value meaning "buffered, socket is saturated". */
export const WEBSOCKET_SEND_ENQUEUED = -1

/** `ServerWebSocket.send()` return value meaning "dropped". */
export const WEBSOCKET_SEND_DROPPED = 0

/**
 * How long the agent-level (awaited) event hook will hold the agent while a
 * subscriber's socket is saturated. Delta frames are dropped rather than queued,
 * so this only smooths a burst; it must stay bounded or one wedged browser tab
 * would stall the agent for everyone attached to the screen.
 */
export const MAX_BACKPRESSURE_WAIT_MS = 2_000

/** Poll interval used while waiting for a saturated subscriber to drain. */
export const BACKPRESSURE_POLL_MS = 25

/**
 * Block id suffix for the reasoning half of an assistant message. Mirrors the id
 * scheme documented on `ScreenBlock`: the client derives the same suffix when it
 * folds live `thinking_delta` events, so a replayed session and a live stream
 * produce identical block ids.
 */
export const THINKING_BLOCK_ID_SUFFIX = '-thinking'
