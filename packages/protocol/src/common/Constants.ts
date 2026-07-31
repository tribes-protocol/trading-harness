/**
 * Wire constants shared by the gateway and the web client.
 *
 * Both sides must agree on these: the gateway enforces them when it normalizes
 * Pi's event stream, and the client assumes the resulting frames are already
 * bounded (it never re-truncates).
 */

/**
 * Bumped whenever a frame shape changes incompatibly. The client refuses to attach
 * when the server's `hello` reports a different version, so a stale tab fails
 * loudly instead of silently mis-rendering.
 *
 * 2 — added the `bash` client frame, the `screen.commands` server frame, and
 *     `ToolInvocation.origin`. The two server-side additions are backward
 *     compatible on their own (an old client drops an unknown frame), but the
 *     CLIENT-side one is not: a new tab sending `bash` to an old gateway has its
 *     frame rejected by that gateway's parser while the composer, seeing a
 *     successful send, clears the operator's text. Silent loss across a deploy skew
 *     is exactly what this gate is for, so it is a bump rather than an additive
 *     no-op.
 * 1 — initial contract.
 */
export const PROTOCOL_VERSION = 2

/**
 * Delta coalescing window. Pi emits a `message_update` per token and a
 * `tool_execution_update` per chunk of tool output; forwarding each one verbatim
 * is a frame storm. Consecutive deltas aimed at the same target are merged and
 * flushed on this interval, when the buffer crosses the size cap, when the
 * target changes, or when a non-mergeable event passes through — so wire order
 * always matches Pi's order.
 */
export const COALESCE_INTERVAL_MS = 100

/** Flush a merged delta buffer once it crosses this many characters. */
export const COALESCE_MAX_BUFFER_CHARS = 2048

/**
 * Hard cap on a single tool's forwarded output. Pi's bash tool streams a
 * CUMULATIVE tail-truncated snapshot, so the client replaces rather than appends
 * (see `replace` on `tool_output`); this bounds the frame it replaces with.
 */
export const MAX_TOOL_OUTPUT_CHARS = 20_000

/** Hard cap on the pretty-printed tool arguments shown above a tool block. */
export const MAX_ARGS_PREVIEW_CHARS = 400

/** Hard cap on a single forwarded text or thinking block. */
export const MAX_TEXT_BLOCK_CHARS = 200_000

/** Screen id used when the gateway hosts a single default Pi screen. */
export const DEFAULT_SCREEN_ID = 'main'

/**
 * The route the multiplexed screen socket lives on.
 *
 * It belongs in the CONTRACT rather than in either app because it is the one
 * value both sides must agree on to reach each other at all — and disagreeing is
 * invisible to both test suites. The client simply reports "reconnecting"
 * forever while the server logs nothing, because no request ever arrives on a
 * path it serves. Anything either side can get wrong alone belongs in that app;
 * this is not one of those.
 */
export const SCREEN_SOCKET_PATH = '/ws'
