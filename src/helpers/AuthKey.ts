import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { type AgentAuthorizationKey, AgentAuthorizationKeySchema } from '@/types/JwtAuth'
import { ensureJsonTreeString } from '@/utils/Lang'

import { writePrivateFileAtomic } from './AtomicPrivateFile'

const AGENT_AUTHORIZATION_KEY_FILE = 'agent-authorization-key.json'

function isWorkspacePath(): boolean {
  const parts = process.cwd().split('/')
  if (parts.length < 4) return false
  const workspace = parts[parts.length - 1]
  const person = parts[parts.length - 2]
  const people = parts[parts.length - 3]
  return (
    workspace === 'workspace' && person !== undefined && person.length > 0 && people === 'people'
  )
}

function deriveOrgRootFromCwd(): string | null {
  if (!isWorkspacePath()) return null
  const parts = process.cwd().split('/')
  return parts.slice(0, -3).join('/')
}

function authorizationKeyOrgRoots(): string[] {
  const roots: string[] = []
  const derived = deriveOrgRootFromCwd()
  if (derived) roots.push(derived)
  const injected = process.env.ORG_LAUNCHER_ORG_DIR?.trim()
  if (injected) {
    const resolved = resolve(injected)
    if (!roots.includes(resolved)) roots.push(resolved)
  }
  return roots
}

export function resolveAuthorizationKeyPath(): string {
  const workspacePath = resolve(process.cwd(), '.tribes', AGENT_AUTHORIZATION_KEY_FILE)
  if (existsSync(workspacePath)) return workspacePath
  for (const root of authorizationKeyOrgRoots()) {
    const candidate = resolve(root, '.tribes', AGENT_AUTHORIZATION_KEY_FILE)
    if (existsSync(candidate)) return candidate
  }
  return workspacePath
}

function isFileNotFoundError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

export async function readAgentAuthorizationKey(): Promise<AgentAuthorizationKey | null> {
  let text: string
  try {
    text = await readFile(resolveAuthorizationKeyPath(), 'utf8')
  } catch (error) {
    // A missing key file is the expected logged-out state — soft-fail to null so
    // callers can prompt the user to log in. Any other read failure is genuine
    // and stays loud.
    if (isFileNotFoundError(error)) {
      return null
    }
    throw new Error(
      `Unable to read agent authorization key at ${resolveAuthorizationKeyPath()}: ` +
        `${error instanceof Error ? error.message : String(error)}`
    )
  }

  // A present-but-corrupt key must fail loudly rather than masquerade as logged-out.
  const parsed: unknown = JSON.parse(text)
  return AgentAuthorizationKeySchema.parse(parsed)
}

export async function writeAgentAuthorizationKey(key: AgentAuthorizationKey): Promise<void> {
  const body = ensureJsonTreeString(key)
  const workspacePath = resolve(process.cwd(), '.tribes', AGENT_AUTHORIZATION_KEY_FILE)
  await writePrivateFileAtomic(workspacePath, body)

  for (const root of authorizationKeyOrgRoots()) {
    await writePrivateFileAtomic(resolve(root, '.tribes', AGENT_AUTHORIZATION_KEY_FILE), body)
  }
}
