import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { ensureJsonTreeString } from './hyperliquid/EnsureJson.ts'

/**
 * Per-extension enablement for the two status extensions. BOTH DEFAULT OFF:
 * startup enables neither — the Hyperliquid and Wallet extensions only start
 * their pollers/widgets after an explicit `/hyperliquid:status` or
 * `/wallet:status`, and the choice persists across restarts in runtime/tribes/.
 *
 * The two flags are independent: each extension reads and writes only its own,
 * and neither can see or change the other's panel.
 */

export type TogglableExtension = 'hyperliquid' | 'wallet'

export interface ExtensionToggles {
  readonly hyperliquid: boolean
  readonly wallet: boolean
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
