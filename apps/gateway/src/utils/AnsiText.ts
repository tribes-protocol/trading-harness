/**
 * ANSI escape removal for text on its way to the browser.
 *
 * Extension UI output is written for a TERMINAL: `ctx.ui.setWidget` is handed
 * whatever a child process printed, and `tribes-cli login` prints its URL wrapped
 * in bold and colour codes. Forwarded verbatim those arrive in the transcript as
 * literal escape noise around the one string the operator needs to click.
 *
 * Two sequence families are stripped:
 *  - CSI (`ESC [ … letter`) — colour, bold, cursor movement.
 *  - OSC (`ESC ] … BEL`/`ESC \`) — window-title writes, which the tribes extension
 *    emits on session end. These matter more than they look: an OSC runs until its
 *    terminator rather than a single letter, so leaving one intact corrupts
 *    everything after it rather than showing one stray code.
 *
 * The pattern is built from char codes rather than written as literal escapes so
 * the source stays free of raw control characters.
 */

const ESC = String.fromCharCode(27)
const BEL = String.fromCharCode(7)

const ANSI_PATTERN = new RegExp(
  `${ESC}\\[[0-9;?]*[A-Za-z]|${ESC}\\][\\s\\S]*?(?:${BEL}|${ESC}\\\\)`,
  'gu'
)

export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, '')
}
