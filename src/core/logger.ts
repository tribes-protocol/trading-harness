import { redactString, redactValue } from './redact.js';

/**
 * Structured JSON logger (stderr). All messages and fields pass through
 * secret redaction. Keep stdout clean for CLI data output.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function threshold(): number {
  const level = (process.env.LOG_LEVEL ?? 'info') as LogLevel;
  return LEVEL_ORDER[level] ?? LEVEL_ORDER.info;
}

export class Logger {
  constructor(private readonly bindings: Record<string, unknown> = {}) {}

  child(bindings: Record<string, unknown>): Logger {
    return new Logger({ ...this.bindings, ...bindings });
  }

  private write(level: LogLevel, msg: string, fields?: Record<string, unknown>): void {
    if (LEVEL_ORDER[level] < threshold()) return;
    const entry = {
      ts: new Date().toISOString(),
      level,
      msg: redactString(msg),
      ...(redactValue({ ...this.bindings, ...(fields ?? {}) }) as Record<string, unknown>),
    };
    process.stderr.write(`${JSON.stringify(entry)}\n`);
  }

  debug(msg: string, fields?: Record<string, unknown>): void {
    this.write('debug', msg, fields);
  }
  info(msg: string, fields?: Record<string, unknown>): void {
    this.write('info', msg, fields);
  }
  warn(msg: string, fields?: Record<string, unknown>): void {
    this.write('warn', msg, fields);
  }
  error(msg: string, fields?: Record<string, unknown>): void {
    this.write('error', msg, fields);
  }
}

export const logger = new Logger({ app: 'pi' });
