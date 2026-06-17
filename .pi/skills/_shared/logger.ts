/**
 * Shared skill logger — the TypeScript port of the former _shared/logger.py.
 *
 * `makeSkillLogger(name)` returns a pino logger with two rolling file sinks under
 * `runtime/logs/skills/<name>/`:
 *   - `console.log` captures the configured level and above (default INFO).
 *   - `error.log`   captures WARNING and above.
 * Both rotate at 10MB and retain 7 historical files (via pino-roll). The level
 * comes from the `LOG_LEVEL` env var (default `info`).
 *
 * Critical: stdout/stderr sinks are silent by default so skill CLIs that emit
 * JSON on stdout (the orchestrator's exec-capture contract) stay uncontaminated.
 * Set `LOG_TO_STDOUT=1` to mirror logs to stderr for local debugging.
 */
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

import pino, { type Logger, type TransportTargetOptions } from 'pino'

const ROTATE_SIZE = '10m'
const RETAIN_COUNT = 7

export function resolveSkillLogDir(cwd: string, name: string): string {
  return resolve(cwd, 'runtime', 'logs', 'skills', name)
}

export function makeSkillLogger(name: string, cwd: string = process.cwd()): Logger {
  const dir = resolveSkillLogDir(cwd, name)
  mkdirSync(dir, { recursive: true })
  const level = (process.env.LOG_LEVEL ?? 'info').toLowerCase()

  const rollTarget = (file: string, fileLevel: string): TransportTargetOptions => ({
    target: 'pino-roll',
    level: fileLevel,
    options: {
      file: resolve(dir, file),
      size: ROTATE_SIZE,
      limit: { count: RETAIN_COUNT },
      mkdir: true
    }
  })

  const targets: TransportTargetOptions[] = [
    rollTarget('console.log', level),
    rollTarget('error.log', 'warn')
  ]
  if (process.env.LOG_TO_STDOUT === '1') {
    // destination 2 = stderr; stdout (1) is reserved for the CLI's payload.
    targets.push({ target: 'pino/file', level, options: { destination: 2 } })
  }

  return pino({ level, base: { name } }, pino.transport({ targets }))
}
