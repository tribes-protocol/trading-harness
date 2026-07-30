import type { ClientFrame } from '@tribes-harness/protocol/types/ScreenProtocol'

/**
 * Hand-rolled JSON encoder for the four outbound client frames.
 *
 * `JSON.stringify` is banned repo-wide (lucy/no-json-stringify), and the frame union
 * is closed and tiny — four shapes, all string fields — so a typed serializer is both
 * exhaustive (the compiler checks the switch) and cheaper than the reflective encoder.
 * Only the wire needs this; nothing else in the app serializes.
 */

const JSON_ESCAPES: Record<string, string> = {
  '"': '\\"',
  '\\': '\\\\',
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
  '\b': '\\b',
  '\f': '\\f'
}

/** Quote and escape a string exactly as JSON requires (RFC 8259 section 7). */
export function encodeJsonString(value: string): string {
  let out = '"'
  for (const char of value) {
    const escaped = JSON_ESCAPES[char]
    if (escaped !== undefined) {
      out += escaped
      continue
    }
    const code = char.codePointAt(0) ?? 0
    out += code < 0x20 ? `\\u${code.toString(16).padStart(4, '0')}` : char
  }
  return `${out}"`
}

/** `null` for an absent optional field — the schemas all accept it via `.nullish()`. */
function encodeNullableString(value: string | null | undefined): string {
  return value === null || value === undefined ? 'null' : encodeJsonString(value)
}

export function serializeClientFrame(frame: ClientFrame): string {
  const screenId = encodeJsonString(frame.screenId)
  switch (frame.t) {
    case 'attach':
      return `{"t":"attach","screenId":${screenId},"sinceEntryId":${encodeNullableString(
        frame.sinceEntryId
      )}}`
    case 'prompt':
      return `{"t":"prompt","screenId":${screenId},"text":${encodeJsonString(
        frame.text
      )},"streamingBehavior":${encodeNullableString(frame.streamingBehavior)}}`
    case 'abort':
      return `{"t":"abort","screenId":${screenId}}`
    case 'detach':
      return `{"t":"detach","screenId":${screenId}}`
  }
}
