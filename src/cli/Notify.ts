import { fstatSync, readFileSync } from 'node:fs'
import { exit, stdin, stdout } from 'node:process'

import { Command } from 'commander'

import { writeCliError } from '@/helpers/WriteOutput'
import {
  NotifyBackendUnavailableError,
  NotifySendFailedError,
  NotifyService
} from '@/services/NotifyService'
import type { NotifyBackend, NotifyRequest } from '@/types/Notify'
import { NotifyBackendSchema } from '@/types/Notify'
import { ensureJsonTreeString } from '@/utils/Lang'

const VERSION = '1.0.0'

const DEFAULT_SOUND = 'Ping'
const DEFAULT_TITLE = 'Tribes Agent'

const EXIT_USAGE = 1
const EXIT_NO_BACKEND = 2
const EXIT_SEND_FAILED = 3

const STDIN_FD = 0

type NotifyOptions = {
  readonly title: string
  readonly subtitle: string | undefined
  readonly sound: boolean | undefined
  readonly soundName: string | undefined
  readonly backend: string | undefined
  readonly doctor: boolean | undefined
  readonly listBackends: boolean | undefined
}

/**
 * Read the message from stdin, but only for a real `cmd | notify` pipeline or a
 * `notify < file` redirect.
 *
 * Checking `isTTY` alone is not enough: a non-interactive caller (an agent, cron,
 * CI) hands down a socket, which is not a TTY and never reaches EOF, so reading
 * it would block forever. A pipe reports as a FIFO and a redirect as a regular
 * file; anything else (socket, /dev/null) is treated as "no stdin".
 *
 * `readFileSync` rather than the `stdin` stream: under Bun the stream imported
 * from `node:process` yields nothing for a file redirect.
 */
function readStdin(): string {
  if (stdin.isTTY) return ''
  try {
    const stats = fstatSync(STDIN_FD)
    if (!stats.isFIFO() && !stats.isFile()) return ''
    return readFileSync(STDIN_FD, 'utf8')
  } catch {
    return ''
  }
}

/** Collapse to one line: multi-line bodies render inconsistently across backends. */
function normalizeMessage(raw: string): string {
  return raw.replace(/\s+/gu, ' ').trim()
}

const notifyService = new NotifyService()

function resolveBackend(requested: string | undefined): NotifyBackend {
  if (requested === undefined || requested === 'auto') {
    const detected = notifyService.autodetect()
    if (!detected) {
      writeCliError('notify: no usable notification backend found (try --doctor)')
      exit(EXIT_NO_BACKEND)
    }
    return detected
  }

  const parsed = NotifyBackendSchema.safeParse(requested)
  if (!parsed.success) {
    const allowed = NotifyBackendSchema.options.join(', ')
    writeCliError(`notify: unknown backend '${requested}' (expected one of: ${allowed})`)
    exit(EXIT_USAGE)
  }
  return parsed.data
}

async function send(request: NotifyRequest, backend: NotifyBackend): Promise<void> {
  try {
    await notifyService.send(request, backend)
  } catch (error) {
    if (error instanceof NotifyBackendUnavailableError) {
      writeCliError(`notify: ${error.message}`)
      exit(EXIT_NO_BACKEND)
    }
    if (error instanceof NotifySendFailedError) {
      writeCliError(`notify: ${error.message}`)
      exit(EXIT_SEND_FAILED)
    }
    throw error
  }
}

async function runDoctor(): Promise<void> {
  const diagnostics = notifyService.diagnose()
  stdout.write(`${ensureJsonTreeString(diagnostics)}\n`)

  if (!diagnostics.selected) {
    writeCliError('notify: no usable notification backend found')
    exit(EXIT_NO_BACKEND)
  }

  await send(
    {
      message: 'If you can see this, delivery works.',
      title: 'notify doctor',
      subtitle: undefined,
      sound: DEFAULT_SOUND
    },
    diagnostics.selected
  )

  writeCliError(
    [
      '',
      'Backend reported success. If nothing appeared on screen, the backend handed',
      'the notification off but something downstream dropped it. On macOS an app',
      "whose alert style is 'None' files notifications silently into Notification",
      'Center. Fix it in System Settings > Notifications.'
    ].join('\n')
  )
}

export function buildNotifyCommand(): Command {
  const program = new Command('notify')
  program
    .description('Send a desktop notification from any terminal')
    .version(VERSION)
    .argument('[message...]', 'notification body (or pipe it on stdin)')
    .option('-t, --title <text>', 'notification title', DEFAULT_TITLE)
    .option('-s, --subtitle <text>', 'subtitle (macOS only, ignored elsewhere)')
    .option('--sound', `play the default sound ("${DEFAULT_SOUND}")`)
    .option('--sound-name <name>', 'play a named sound (macOS: Glass, Hero, Submarine, ...)')
    .option('-b, --backend <name>', 'force a backend instead of auto-detecting')
    .option('--doctor', 'diagnose delivery on this machine, then send a test notification')
    .option('--list-backends', 'print each backend and whether it is available here')
    .addHelpText(
      'after',
      [
        '',
        'A bare --sound never consumes the next argument, so',
        '`notify --sound "all done"` notifies with the message "all done".',
        'Use --sound-name Glass to pick a specific sound.',
        '',
        'Exit codes: 0 sent, 1 usage error, 2 no usable backend, 3 backend failed.'
      ].join('\n')
    )
    .action(
      async (messageParts: string[], options: NotifyOptions, command: Command): Promise<void> => {
        if (options.listBackends) {
          stdout.write(`${ensureJsonTreeString(notifyService.diagnose().backends)}\n`)
          return
        }

        if (options.doctor) {
          await runDoctor()
          return
        }

        const raw = messageParts.length > 0 ? messageParts.join(' ') : readStdin()
        const message = normalizeMessage(raw)

        const titleIsExplicit = command.getOptionValueSource('title') === 'cli'
        if (!message && !titleIsExplicit && !options.subtitle) {
          writeCliError('notify: nothing to show (pass a message, or set --title/--subtitle)')
          exit(EXIT_USAGE)
        }

        const backend = resolveBackend(options.backend)
        const sound = options.soundName ?? (options.sound ? DEFAULT_SOUND : undefined)
        const request: NotifyRequest = {
          message,
          title: options.title,
          subtitle: options.subtitle,
          sound
        }

        await send(request, backend)
      }
    )

  return program
}
