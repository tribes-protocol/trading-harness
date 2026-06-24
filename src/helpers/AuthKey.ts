import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { type AgentAuthorizationKey, AgentAuthorizationKeySchema } from '@/types/JwtAuth'
import { ensureJsonTreeString } from '@/utils/Lang'

const AGENT_AUTHORIZATION_KEY_PATH = resolve(process.cwd(), '.pi/agent-authorization-key.json')

function isFileNotFoundError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

export async function readAgentAuthorizationKey(): Promise<AgentAuthorizationKey | null> {
  let text: string
  try {
    text = await readFile(AGENT_AUTHORIZATION_KEY_PATH, 'utf8')
  } catch (error) {
    // A missing key file is the expected logged-out state — soft-fail to null so
    // callers can prompt the user to log in. Any other read failure is genuine
    // and stays loud.
    if (isFileNotFoundError(error)) {
      return null
    }
    throw new Error(
      `Unable to read agent authorization key at ${AGENT_AUTHORIZATION_KEY_PATH}: ` +
        `${error instanceof Error ? error.message : String(error)}`
    )
  }

  // A present-but-corrupt key must fail loudly rather than masquerade as logged-out.
  const parsed: unknown = JSON.parse(text)
  return AgentAuthorizationKeySchema.parse(parsed)
}

export async function writeAgentAuthorizationKey(key: AgentAuthorizationKey): Promise<void> {
  await mkdir(dirname(AGENT_AUTHORIZATION_KEY_PATH), { recursive: true })
  await writeFile(AGENT_AUTHORIZATION_KEY_PATH, ensureJsonTreeString(key), {
    encoding: 'utf8',
    mode: 0o600
  })
}
