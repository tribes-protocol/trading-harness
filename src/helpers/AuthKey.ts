import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ensureJsonTreeString } from '@shared/utils/lang'

import { type AgentAuthorizationKey, AgentAuthorizationKeySchema } from '@/types/JwtAuth'

const HARNESS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../')
const AGENT_AUTHORIZATION_KEY_PATH = resolve(HARNESS_ROOT, '.pi/agent-authorization-key.json')

export async function readAgentAuthorizationKey(): Promise<AgentAuthorizationKey> {
  const text = await readFile(AGENT_AUTHORIZATION_KEY_PATH, 'utf8')
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
