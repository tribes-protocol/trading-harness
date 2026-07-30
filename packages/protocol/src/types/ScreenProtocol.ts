import { z } from 'zod'

import { ScreenBlockSchema } from '@/types/ScreenBlock'
import { ScreenEventSchema } from '@/types/ScreenEvent'

/**
 * The gateway <-> browser wire protocol.
 *
 * ONE WebSocket per browser, multiplexed by `screenId`, so N Pi screens share a
 * connection instead of opening N sockets. Chosen over SSE deliberately:
 *
 *  - SSE is one-directional. Every client action here (prompt, steer, abort,
 *    attach) needs a second channel, and EventSource cannot set headers or
 *    subprotocols, which would push the auth token back into the URL.
 *  - "SSE semantics over a WebSocket" is worth exactly one half of SSE: the
 *    resume CONTRACT, not the `id:`/`event:`/`data:` framing. We keep the
 *    contract and drop the framing.
 *
 * Resume works on TWO different clocks, and conflating them is the mistake this
 * comment exists to prevent:
 *
 *  - `leafEntryId` is the DURABLE cursor. Pi sessions are an append-only tree of
 *    entries with stable ids, so an entry id survives a client restart and is the
 *    only thing worth persisting.
 *  - `seq` is an EPHEMERAL per-screen gap detector, never a replay log. Deltas
 *    are coalesced and `tool_output` frames are cumulative snapshots, so there is
 *    nothing coherent to replay from a delta buffer. A client that sees a gap in
 *    `seq` re-attaches and takes a fresh snapshot; it never asks for delta N+1.
 */

export const ScreenStatusSchema = z.enum(['idle', 'streaming', 'compacting', 'retrying'])
export type ScreenStatus = z.infer<typeof ScreenStatusSchema>

export const ScreenQueueSchema = z.object({
  steering: z.array(z.string()),
  followUp: z.array(z.string())
})
export type ScreenQueue = z.infer<typeof ScreenQueueSchema>

export const ScreenStateSchema = z.object({
  status: ScreenStatusSchema,
  /** `provider/model-id`, or null before a model is resolved. */
  model: z.string().nullish(),
  thinkingLevel: z.string(),
  /** Percentage of the context window in use, null until the first response. */
  contextPercent: z.number().nullish(),
  costUsd: z.number(),
  queue: ScreenQueueSchema
})
export type ScreenState = z.infer<typeof ScreenStateSchema>

export const ScreenSummarySchema = z.object({
  screenId: z.string(),
  /** Display name only. Never the session file path — that leaks host layout. */
  title: z.string()
})
export type ScreenSummary = z.infer<typeof ScreenSummarySchema>

export const StreamingBehaviorSchema = z.enum(['steer', 'followUp'])
export type StreamingBehavior = z.infer<typeof StreamingBehaviorSchema>

export const ClientFrameSchema = z.discriminatedUnion('t', [
  /**
   * Subscribe to a screen. `sinceEntryId` is the last durable entry the client
   * rendered; the gateway answers with a snapshot either way, and uses the cursor
   * only to decide whether it can send an incremental one.
   */
  z.object({
    t: z.literal('attach'),
    screenId: z.string(),
    sinceEntryId: z.string().nullish()
  }),
  z.object({
    t: z.literal('prompt'),
    screenId: z.string(),
    text: z.string(),
    /**
     * Required by Pi when the agent is already streaming: `steer` lands after the
     * current turn's tool calls, `followUp` waits for the agent to stop. Null
     * means "only send if idle".
     */
    streamingBehavior: StreamingBehaviorSchema.nullish()
  }),
  z.object({ t: z.literal('abort'), screenId: z.string() }),
  z.object({ t: z.literal('detach'), screenId: z.string() })
])
export type ClientFrame = z.infer<typeof ClientFrameSchema>

export const ServerFrameSchema = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('hello'),
    protocolVersion: z.number(),
    screens: z.array(ScreenSummarySchema)
  }),
  /** Full renderable state for a screen. Always the answer to `attach`. */
  z.object({
    t: z.literal('screen.snapshot'),
    screenId: z.string(),
    seq: z.number(),
    leafEntryId: z.string().nullish(),
    blocks: z.array(ScreenBlockSchema),
    state: ScreenStateSchema
  }),
  z.object({
    t: z.literal('screen.event'),
    screenId: z.string(),
    seq: z.number(),
    event: ScreenEventSchema
  }),
  z.object({
    t: z.literal('screen.state'),
    screenId: z.string(),
    seq: z.number(),
    state: ScreenStateSchema
  }),
  z.object({
    t: z.literal('screen.error'),
    screenId: z.string(),
    message: z.string()
  })
])
export type ServerFrame = z.infer<typeof ServerFrameSchema>
