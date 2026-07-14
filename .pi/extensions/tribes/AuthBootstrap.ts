import { execFile, spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { promisify } from 'node:util'

import { ExtensionCommandContext } from '@earendil-works/pi-coding-agent'

import { readDotEnv } from './DotEnv'
import { registerTribesProvider, TribesApi } from './Provider'
import { warmWalletSnapshot } from './WalletSnapshot'

const execFileAsync = promisify(execFile)

// The host mints the agent's real P-256 key at this canonical microVM path (the
// baked tribes-agent-key minter writes it once at VM boot). The harness reads
// the key from <root>/.tribes/agent-authorization-key.json.
const HOST_KEY_PATH = '/var/lib/tribes/agent-authorization-key.json'
const MINT_TIMEOUT_MS = 30_000
const MINT_MAX_BUFFER_BYTES = 1024 * 1024

// Non-production overrides only. In production (NODE_ENV unset/empty/"production")
// src/common/Env.ts hardcodes both API_BASE_URL and PRIVY_APP_ID, so neither is
// needed and API_BASE_URL is never read at all. They matter only when the host
// seeds them on the kernel cmdline as tribes.agent_env (the in-VM bridge injects
// them into pi, so this extension inherits them) to point a non-production build
// at a different backend / Privy app. When present we pass them through to .env;
// when absent the production defaults apply. API_BEARER_TOKEN is minted from the
// agent key below.
const ENV_PASSTHROUGH = ['API_BASE_URL', 'PRIVY_APP_ID', 'MARKETSTACK_API_KEY'] as const

// Re-mint + rewrite .env on this cadence so the bearer token never goes stale.
export const AUTH_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000

const LOGIN_WIDGET_KEY = 'tribes-login'
// Built from a non-literal ESC so the source has no control char (eslint).
const ANSI_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'gu')

function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, '')
}

interface PiSettingsDefaults {
  readonly defaultProvider: string | null
  readonly defaultModel: string | null
}

async function readPiSettingsDefaults(cwd: string): Promise<PiSettingsDefaults> {
  const path = resolve(cwd, '.pi/agent/settings.json')
  try {
    const text = await readFile(path, 'utf8')
    const parsed: PiSettingsDefaults = JSON.parse(text)
    return parsed
  } catch {
    return { defaultProvider: null, defaultModel: null }
  }
}

async function autoSelectTribesModel(
  pi: TribesApi,
  ctx: ExtensionCommandContext
): Promise<string | null> {
  const defaults = await readPiSettingsDefaults(ctx.cwd)

  const preferredModel =
    defaults.defaultProvider === 'tribes-llm-proxy' && defaults.defaultModel
      ? ctx.modelRegistry.find('tribes-llm-proxy', defaults.defaultModel)
      : undefined

  const fallbackModel = ctx.modelRegistry
    .getAll()
    .find((model) => model.provider === 'tribes-llm-proxy')

  const selectedModel = preferredModel ?? fallbackModel
  if (!selectedModel) return null

  const switched = await pi.setModel(selectedModel)
  if (!switched) return null
  return selectedModel.id
}

/**
 * Copy the host-minted agent key into <root>/.tribes. Sync + best-effort so the key
 * is in place before the LLM provider's `!bun … AgentProxyToken.ts` token
 * command can run. A missing host key (local dev / already provisioned) leaves
 * any existing key untouched.
 */
export function installAgentKey(cwd: string): void {
  const keyPath = resolve(cwd, '.tribes/agent-authorization-key.json')
  try {
    mkdirSync(dirname(keyPath), { recursive: true })
    copyFileSync(HOST_KEY_PATH, keyPath)
  } catch {
    // No host key here; rely on whatever already exists at keyPath.
  }
}

/**
 * Whether an agent authorization key is present (i.e. the user is logged in).
 * Extensions load via jiti and cannot use the `@/` alias, so this checks the
 * canonical key path directly, mirroring installAgentKey. A present-but-corrupt
 * key returns true and fails loudly later via the provider/token path.
 */
export function hasAgentKey(cwd: string): boolean {
  return existsSync(resolve(cwd, '.tribes/agent-authorization-key.json'))
}

/**
 * Materialize <root>/.env so every CLI (and the LLM proxy) reads its config
 * straight from .env (bun auto-loads .env from the workspace) with no per-command
 * token prefix. Existing values are preserved; only the keys this harness owns
 * are overridden — passthrough vars from the process env (when present) and a
 * freshly minted API_BEARER_TOKEN. `--force` mints a brand-new token (ignoring
 * .env + cache) so each call genuinely refreshes the key.
 */
export async function writeAuthEnv(cwd: string): Promise<void> {
  const { stdout } = await execFileAsync(
    'bun',
    ['.pi/extensions/tribes/AgentProxyToken.ts', '--force'],
    {
      cwd,
      timeout: MINT_TIMEOUT_MS,
      maxBuffer: MINT_MAX_BUFFER_BYTES
    }
  )

  const env = await readDotEnv(cwd)
  for (const name of ENV_PASSTHROUGH) {
    const value = process.env[name]
    if (value) env.set(name, value)
  }
  env.set('API_BEARER_TOKEN', stdout.trim())

  const body = [...env].map(([key, value]) => `${key}=${value}`).join('\n')
  await writeFile(resolve(cwd, '.env'), `${body}\n`, { mode: 0o600 })
}

/**
 * Drive `tribes-cli login` from inside Pi, then enable the LLM live
 * (write .env + register the provider) with no restart.
 * `tribes-cli login` runs while logged out and writes the agent key on success.
 */
export async function runLogin(
  pi: TribesApi,
  ctx: ExtensionCommandContext,
  startAuthRefreshTimer: (cwd: string) => void
): Promise<void> {
  // Use bash -lc so the same login-shell PATH resolution applies as startup warmups.
  const child = spawn('bash', ['-lc', 'tribes-cli login'], { cwd: ctx.cwd })

  let stdoutBuf = ''
  let stderrBuf = ''

  child.stdout?.on('data', (chunk: Buffer) => {
    stdoutBuf += chunk.toString()
    ctx.ui.setWidget(LOGIN_WIDGET_KEY, [stdoutBuf.replace(/\s+$/u, '')])
  })
  child.stderr?.on('data', (chunk: Buffer) => {
    stderrBuf += chunk.toString()
  })

  const exitCode = await new Promise<number>((resolveExit) => {
    child.on('error', () => resolveExit(1))
    child.on('close', (code) => resolveExit(code ?? 1))
  })

  ctx.ui.setWidget(LOGIN_WIDGET_KEY, undefined)

  if (exitCode !== 0) {
    const detail = stripAnsi(stderrBuf.trim() || stdoutBuf.trim()).slice(-500)
    ctx.ui.notify(`Login failed: ${detail || 'unknown error'}`, 'error')
    return
  }

  try {
    await writeAuthEnv(ctx.cwd)
    await registerTribesProvider(pi)
  } catch (err) {
    let errorMessage = String(err)
    if (err instanceof Error) {
      errorMessage = err.message
    }
    ctx.ui.notify(`Logged in, but enabling the agent failed: ${errorMessage}`, 'error')
    return
  }

  const autoSelectedModelId = await autoSelectTribesModel(pi, ctx)
  if (autoSelectedModelId === null) {
    ctx.ui.notify(
      'Logged in, but no model was auto-selected. Pick a Tribes model in the selector.',
      'warning'
    )
  }

  startAuthRefreshTimer(ctx.cwd)
  try {
    await warmWalletSnapshot(ctx.cwd)
  } catch {
    // Warm-up is best-effort.
  }
  ctx.ui.notify(
    autoSelectedModelId ? `Logged in. Auto-selected model: ${autoSelectedModelId}` : 'Logged in.',
    'info'
  )
}
