import { ValidationError } from './errors.js';

/** Canonical observation/bar frequencies used across all schemas. */
export const FREQUENCIES = [
  'tick',
  '1m',
  '5m',
  '15m',
  '30m',
  '1h',
  '4h',
  '1d',
  '1w',
  '1mo',
  '1q',
  '1y',
  'irregular',
] as const;

export type Frequency = (typeof FREQUENCIES)[number];

/** Current time as UTC ISO-8601 with milliseconds. */
export function nowIso(): string {
  return new Date().toISOString();
}

/** Convert epoch seconds/millis, Date, or parseable string to UTC ISO-8601. */
export function toUtcIso(input: string | number | Date): string {
  let date: Date;
  if (input instanceof Date) {
    date = input;
  } else if (typeof input === 'number') {
    // Heuristic: values below 1e12 are epoch seconds (valid until year 33658).
    date = new Date(input < 1e12 ? input * 1000 : input);
  } else {
    date = new Date(input);
  }
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(`Cannot parse timestamp: ${String(input)}`);
  }
  return date.toISOString();
}

/** YYYY-MM-DD (UTC) from a Date or ISO timestamp. */
export function isoDateOnly(input: string | Date = new Date()): string {
  const iso = input instanceof Date ? input.toISOString() : toUtcIso(input);
  return iso.slice(0, 10);
}

/** Age of a timestamp in whole milliseconds relative to now. */
export function ageMs(isoTimestamp: string): number {
  return Date.now() - new Date(isoTimestamp).getTime();
}
