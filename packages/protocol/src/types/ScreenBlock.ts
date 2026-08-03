import { z } from 'zod'

import { ScreenNoticeLevelSchema, ToolInvocationSchema } from '@/types/ScreenEvent'

/**
 * The renderable transcript model for one Pi screen.
 *
 * Both sides build the same blocks: the gateway when it replays a resumed
 * session's history, the client when it folds live events. That symmetry is what
 * makes a reattach render identically to the live stream.
 *
 * Block ids are STABLE and derived, never generated per render:
 *   - assistant text : the Pi message id
 *   - thinking       : the Pi message id + '-thinking'
 *   - tool           : the Pi tool call id
 * A delta therefore replaces exactly one block object and leaves every other
 * block referentially identical, so one token re-renders one node.
 */

export const ScreenBlockStatusSchema = z.enum(['pending', 'streaming', 'done', 'error'])
export type ScreenBlockStatus = z.infer<typeof ScreenBlockStatusSchema>

export const ScreenBlockSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('user'),
    id: z.string(),
    text: z.string()
  }),
  z.object({
    type: z.literal('assistant'),
    id: z.string(),
    text: z.string(),
    status: ScreenBlockStatusSchema
  }),
  z.object({
    type: z.literal('thinking'),
    id: z.string(),
    text: z.string(),
    status: ScreenBlockStatusSchema
  }),
  z.object({
    type: z.literal('tool'),
    id: z.string(),
    invocation: ToolInvocationSchema,
    output: z.string(),
    status: ScreenBlockStatusSchema
  }),
  z.object({
    type: z.literal('notice'),
    id: z.string(),
    level: ScreenNoticeLevelSchema,
    text: z.string()
  })
])
export type ScreenBlock = z.infer<typeof ScreenBlockSchema>
