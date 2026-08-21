import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { resolveTradesStateDir } from '@/common/Env'
import { type AgentAuthorizationKey, AgentAuthorizationKeySchema } from '@/types/JwtAuth'
import { ensureJsonTreeString } from '@/utils/Lang'

// The agent authorization signing key must resolve to the canonical state dir
// regardless of cwd (same class as the BTC gate stateDir anchor): a cwd-relative
// default made the CLI look in {cwd}/.tribes from a foreign cwd and find nothing
// -> 'Authorization key missing' despite the key existing in /root/workspace/.tribes.
function agentAuthorizationKeyPath(): string {
  return join(resolveTradesStateDir(), 'agent-authorization-key.json')
}

function isFileNotFoundError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

export async function readAgentAuthorizationKey(): Promise<AgentAuthorizationKey | null> {
  const keyPath = agentAuthorizationKeyPath()
  let text: string
  try {
    text = await readFile(keyPath, 'utf8')
  } catch (error) {
    // A missing key file is the expected logged-out state — soft-fail to null so
    // callers can prompt the user to log in. Any other read failure is genuine
    // and stays loud.
    if (isFileNotFoundError(error)) {
      return null
    }
    throw new Error(
      `Unable to read agent authorization key at ${keyPath}: ` +
        `${error instanceof Error ? error.message : String(error)}`
    )
  }

  // A present-but-corrupt key must fail loudly rather than masquerade as logged-out.
  const parsed: unknown = JSON.parse(text)
  return AgentAuthorizationKeySchema.parse(parsed)
}

export async function writeAgentAuthorizationKey(key: AgentAuthorizationKey): Promise<void> {
  const keyPath = agentAuthorizationKeyPath()
  await mkdir(dirname(keyPath), { recursive: true })
  await writeFile(keyPath, ensureJsonTreeString(key), {
    encoding: 'utf8',
    mode: 0o600
  })
}
