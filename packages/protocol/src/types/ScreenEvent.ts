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

export const ToolInvocationSchema = z.object({
  toolCallId: z.string(),
  toolName: z.string(),
  /** Human label for the tool, e.g. `bash`, `read`, `edit`. */
  title: z.string(),
  /** The one detail worth showing inline: the command, the path, the pattern. */
  subtitle: z.string().nullish(),
  /** Pretty-printed, truncated arguments for the expanded view. */
  argsPreview: z.string()
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

  z.object({ kind: z.literal('error'), message: z.string() })
])
export type ScreenEvent = z.infer<typeof ScreenEventSchema>
