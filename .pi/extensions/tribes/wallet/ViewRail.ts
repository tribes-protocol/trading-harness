import type { Theme } from '@earendil-works/pi-coding-agent'
import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui'

import type { StatusPanel } from './PanelState.ts'

function panelLabel(panel: Exclude<StatusPanel, 'hidden'>, activePanel: StatusPanel): string {
  const label = panel === 'wallet' ? 'Wallet' : 'Hyperliquid'
  return panel === activePanel ? `▎${label}` : label
}

export function renderStatusViewRail(
  activePanel: StatusPanel,
  theme: Theme,
  contentWidth: number
): string {
  const wallet =
    activePanel === 'wallet'
      ? theme.fg('accent', theme.bold(panelLabel('wallet', activePanel)))
      : theme.fg('dim', panelLabel('wallet', activePanel))
  const hyperliquid =
    activePanel === 'hyperliquid'
      ? theme.fg('accent', theme.bold(panelLabel('hyperliquid', activePanel)))
      : theme.fg('dim', panelLabel('hyperliquid', activePanel))
  const rail = hyperliquid + theme.fg('dim', '  ·  ') + wallet
  const hint = theme.fg('dim', 'ctrl+alt+w · /tribes:view')
  const gap = contentWidth - visibleWidth(rail) - visibleWidth(hint)
  return gap >= 2
    ? rail + ' '.repeat(gap) + hint
    : truncateToWidth(rail, Math.max(1, contentWidth), '…')
}
