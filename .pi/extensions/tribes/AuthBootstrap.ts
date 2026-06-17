import { execFile } from 'node:child_process'
import { copyFileSync, mkdirSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

// The host mints the agent's real P-256 key at this canonical microVM path (the
// baked tribes-agent-key minter writes it once at VM boot). The harness reads
// the key from <root>/.pi/agent-authorization-key.json.
const HOST_KEY_PATH = '/var/lib/tribes/agent-authorization-key.json'
const MINT_TIMEOUT_MS = 30_000
const MINT_MAX_BUFFER_BYTES = 1024 * 1024

// Vars the CLIs need (src/common/env.ts). API_BASE_URL + PRIVY_APP_ID arrive in
// the process env (the host seeds them on the kernel cmdline as
// tribes.agent_env; the in-VM bridge injects them into pi, so this extension
// inherits them). API_BEARER_TOKEN is minted from the agent key below.
const ENV_PASSTHROUGH = ['API_BASE_URL', 'PRIVY_APP_ID'] as const

// Re-mint + rewrite .env on this cadence so the bearer token never goes stale.
export const AUTH_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000

/**
 * Copy the host-minted agent key into <root>/.pi. Sync + best-effort so the key
 * is in place before the LLM provider's `!bun src/cli/LlmToken.ts` token
 * command can run. A missing host key (local dev / already provisioned) leaves
 * any existing key untouched.
 */
export function installAgentKey(cwd: string): void {
  const keyPath = resolve(cwd, '.pi/agent-authorization-key.json')
  try {
    mkdirSync(dirname(keyPath), { recursive: true })
    copyFileSync(HOST_KEY_PATH, keyPath)
  } catch {
    // No host key here; rely on whatever already exists at keyPath.
  }
}

/**
 * Materialize <root>/.env so every CLI (and the LLM proxy) reads its config
 * straight from .env (bun auto-loads .env from the workspace) with no per-command
 * token prefix: the passthrough vars from the process env plus a freshly minted
 * API_BEARER_TOKEN. `--force` mints a brand-new token (ignoring .env + cache) so
 * each call genuinely refreshes the key.
 */
export async function writeAuthEnv(cwd: string): Promise<void> {
  const { stdout } = await execFileAsync('bun', ['src/cli/LlmToken.ts', '--force'], {
    cwd,
    timeout: MINT_TIMEOUT_MS,
    maxBuffer: MINT_MAX_BUFFER_BYTES
  })

  const lines: string[] = []
  for (const name of ENV_PASSTHROUGH) {
    const value = process.env[name]
    if (value) lines.push(`${name}=${value}`)
  }
  lines.push(`API_BEARER_TOKEN=${stdout.trim()}`)

  await writeFile(resolve(cwd, '.env'), `${lines.join('\n')}\n`, { mode: 0o600 })
}
