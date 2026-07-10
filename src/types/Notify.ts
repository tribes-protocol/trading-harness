import { z } from 'zod'

/**
 * Delivery mechanisms.
 *
 * `bell` only makes noise — it draws no banner — so it is never auto-selected
 * and must be requested explicitly.
 *
 * `osc` writes a notification escape into the terminal itself rather than
 * calling an OS notifier. It is the last auto-detect candidate, which is what
 * makes it the one that fires inside a cloud microVM: no OS notifier binary is
 * installed there, but the terminal is a browser that understands the escape.
 *
 * A zod enum rather than a bare union: the CLI validates `--backend` against it
 * and reuses `.options` to build the error message listing valid values.
 */
export const NotifyBackendSchema = z.enum([
  'terminal-notifier',
  'osascript',
  'notify-send',
  'bell',
  'osc'
])

export type NotifyBackend = z.infer<typeof NotifyBackendSchema>

export type NotifyRequest = {
  readonly message: string
  readonly title: string
  readonly subtitle: string | undefined
  readonly sound: string | undefined
}

export type OscNotification = {
  readonly title: string
  readonly body: string
}

export type NotifyBackendStatus = {
  readonly backend: NotifyBackend
  readonly available: boolean
  readonly note: string
}

export type NotifyDiagnostics = {
  readonly platform: string
  readonly terminal: string
  readonly backends: readonly NotifyBackendStatus[]
  readonly selected: NotifyBackend | undefined
}
