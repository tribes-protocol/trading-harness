import { z } from 'zod'

/**
 * The normalized event stream for one Pi screen.
 *
 * This is deliberately NOT `AgentSessionEvent` forwarded verbatim. Pi's own union
 * is unsuitable as a wire format for three concrete reasons:
 *
 *  1. Every `message_update` re-sends the ENTIRE partial assistant message
 *     alongside the delta, so verbatim forwarding costs O(n²) bytes per turn.
 *  2. `tool_execution_start.args`, `tool_execution_update.partialResult` and
 *     `tool_execution_end.result` are typed `any` — they come straight out of
 *     tool code and change shape whenever a tool does.
 *  3. Assistant diagnostics carry `error.stack`, and session metadata carries
 *     absolute paths. Both would leak the host filesystem layout to the browser.
 *
 * The gateway maps Pi's events onto this union: deltas only, tool payloads
 * rendered to display-ready strings, everything bounded by the caps in
 * `common/Constants.ts`.
 */

export const ScreenNoticeLevelSchema = z.enum(['info', 'warning', 'error'])
export type ScreenNoticeLevel = z.infer<typeof ScreenNoticeLevelSchema>

export const ToolInvocationSchema = z.object({
  toolCallId: z.string(),
  toolName: z.string(),
  /** Human label for the tool, e.g. `bash`, `read`, `edit`. */
  title: z.string(),
  /** The one detail worth showing inline: the command, the path, the pattern. */
  subtitle: z.string().nullish(),
  /** Pretty-printed, truncated arguments for the expanded view. */
  argsPreview: z.string(),
  /**
   * Who started this. `user` is a `!command` the operator ran themselves, which the
   * gateway renders through the same tool-block path so it lands in the screen
   * alongside the agent's own work — but the UI marks it, because "the agent ran
   * this" and "I ran this" are different facts about a trading session.
   *
   * Nullish for wire compatibility: frames minted before this field existed parse
   * unchanged and are treated as `agent`.
   */
  origin: z.enum(['agent', 'user']).nullish()
})
export type ToolInvocation = z.infer<typeof ToolInvocationSchema>

export const ScreenEventSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('agent_start') }),
  z.object({ kind: z.literal('agent_end'), willRetry: z.boolean() }),
  z.object({ kind: z.literal('turn_start') }),
  z.object({ kind: z.literal('turn_end') }),

  /** Assistant prose. `messageId` is stable for the whole message. */
  z.object({ kind: z.literal('text_delta'), messageId: z.string(), text: z.string() }),
  z.object({ kind: z.literal('text_end'), messageId: z.string() }),

  /** Reasoning output, when the model exposes it. */
  z.object({ kind: z.literal('thinking_delta'), messageId: z.string(), text: z.string() }),
  z.object({ kind: z.literal('thinking_end'), messageId: z.string() }),

  z.object({ kind: z.literal('tool_start'), invocation: ToolInvocationSchema }),
  /**
   * `replace: true` means "this is the whole output so far, swap it in" — Pi's
   * bash streams a cumulative snapshot that stops prefix-extending once tail
   * truncation kicks in, so appending would corrupt it.
   */
  z.object({
    kind: z.literal('tool_output'),
    toolCallId: z.string(),
    text: z.string(),
    replace: z.boolean()
  }),
  z.object({
    kind: z.literal('tool_end'),
    toolCallId: z.string(),
    isError: z.boolean(),
    text: z.string()
  }),

  z.object({
    kind: z.literal('queue'),
    steering: z.array(z.string()),
    followUp: z.array(z.string())
  }),

  z.object({ kind: z.literal('compaction_start') }),
  z.object({ kind: z.literal('compaction_end'), summary: z.string().nullish() }),

  z.object({
    kind: z.literal('retry'),
    attempt: z.number(),
    maxAttempts: z.number(),
    delayMs: z.number(),
    message: z.string()
  }),

  z.object({ kind: z.literal('error'), message: z.string() }),

  /**
   * A message an EXTENSION asked the host to show — Pi's `ctx.ui.notify` and
   * `ctx.ui.setWidget`, which in the TUI are a toast and a panel pinned by the
   * editor. Neither has a transcript of its own here, so both land as notices.
   *
   * `id` is what separates the two: `notify` mints a fresh one per call so the
   * messages stack, while a widget reuses the id derived from its key so each
   * update REPLACES the previous text in place. That is what lets a long-running
   * widget (a login URL, a progress readout) update without spamming the stream.
   *
   * A nullish `text` CLEARS the notice, which is how a widget set to `undefined`
   * removes itself.
   */
  z.object({
    kind: z.literal('notice'),
    id: z.string(),
    level: ScreenNoticeLevelSchema,
    text: z.string().nullish()
  })
])
export type ScreenEvent = z.infer<typeof ScreenEventSchema>
