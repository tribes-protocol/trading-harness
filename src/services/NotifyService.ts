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
import { buildOscNotification } from '@/utils/Osc'

const execFileAsync = promisify(execFile)

const BACKEND_NOTES: Record<NotifyBackend, string> = {
  'terminal-notifier':
    'preferred on macOS; registers its own bundle id, so macOS can hold a permission for it',
  osascript: 'macOS built-in; delivered under a system script host',
  'notify-send': 'Linux/freedesktop',
  bell: 'audible bell only, no banner; never auto-selected',
  osc: 'terminal escape (OSC 777); the only backend that reaches a browser-hosted terminal'
}

/**
 * Order matters: the first available backend wins during auto-detection.
 *
 * `bell` is deliberately absent — it draws nothing, so it is opt-in only. `osc`
 * is last: on a desktop the OS notifiers give a real banner, but inside a cloud
 * microVM none of them are installed and the escape is the only thing that can
 * reach the user's browser.
 */
const AUTO_DETECT_ORDER: readonly NotifyBackend[] = [
  'terminal-notifier',
  'osascript',
  'notify-send',
  'osc'
]

const ALL_BACKENDS: readonly NotifyBackend[] = [
  'terminal-notifier',
  'osascript',
  'notify-send',
  'bell',
  'osc'
]

function joinBody(parts: readonly (string | undefined)[], separator: string): string {
  return parts.filter((part): part is string => Boolean(part)).join(separator)
}

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
    // An escape sequence always "sends"; whether anything renders it is the
    // terminal's business, not ours.
    if (backend === 'bell' || backend === 'osc') return true
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
      case 'osc':
        return this.sendOsc(request)
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
    const body = joinBody([request.subtitle, request.message], '\n')
    await execFileAsync('notify-send', ['--', request.title, body])
  }

  private async sendBell(): Promise<void> {
    this.writeToTerminal('\x07')
  }

  /**
   * `sound` has no analogue in the escape and is ignored. A subtitle prefixes
   * the body, matching how notify-send flattens the two.
   */
  private async sendOsc(request: NotifyRequest): Promise<void> {
    const body = joinBody([request.subtitle, request.message], ' — ')
    this.writeToTerminal(buildOscNotification({ title: request.title, body }))
  }

  private writeToTerminal(payload: string): void {
    try {
      writeFileSync('/dev/tty', payload)
    } catch {
      // No controlling terminal (piped, or a sandboxed shell): fall back to stdout.
      stdout.write(payload)
    }
  }
}
