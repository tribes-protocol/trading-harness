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
 * 6 — added the `set_thinking` client frame. CLIENT-side again, so the same unsafe
 *     direction as 5: an older gateway rejects the frame outright while the picker,
 *     seeing a successful send, would sit showing a level the screen is not running.
 *     The gate turns that silent mismatch into a refused attach.
 * 5 — added `images` to the `prompt` client frame. A CLIENT-side addition, so it
 *     is the unsafe direction: a new tab that attaches an image and sends it to an
 *     older gateway has the whole frame rejected by that gateway's parser, while
 *     the composer — seeing a successful send — clears the operator's text and
 *     their attachment.
 * 4 — added the `notice` screen event, carrying extension UI output (`ctx.ui.notify`
 *     and `ctx.ui.setWidget`) into the transcript. Additive on the wire — an old
 *     client would simply drop it — but dropping it is exactly the failure this
 *     bump exists to prevent: the notice channel is how an extension asks the
 *     operator for something (a login URL, a refusal), and silently discarding
 *     that looks identical to the extension never running.
 * 3 — added the `set_model` client frame and the `screen.models` server frame.
 *     Bumped for the same reason as 2: a new tab sending `set_model` to an older
 *     gateway has the frame rejected there while the UI shows the switch as taken.
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
export const PROTOCOL_VERSION = 6

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

/**
 * Caps on images pasted into the composer.
 *
 * ~8 MB of base64 is roughly a 6 MB image, which comfortably covers a full-screen
 * retina screenshot — the thing people actually paste — without letting a single
 * frame become unbounded. The count cap matters as much as the size one: the
 * gateway buffers a whole frame before parsing it, so N images multiply the cap.
 */
export const MAX_PROMPT_IMAGE_CHARS = 8_000_000
export const MAX_PROMPT_IMAGES = 4

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
