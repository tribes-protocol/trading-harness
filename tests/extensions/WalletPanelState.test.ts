import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

import {
  coerceStatusPanelState,
  readStatusPanelState,
  selectStatusPanel,
  writeStatusPanelState
} from '../../.pi/extensions/tribes/wallet/PanelState.ts'

describe('Wallet and Hyperliquid panel state', () => {
  test('coerces invalid persisted values to a safe fallback', () => {
    expect(
      coerceStatusPanelState({
        activePanel: 'unknown',
        lastVisiblePanel: 'wallet'
      })
    ).toEqual({
      activePanel: 'hyperliquid',
      lastVisiblePanel: 'wallet'
    })
  })

  test('toggles visible panels and restores the last panel from hidden', () => {
    const wallet = selectStatusPanel({
      activePanel: 'hyperliquid',
      lastVisiblePanel: 'hyperliquid'
    })
    const hidden = selectStatusPanel(wallet, 'hidden')

    expect(wallet.activePanel).toBe('wallet')
    expect(hidden).toEqual({ activePanel: 'hidden', lastVisiblePanel: 'wallet' })
    expect(selectStatusPanel(hidden)).toEqual({
      activePanel: 'wallet',
      lastVisiblePanel: 'wallet'
    })
  })

  test('persists shared state and supports legacy hidden fallback', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'wallet-panel-state-'))
    try {
      expect(await readStatusPanelState(cwd, 'hidden')).toEqual({
        activePanel: 'hidden',
        lastVisiblePanel: 'hyperliquid'
      })
      const state = { activePanel: 'wallet', lastVisiblePanel: 'wallet' } as const
      await writeStatusPanelState(cwd, state)
      expect(await readStatusPanelState(cwd)).toEqual(state)
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })
})
