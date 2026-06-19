import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { type AgentAuthorizationKey, AgentAuthorizationKeySchema } from '@/types/JwtAuth'
import { ensureJsonTreeString } from '@/utils/Lang'

const AGENT_AUTHORIZATION_KEY_PATH = resolve(process.cwd(), '.pi/agent-authorization-key.json')

export async function readAgentAuthorizationKey(): Promise<AgentAuthorizationKey> {
  try {
    const text = await readFile(AGENT_AUTHORIZATION_KEY_PATH, 'utf8')
    const parsed: unknown = JSON.parse(text)
    return AgentAuthorizationKeySchema.parse(parsed)
  } catch (error) {
    throw new Error(
      `Unable to read agent authorization key at ${AGENT_AUTHORIZATION_KEY_PATH}: ` +
        `${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function writeAgentAuthorizationKey(key: AgentAuthorizationKey): Promise<void> {
  await mkdir(dirname(AGENT_AUTHORIZATION_KEY_PATH), { recursive: true })
  await writeFile(AGENT_AUTHORIZATION_KEY_PATH, ensureJsonTreeString(key), {
    encoding: 'utf8',
    mode: 0o600
  })
}
