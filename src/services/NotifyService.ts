import { execFile } from 'node:child_process'
import { accessSync, constants, writeFileSync } from 'node:fs'
import { release } from 'node:os'
import { delimiter, join } from 'node:path'
import { env, platform, stdout } from 'node:process'
import { promisify } from 'node:util'

import type {
  NotifyBackend,
  NotifyBackendStatus,
  NotifyDiagnostics,
  NotifyRequest
} from '@/types/Notify'

const execFileAsync = promisify(execFile)

const BACKEND_NOTES: Record<NotifyBackend, string> = {
  'terminal-notifier':
    'preferred on macOS; registers its own bundle id, so macOS can hold a permission for it',
  osascript: 'macOS built-in; delivered under a system script host',
  'notify-send': 'Linux/freedesktop',
  bell: 'audible bell only, no banner; never auto-selected'
}

/**
 * Order matters: the first available backend wins during auto-detection.
 * `bell` is deliberately absent — it draws nothing, so it is opt-in only.
 */
const AUTO_DETECT_ORDER: readonly NotifyBackend[] = [
  'terminal-notifier',
  'osascript',
  'notify-send'
]

const ALL_BACKENDS: readonly NotifyBackend[] = [
  'terminal-notifier',
  'osascript',
  'notify-send',
  'bell'
]

export class NotifyBackendUnavailableError extends Error {}

export class NotifySendFailedError extends Error {}

export class NotifyService {
  /** Resolve a command on PATH without shelling out to `which`. */
  private resolveExecutable(command: string): boolean {
    const pathValue = env.PATH
    if (!pathValue) return false
    for (const dir of pathValue.split(delimiter)) {
      if (!dir) continue
      try {
        accessSync(join(dir, command), constants.X_OK)
        return true
      } catch {
        // Not executable here; keep scanning the remaining PATH entries.
      }
    }
    return false
  }

  isAvailable(backend: NotifyBackend): boolean {
    if (backend === 'bell') return true
    if (backend === 'osascript') return platform === 'darwin' && this.resolveExecutable('osascript')
    return this.resolveExecutable(backend)
  }

  autodetect(): NotifyBackend | undefined {
    return AUTO_DETECT_ORDER.find((backend) => this.isAvailable(backend))
  }

  diagnose(): NotifyDiagnostics {
    const backends: NotifyBackendStatus[] = ALL_BACKENDS.map((backend) => ({
      backend,
      available: this.isAvailable(backend),
      note: BACKEND_NOTES[backend]
    }))
    return {
      platform: `${platform} ${release()}`,
      terminal: env.TERM_PROGRAM ?? env.TERM ?? 'unknown',
      backends,
      selected: this.autodetect()
    }
  }

  async send(request: NotifyRequest, backend: NotifyBackend): Promise<void> {
    if (!this.isAvailable(backend)) {
      throw new NotifyBackendUnavailableError(
        `backend '${backend}' is not available on this system`
      )
    }
    try {
      await this.dispatch(request, backend)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new NotifySendFailedError(`backend '${backend}' failed to send: ${reason}`)
    }
  }

  private async dispatch(request: NotifyRequest, backend: NotifyBackend): Promise<void> {
    switch (backend) {
      case 'terminal-notifier':
        return this.sendTerminalNotifier(request)
      case 'osascript':
        return this.sendOsascript(request)
      case 'notify-send':
        return this.sendNotifySend(request)
      case 'bell':
        return this.sendBell()
    }
  }

  private async sendTerminalNotifier(request: NotifyRequest): Promise<void> {
    const args = ['-message', request.message, '-title', request.title]
    if (request.subtitle) args.push('-subtitle', request.subtitle)
    if (request.sound) args.push('-sound', request.sound)
    await execFileAsync('terminal-notifier', args)
  }

  /**
   * Strings are passed as AppleScript `argv`, never interpolated into the
   * script source, so a message containing quotes or backslashes cannot alter
   * the script. The `--` stops osascript from parsing a leading-dash message as
   * one of its own options.
   */
  private async sendOsascript(request: NotifyRequest): Promise<void> {
    let clause = 'display notification _msg with title _title'
    if (request.subtitle) clause += ' subtitle _sub'
    if (request.sound) clause += ' sound name _snd'

    await execFileAsync('osascript', [
      '-e',
      'on run argv',
      '-e',
      'set _msg to item 1 of argv',
      '-e',
      'set _title to item 2 of argv',
      '-e',
      'set _sub to item 3 of argv',
      '-e',
      'set _snd to item 4 of argv',
      '-e',
      clause,
      '-e',
      'end run',
      '--',
      request.message,
      request.title,
      request.subtitle ?? '',
      request.sound ?? ''
    ])
  }

  private async sendNotifySend(request: NotifyRequest): Promise<void> {
    const body = request.subtitle ? `${request.subtitle}\n${request.message}` : request.message
    await execFileAsync('notify-send', ['--', request.title, body])
  }

  private async sendBell(): Promise<void> {
    try {
      writeFileSync('/dev/tty', '\x07')
    } catch {
      // No controlling terminal (piped, or a sandboxed shell): fall back to stdout.
      stdout.write('\x07')
    }
  }
}
