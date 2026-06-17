import {
  type Logger,
  type LoggerCaptureContext,
  type LoggerConfig,
  type LoggerErrorOptions,
  type LoggerTags
} from '@/types/Logging'
import { isNullish, toJsonTreeString } from '@/utils/lang'

let _colorize = false

const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  yellow: '\x1b[33m'
} as const

export function setLoggerColorize(enabled: boolean): void {
  _colorize = enabled
}

function buildPrefix(name: string): string {
  if (!_colorize) {
    return `[${name}]`
  }
  return `${COLORS.dim}[${name}]${COLORS.reset}`
}

function buildColoredPrefix(name: string, color: string): string {
  if (!_colorize) {
    return `[${name}]`
  }
  return `${color}[${name}]${COLORS.reset}`
}

export function buildLoggerCaptureContext(options: LoggerErrorOptions): LoggerCaptureContext {
  const tags: LoggerTags | undefined = isNullish(options.tags) ? undefined : options.tags
  if (isNullish(options.details)) {
    return {
      tags
    }
  }

  return {
    tags,
    extra: {
      details: options.details
    }
  }
}

export function createLogger(config: LoggerConfig): Logger {
  const { name } = config

  return {
    debug(message: string, details?: Record<string, unknown>): void {
      console.debug(buildPrefix(name), message, ...(isNullish(details) ? [] : [details]))
    },
    info(message: string, details?: Record<string, unknown>): void {
      console.info(buildPrefix(name), message, ...(isNullish(details) ? [] : [details]))
    },
    warn(message: string, details?: Record<string, unknown>): void {
      console.warn(
        buildColoredPrefix(name, COLORS.yellow),
        message,
        ...(isNullish(details) ? [] : [details])
      )
    },
    error(message: string, options: LoggerErrorOptions): void {
      if (config.captureException) {
        config.captureException(options.error, buildLoggerCaptureContext(options))
      }

      const errorPrefix = buildColoredPrefix(name, COLORS.red)

      if (isNullish(options.details)) {
        console.error(`${errorPrefix} ${message}`, options.error)
        return
      }

      const params = toJsonTreeString(options.details)
      if (isNullish(params)) {
        console.error(`${errorPrefix} ${message}`, options.error)
        return
      }

      console.error(`${errorPrefix} ${message}. params: ${params}`, options.error)
    }
  }
}
