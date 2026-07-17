import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { ensureJsonTreeString } from '../hyperliquid/EnsureJson.ts'

export type StatusPanel = 'wallet' | 'hyperliquid' | 'hidden'

export interface StatusPanelState {
  readonly activePanel: StatusPanel
  readonly lastVisiblePanel: Exclude<StatusPanel, 'hidden'>
}

export const STATUS_PANEL_EVENT = 'tribes:status-view-changed'
export const STATUS_PAGE_EVENT = 'tribes:status-page'
export const STATUS_REFRESH_EVENT = 'tribes:status-refresh'

const PANEL_STATE_PATH = 'runtime/tribes/status-panel.json'
const DEFAULT_STATE: StatusPanelState = {
  activePanel: 'hyperliquid',
  lastVisiblePanel: 'hyperliquid'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function coerceStatusPanel(value: unknown): StatusPanel | null {
  return value === 'wallet' || value === 'hyperliquid' || value === 'hidden' ? value : null
}

export function coerceStatusPanelState(
  value: unknown,
  fallback: StatusPanelState = DEFAULT_STATE
): StatusPanelState {
  if (!isRecord(value)) return fallback
  const activePanel = coerceStatusPanel(value.activePanel)
  const lastVisiblePanel =
    value.lastVisiblePanel === 'wallet' || value.lastVisiblePanel === 'hyperliquid'
      ? value.lastVisiblePanel
      : fallback.lastVisiblePanel
  return {
    activePanel: activePanel ?? fallback.activePanel,
    lastVisiblePanel
  }
}

export function selectStatusPanel(
  state: StatusPanelState,
  requested?: StatusPanel
): StatusPanelState {
  const activePanel =
    requested ??
    (state.activePanel === 'wallet'
      ? 'hyperliquid'
      : state.activePanel === 'hyperliquid'
        ? 'wallet'
        : state.lastVisiblePanel)
  return {
    activePanel,
    lastVisiblePanel: activePanel === 'hidden' ? state.lastVisiblePanel : activePanel
  }
}

export async function readStatusPanelState(
  cwd: string,
  fallbackActivePanel: StatusPanel = DEFAULT_STATE.activePanel
): Promise<StatusPanelState> {
  const fallback: StatusPanelState = {
    activePanel: fallbackActivePanel,
    lastVisiblePanel: fallbackActivePanel === 'wallet' ? 'wallet' : 'hyperliquid'
  }
  try {
    const raw: unknown = JSON.parse(
      await readFile(resolve(cwd, PANEL_STATE_PATH), {
        encoding: 'utf8'
      })
    )
    return coerceStatusPanelState(raw, fallback)
  } catch {
    return fallback
  }
}

export async function writeStatusPanelState(cwd: string, state: StatusPanelState): Promise<void> {
  const path = resolve(cwd, PANEL_STATE_PATH)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${ensureJsonTreeString(state)}\n`, 'utf8')
}
