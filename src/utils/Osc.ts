import type { OscNotification } from '@/types/Notify'

const TITLE_MAX_CHARS = 64
const BODY_MAX_CHARS = 200

/**
 * Strip anything that would let the payload break out of the escape sequence.
 *
 * A raw ESC, BEL, or ST inside the payload terminates the OSC early, and the
 * bytes after it are then interpreted as a fresh escape sequence — an agent
 * that echoes untrusted text through `notify` could otherwise drive the
 * receiving terminal. Semicolons are the field separator for OSC 777, so one in
 * the body would silently truncate it at the receiver.
 */
function sanitizeField(raw: string, maxChars: number): string {
  let out = ''
  for (const ch of raw) {
    const code = ch.codePointAt(0) ?? 0
    if (code < 0x20 || code === 0x7f) {
      out += ' '
    } else if (ch === ';') {
      out += ','
    } else {
      out += ch
    }
  }
  return out.trim().slice(0, maxChars)
}

/**
 * Build an OSC 777 desktop-notification escape:
 *
 *   ESC ] 777 ; notify ; <title> ; <body> BEL
 *
 * Understood by kitty, VSCode, urxvt, and — the reason it exists here — the
 * xterm.js terminal the zipbox dashboard renders in the browser.
 *
 * BEL-terminated because that is the wire format already on this repo: the
 * jiti-loaded extension at `.pi/extensions/tribes/index.ts` writes a
 * BEL-terminated OSC 9 straight to stdout, and a second emitter on a different
 * terminator would put two wire formats in one repo. ST may or may not be
 * supported; this code deliberately does not find out.
 *
 * BEL termination costs nothing in safety: `sanitizeField` already replaces
 * every codepoint below 0x20 — BEL among them — so a payload cannot carry the
 * terminator and cannot break out of the sequence.
 */
export function buildOscNotification({ title, body }: OscNotification): string {
  const safeTitle = sanitizeField(title, TITLE_MAX_CHARS)
  const safeBody = sanitizeField(body, BODY_MAX_CHARS)
  return `\x1b]777;notify;${safeTitle};${safeBody}\x07`
}

/**
 * Build the bare-message OSC 9 escape:
 *
 *   ESC ] 9 ; <message> BEL
 *
 * The untitled form. Kept because it is the contract this repo already emits
 * for a message with no title — dropping it would change the wire format as a
 * side effect of a refactor.
 */
export function buildOscBareNotification(message: string): string {
  return `\x1b]9;${sanitizeField(message, BODY_MAX_CHARS)}\x07`
}
