import { Command } from 'commander'

// Emits OSC 9 / OSC 777 terminal-notification escapes directly to stdout of
// the agent's own PTY session. The zipbox web terminal (packages/sandboxing)
// parses these escapes off the outer PTY and turns them into a bell + OS push
// notification — see TerminalNotification.ts for the wire contract this must
// stay under (message clamped to 200 chars server-side headroom).
const OSC = '\x1b]'
const BEL = '\x07'
const MAX_LEN = 200

function clamp(text: string): string {
  return text.length > MAX_LEN ? `${text.slice(0, MAX_LEN - 1)}…` : text
}

function emitMessage(message: string): void {
  process.stdout.write(`${OSC}9;${clamp(message)}${BEL}`)
}

function emitTitledNotification(title: string, body: string): void {
  process.stdout.write(`${OSC}777;notify;${clamp(title)};${clamp(body)}${BEL}`)
}

interface NotifyOptions {
  readonly title?: string
  readonly body?: string
}

const VERSION = '1.0.0'

export function buildNotifyCommand(): Command {
  const program = new Command('notify')
  program
    .description(
      'Emit a terminal notification (OSC 9 / OSC 777) that the zipbox web terminal turns into a bell + OS push'
    )
    .version(VERSION)
    .argument('[message]', 'Notification message')
    .option('--title <title>', 'Notification title (uses the OSC 777 title+body form)')
    .option('--body <body>', 'Notification body (uses the OSC 777 title+body form)')
    .action((message: string | undefined, options: NotifyOptions): void => {
      if (options.title !== undefined || options.body !== undefined) {
        emitTitledNotification(options.title ?? 'tribes-cli', options.body ?? message ?? '')
        return
      }
      if (!message) {
        process.stderr.write('notify: provide a message, or --title/--body\n')
        process.exitCode = 1
        return
      }
      emitMessage(message)
    })

  return program
}
