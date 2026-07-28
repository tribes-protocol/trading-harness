import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { ensureJsonTreeString } from './hyperliquid/EnsureJson.ts'

/**
 * Per-extension enablement for the two status extensions. BOTH DEFAULT OFF:
 * startup enables neither — the Hyperliquid and Wallet extensions only start
 * their pollers/widgets after an explicit `/hyperliquid on` or `/wallet on`,
 * and the choice persists across restarts in runtime/tribes/.
 */

export type TogglableExtension = 'hyperliquid' | 'wallet'

export interface ExtensionToggles {
  readonly hyperliquid: boolean
  readonly wallet: boolean
}

/** Emitted after a toggle is persisted; payload is {@link ExtensionToggleChange}. */
export const EXTENSION_TOGGLED_EVENT = 'tribes:extension-toggled'

export interface ExtensionToggleChange {
  readonly extension: TogglableExtension
  readonly enabled: boolean
}

const TOGGLES_PATH = 'runtime/tribes/extension-toggles.json'

export const DEFAULT_TOGGLES: ExtensionToggles = {
  hyperliquid: false,
  wallet: false
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function coerceExtensionToggles(
  value: unknown,
  fallback: ExtensionToggles = DEFAULT_TOGGLES
): ExtensionToggles {
  if (!isRecord(value)) return fallback
  return {
    hyperliquid: typeof value.hyperliquid === 'boolean' ? value.hyperliquid : fallback.hyperliquid,
    wallet: typeof value.wallet === 'boolean' ? value.wallet : fallback.wallet
  }
}

export async function readExtensionToggles(cwd: string): Promise<ExtensionToggles> {
  try {
    const raw: unknown = JSON.parse(
      await readFile(resolve(cwd, TOGGLES_PATH), { encoding: 'utf8' })
    )
    return coerceExtensionToggles(raw)
  } catch {
    return DEFAULT_TOGGLES
  }
}

export async function writeExtensionToggle(
  cwd: string,
  extension: TogglableExtension,
  enabled: boolean
): Promise<ExtensionToggles> {
  const next: ExtensionToggles = { ...(await readExtensionToggles(cwd)), [extension]: enabled }
  const path = resolve(cwd, TOGGLES_PATH)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${ensureJsonTreeString(next)}\n`, 'utf8')
  return next
}

/**
 * Parse a toggle command's argument. Only an EXPLICIT `on`/`off` switches the
 * extension; anything else (including no argument) reports state instead of
 * guessing — flipping a poller that spends API calls should never happen by
 * accident.
 */
export function parseToggleArg(args: string): 'on' | 'off' | 'status' | null {
  const text = args.trim().toLowerCase()
  if (text.length === 0 || text === 'status') return 'status'
  if (text === 'on' || text === 'enable') return 'on'
  if (text === 'off' || text === 'disable') return 'off'
  return null
}
