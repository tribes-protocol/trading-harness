import { describe, expect, it } from 'vitest'

import { toPiImageContent } from '@/utils/PromptImages'

describe('toPiImageContent', () => {
  it('tags the wire image as Pi image content', () => {
    // The `type` discriminant is added HERE rather than carried on the wire: it is
    // Pi's content-union tag, and letting the browser send it would be the client
    // naming a content kind rather than describing its own input.
    expect(toPiImageContent({ mimeType: 'image/png', data: 'aGVsbG8=' })).toEqual({
      type: 'image',
      mimeType: 'image/png',
      data: 'aGVsbG8='
    })
  })

  it('passes the base64 through untouched', () => {
    const data = 'iVBORw0KGgoAAAANSUhEUg=='
    expect(toPiImageContent({ mimeType: 'image/jpeg', data }).data).toBe(data)
  })
})
