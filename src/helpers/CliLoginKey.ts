import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { type CliLoginKey, CliLoginKeySchema } from '@/types/CliLogin'
import { ensureJsonTreeString } from '@/utils/Lang'

const CLI_LOGIN_KEY_PATH = resolve(process.cwd(), '.pi/cli-login-key.json')

export async function readCliLoginKey(): Promise<CliLoginKey> {
  try {
    const text = await readFile(CLI_LOGIN_KEY_PATH, 'utf8')
    const parsed: unknown = JSON.parse(text)
    return CliLoginKeySchema.parse(parsed)
  } catch (error) {
    throw new Error(
      `Unable to read cli login key at ${CLI_LOGIN_KEY_PATH}: ` +
        `${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function writeCliLoginKey(key: CliLoginKey): Promise<void> {
  await mkdir(dirname(CLI_LOGIN_KEY_PATH), { recursive: true })
  await writeFile(CLI_LOGIN_KEY_PATH, ensureJsonTreeString(key), {
    encoding: 'utf8',
    mode: 0o600
  })
}
