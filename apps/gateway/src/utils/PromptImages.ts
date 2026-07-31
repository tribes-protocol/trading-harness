import type { ImageContent } from '@earendil-works/pi-ai'
import type { PromptImage } from '@tribes-harness/protocol/types/ScreenProtocol'

/**
 * A wire image as Pi's message content.
 *
 * The two shapes are almost identical — both carry raw base64 and a mime type —
 * but the wire type deliberately does NOT include Pi's `type: 'image'` tag. That
 * tag is Pi's content-union discriminant, and putting it on the wire would let the
 * browser name a content kind directly, which is the client deciding how its input
 * is interpreted rather than what it contains.
 */
export function toPiImageContent(image: PromptImage): ImageContent {
  return {
    type: 'image',
    data: image.data,
    mimeType: image.mimeType
  }
}
