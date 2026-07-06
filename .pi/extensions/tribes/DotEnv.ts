import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export function readNonEmptyValue(value: string | null | undefined): string | null {
  return value && value.trim().length > 0 ? value.trim() : null
}

/**
 * Parse <root>/.env into an ordered key -> value map. Missing file = empty.
 */
export async function readDotEnv(cwd: string): Promise<Map<string, string>> {
  const env = new Map<string, string>()
  try {
    const content = await readFile(resolve(cwd, '.env'), 'utf8')
    for (const line of content.split(/\r?\n/u)) {
      const separator = line.indexOf('=')
      const key = line.slice(0, separator).trim()
      if (separator > 0 && key.length > 0 && !key.startsWith('#')) {
        env.set(key, line.slice(separator + 1))
      }
    }
  } catch {
    // No existing .env yet — start fresh.
  }
  return env
}

export async function readDotEnvValue(cwd: string, name: string): Promise<string | null> {
  return readNonEmptyValue((await readDotEnv(cwd)).get(name))
}
