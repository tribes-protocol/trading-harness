import type { ExtensionAPI, ExtensionContext, Theme } from '@earendil-works/pi-coding-agent'
import type { TUI } from '@earendil-works/pi-tui'

import { readExtensionToggles, writeExtensionToggle } from '../ExtensionToggles.ts'
import { STATUS_REFRESH_EVENT } from '../StatusRefresh.ts'
import { MAX_WALLET_ROWS, renderWalletStatusWidget } from './Render.ts'
import type { WalletStatus } from './StatusTypes.ts'
import { readCachedWalletStatus, refreshWalletStatus } from './WalletAssets.ts'

const REFRESH_INTERVAL_MS = 60_000
const INIT_POLL_MS = 1_500
const INIT_GRACE_MS = 25_000
const WIDGET_KEY = 'wallet-status'

export function registerWalletExtension(pi: ExtensionAPI): void {
  let lastStatus: WalletStatus | null = null
  let refreshing = false
  let scrollOffset = 0
  let widgetHandle: TUI | null = null
  let widgetRegistered = false
  let statusTimer: ReturnType<typeof setInterval> | undefined
  let initPollTimer: ReturnType<typeof setTimeout> | undefined
  let sessionContext: ExtensionContext | null = null
  // The extension does NOTHING until this is true (default off; /wallet:status).
  let enabled = false

  function requestWidgetRender(): void {
    widgetHandle?.requestRender()
  }

  function syncWidget(ctx: ExtensionContext): void {
    if (!ctx.hasUI) return
    if (!enabled) {
      ctx.ui.setWidget(WIDGET_KEY, undefined)
      widgetHandle = null
      widgetRegistered = false
      return
    }
    if (widgetRegistered) {
      requestWidgetRender()
      return
    }
    ctx.ui.setWidget(
      WIDGET_KEY,
      (tui: TUI, widgetTheme: Theme) => {
        widgetHandle = tui
        return {
          render: (width: number): string[] =>
            lastStatus
              ? renderWalletStatusWidget(lastStatus, widgetTheme, width, refreshing, scrollOffset)
              : [widgetTheme.fg('dim', 'Wallet (loading…)')],
          invalidate: (): void => {}
        }
      },
      { placement: 'belowEditor' }
    )
    widgetRegistered = true
  }

  async function refreshStatus(ctx: ExtensionContext): Promise<void> {
    if (!ctx.hasUI || refreshing) return
    refreshing = true
    syncWidget(ctx)
    requestWidgetRender()
    try {
      lastStatus = await refreshWalletStatus(ctx.cwd)
    } finally {
      refreshing = false
      requestWidgetRender()
    }
  }

  function scheduleInitPoll(ctx: ExtensionContext, deadlineMs: number): void {
    if (initPollTimer) clearTimeout(initPollTimer)
    initPollTimer = setTimeout(() => {
      void (async () => {
        await refreshStatus(ctx)
        if (!lastStatus?.initializing || Date.now() >= deadlineMs) return
        scheduleInitPoll(ctx, deadlineMs)
      })()
    }, INIT_POLL_MS)
  }

  function scrollWallet(direction: 1 | -1): void {
    const total = lastStatus?.assets.length ?? 0
    if (total <= MAX_WALLET_ROWS) return
    const maxStart = Math.floor((total - 1) / MAX_WALLET_ROWS) * MAX_WALLET_ROWS
    const next = Math.min(maxStart, Math.max(0, scrollOffset + direction * MAX_WALLET_ROWS))
    if (next === scrollOffset) return
    scrollOffset = next
    requestWidgetRender()
  }

  pi.events.on('wallet:changed', () => {
    const ctx = sessionContext
    if (ctx !== null && enabled) void refreshStatus(ctx)
  })

  pi.events.on(STATUS_REFRESH_EVENT, () => {
    const ctx = sessionContext
    if (ctx !== null && enabled) void refreshStatus(ctx)
  })

  async function startWallet(ctx: ExtensionContext): Promise<void> {
    lastStatus = await readCachedWalletStatus(ctx.cwd)
    syncWidget(ctx)
    await refreshStatus(ctx)
    if (lastStatus?.initializing) scheduleInitPoll(ctx, Date.now() + INIT_GRACE_MS)
    statusTimer = setInterval(() => {
      void refreshStatus(ctx)
    }, REFRESH_INTERVAL_MS)
  }

  function stopWallet(ctx: ExtensionContext): void {
    if (statusTimer) clearInterval(statusTimer)
    statusTimer = undefined
    if (initPollTimer) clearTimeout(initPollTimer)
    initPollTimer = undefined
    // A panel that comes back should come back at the top of the list.
    scrollOffset = 0
    if (ctx.hasUI) ctx.ui.setWidget(WIDGET_KEY, undefined)
    widgetHandle = null
    widgetRegistered = false
  }

  pi.on('session_start', async (_event, ctx) => {
    sessionContext = ctx
    // OFF by default: startup enables nothing. /wallet:status starts the pollers
    // and panel; the persisted choice survives restarts.
    enabled = (await readExtensionToggles(ctx.cwd)).wallet
    if (!enabled) return
    await startWallet(ctx)
  })

  pi.on('session_shutdown', async () => {
    sessionContext = null
    if (statusTimer) clearInterval(statusTimer)
    statusTimer = undefined
    if (initPollTimer) clearTimeout(initPollTimer)
    initPollTimer = undefined
  })

  // The one command for this extension: turns the wallet panel (balances, PnL
  // and the pollers behind them) on and off. Off by default, and the choice
  // persists across restarts.
  pi.registerCommand('wallet:status', {
    description: 'Toggle the wallet status panel (off by default; state persists)',
    handler: async (_args, ctx) => {
      enabled = !enabled
      await writeExtensionToggle(ctx.cwd, 'wallet', enabled)
      if (enabled) {
        await startWallet(ctx)
      } else {
        stopWallet(ctx)
      }
      ctx.ui.notify(`Wallet status panel ${enabled ? 'on' : 'off'}`, 'info')
    }
  })

  pi.registerShortcut('ctrl+alt+down', {
    description: 'Wallet widget: page down (show more assets)',
    handler: () => {
      if (enabled) scrollWallet(1)
    }
  })

  pi.registerShortcut('ctrl+alt+up', {
    description: 'Wallet widget: page up (show previous assets)',
    handler: () => {
      if (enabled) scrollWallet(-1)
    }
  })
}
