import type { OscNotification } from '@/types/Notify'

const TITLE_MAX_CHARS = 64
const BODY_MAX_CHARS = 200

/**
 * Where to write a terminal escape, most-preferred first.
 *
 * `/dev/tty` is the controlling terminal and the right answer whenever there is
 * one. But an agent that runs a shell command hands the child no controlling
 * terminal — pi does exactly this: fd 0/1/2 are pipes it captures, and opening
 * `/dev/tty` fails with ENXIO. Writing the escape to stdout there just paints it
 * into the agent's own output pane; it never reaches the terminal. So the VM
 * bridge (apps/microvmd `pty.ts`) exports the pty slave path as TRIBES_TTY, and
 * we fall back to it. Stdout is the last resort, for a plain `cmd | notify` on a
 * developer's machine where it may still be the terminal.
 */
export function terminalWriteTargets(env: Record<string, string | undefined>): readonly string[] {
  const ttyPath = env.TRIBES_TTY
  return ttyPath ? ['/dev/tty', ttyPath] : ['/dev/tty']
}

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
 *   ESC ] 777 ; notify ; <title> ; <body> ESC \
 *
 * Understood by kitty, VSCode, urxvt, and — the reason it exists here — the
 * xterm.js terminal the zipbox dashboard renders in the browser. ST-terminated
 * rather than BEL-terminated so the sequence can never be mistaken for a bell,
 * which readline rings on every tab-completion and which receivers ignore.
 */
export function buildOscNotification({ title, body }: OscNotification): string {
  const safeTitle = sanitizeField(title, TITLE_MAX_CHARS)
  const safeBody = sanitizeField(body, BODY_MAX_CHARS)
  return `\x1b]777;notify;${safeTitle};${safeBody}\x1b\\`
}
