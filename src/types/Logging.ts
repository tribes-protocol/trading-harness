import { z } from 'zod'

export const LoggerLevelSchema = z.enum(['debug', 'info', 'warn', 'error'])

export const LoggerTagsSchema = z.object({
  area: z.string(),
  operation: z.string()
})
export const LoggerDetailsSchema = z.record(z.unknown())

export const LoggerErrorOptionsSchema = z.object({
  error: z.unknown(),
  tags: LoggerTagsSchema.nullish(),
  details: LoggerDetailsSchema.nullish()
})

export type LoggerLevel = z.infer<typeof LoggerLevelSchema>
export type LoggerTags = z.infer<typeof LoggerTagsSchema>
export type LoggerDetails = z.infer<typeof LoggerDetailsSchema>
export type LoggerErrorOptions = z.infer<typeof LoggerErrorOptionsSchema>

export interface LoggerCaptureContext {
  tags?: LoggerTags
  extra?: Record<string, unknown>
}

export type CaptureExceptionFn = (error: unknown, context: LoggerCaptureContext) => void

export interface LoggerConfig {
  name: string
  captureException?: CaptureExceptionFn
}

export type LoggerLogFn = (message: string, details?: LoggerDetails) => void

export interface Logger {
  debug: LoggerLogFn
  info: LoggerLogFn
  warn: LoggerLogFn
  error(message: string, options: LoggerErrorOptions): void
}
