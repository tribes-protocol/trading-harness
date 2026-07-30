/**
 * Transport constants for the single gateway WebSocket.
 *
 * The backoff is exponential with a cap and additive jitter: a gateway restart
 * disconnects every open tab at once, and un-jittered exponential backoff would
 * make all of them retry on the same tick forever.
 */
export const RECONNECT_BASE_DELAY_MS = 500

export const RECONNECT_MAX_DELAY_MS = 30_000

/** Fraction of the computed delay added back as random jitter. */
export const RECONNECT_JITTER_RATIO = 0.3

/** Lines of tool output shown before the block collapses behind an expander. */
export const TOOL_OUTPUT_COLLAPSED_LINES = 12
