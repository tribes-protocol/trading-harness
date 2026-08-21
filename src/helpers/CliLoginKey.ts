import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { resolveTradesStateDir } from '@/common/Env'
import { type CliLoginKey, CliLoginKeySchema } from '@/types/CliLogin'
import { ensureJsonTreeString } from '@/utils/Lang'

// Anchored to the canonical state dir (never cwd) — same class as the agent
// authorization key: a cwd-relative default breaks reads from a foreign cwd.
function cliLoginKeyPath(): string {
  return join(resolveTradesStateDir(), 'cli-login-key.json')
}

export async function readCliLoginKey(): Promise<CliLoginKey> {
  const keyPath = cliLoginKeyPath()
  try {
    const text = await readFile(keyPath, 'utf8')
    const parsed: unknown = JSON.parse(text)
    return CliLoginKeySchema.parse(parsed)
  } catch (error) {
    throw new Error(
      `Unable to read cli login key at ${keyPath}: ` +
        `${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function writeCliLoginKey(key: CliLoginKey): Promise<void> {
  const keyPath = cliLoginKeyPath()
  await mkdir(dirname(keyPath), { recursive: true })
  await writeFile(keyPath, ensureJsonTreeString(key), {
    encoding: 'utf8',
    mode: 0o600
  })
}
