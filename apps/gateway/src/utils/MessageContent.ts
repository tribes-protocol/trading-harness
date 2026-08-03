import { z } from 'zod'

/**
 * Render Pi message content into plain text.
 *
 * Content is either a bare string (user messages may be) or an array of blocks.
 * Image blocks arrive with their bytes inlined as base64 in `data`; the schema
 * below never reads that field, so the bytes cannot reach the browser — an image
 * becomes a one-line placeholder instead.
 */

const ContentBlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({ type: z.literal('image'), mimeType: z.string() })
])

const MessageContentSchema = z.union([z.string(), z.array(ContentBlockSchema)])

export function renderMessageContentText(content: unknown): string {
  const parsed = MessageContentSchema.safeParse(content)
  if (!parsed.success) {
    return ''
  }
  if (typeof parsed.data === 'string') {
    return parsed.data
  }
  return parsed.data
    .map((block) => (block.type === 'text' ? block.text : `[image ${block.mimeType}]`))
    .join('\n')
}
