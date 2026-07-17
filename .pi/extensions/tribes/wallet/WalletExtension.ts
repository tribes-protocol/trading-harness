import type { ExtensionAPI, ExtensionContext, Theme } from '@earendil-works/pi-coding-agent'
import type { TUI } from '@earendil-works/pi-tui'

import {
  coerceStatusPanel,
  coerceStatusPanelState,
  readStatusPanelState,
  selectStatusPanel,
  STATUS_PAGE_EVENT,
  STATUS_PANEL_EVENT,
  type StatusPanelState,
  writeStatusPanelState
} from './PanelState.ts'
import { MAX_WALLET_ROWS, renderWalletStatusWidget } from './Render.ts'
import type { WalletStatus } from './StatusTypes.ts'
import { readCachedWalletStatus, refreshWalletStatus } from './WalletAssets.ts'

const REFRESH_INTERVAL_MS = 60_000
const INIT_POLL_MS = 1_500
const INIT_GRACE_MS = 25_000
const WIDGET_KEY = 'wallet-status'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function registerWalletExtension(pi: ExtensionAPI): void {
  let panelState: StatusPanelState = {
    activePanel: 'hyperliquid',
    lastVisiblePanel: 'hyperliquid'
  }
  let lastStatus: WalletStatus | null = null
  let refreshing = false
  let scrollOffset = 0
  let widgetHandle: TUI | null = null
  let widgetRegistered = false
  let statusTimer: ReturnType<typeof setInterval> | undefined
  let initPollTimer: ReturnType<typeof setTimeout> | undefined
  let sessionContext: ExtensionContext | null = null

  function requestWidgetRender(): void {
    widgetHandle?.requestRender()
  }

  function syncWidget(ctx: ExtensionContext): void {
    if (!ctx.hasUI) return
    if (panelState.activePanel !== 'wallet') {
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
              ? renderWalletStatusWidget(
                  lastStatus,
                  widgetTheme,
                  width,
                  refreshing,
                  scrollOffset,
                  panelState.activePanel
                )
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

  async function setPanelState(ctx: ExtensionContext, next: StatusPanelState): Promise<void> {
    panelState = next
    scrollOffset = 0
    await writeStatusPanelState(ctx.cwd, panelState)
    syncWidget(ctx)
    pi.events.emit(STATUS_PANEL_EVENT, panelState)
    if (panelState.activePanel === 'wallet') await refreshStatus(ctx)
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

  pi.events.on(STATUS_PANEL_EVENT, (value) => {
    const ctx = sessionContext
    if (ctx === null) return
    panelState = coerceStatusPanelState(value, panelState)
    scrollOffset = 0
    syncWidget(ctx)
    if (panelState.activePanel === 'wallet') void refreshStatus(ctx)
  })

  pi.events.on(STATUS_PAGE_EVENT, (value) => {
    if (panelState.activePanel !== 'wallet' || !isRecord(value)) return
    if (value.direction === 1 || value.direction === -1) scrollWallet(value.direction)
  })

  pi.events.on('wallet:changed', () => {
    const ctx = sessionContext
    if (ctx !== null) void refreshStatus(ctx)
  })

  pi.on('session_start', async (_event, ctx) => {
    sessionContext = ctx
    panelState = await readStatusPanelState(ctx.cwd)
    lastStatus = await readCachedWalletStatus(ctx.cwd)
    syncWidget(ctx)
    await refreshStatus(ctx)
    if (lastStatus?.initializing) scheduleInitPoll(ctx, Date.now() + INIT_GRACE_MS)
    statusTimer = setInterval(() => {
      void refreshStatus(ctx)
    }, REFRESH_INTERVAL_MS)
  })

  pi.on('session_shutdown', async () => {
    sessionContext = null
    if (statusTimer) clearInterval(statusTimer)
    statusTimer = undefined
    if (initPollTimer) clearTimeout(initPollTimer)
    initPollTimer = undefined
  })

  pi.registerCommand('tribes:view', {
    description: 'Switch account panel (wallet|hyperliquid|hidden)',
    getArgumentCompletions: (prefix) =>
      ['wallet', 'hyperliquid', 'hidden']
        .filter((panel) => panel.startsWith(prefix.toLowerCase()))
        .map((panel) => ({ value: panel, label: panel })),
    handler: async (args, ctx) => {
      const requestedText = args.trim().toLowerCase()
      const requested = requestedText.length === 0 ? undefined : coerceStatusPanel(requestedText)
      if (requestedText.length > 0 && requested === null) {
        ctx.ui.notify('Choose wallet, hyperliquid, or hidden', 'warning')
        return
      }
      const next =
        requested === null
          ? selectStatusPanel(panelState)
          : selectStatusPanel(panelState, requested)
      await setPanelState(ctx, next)
      ctx.ui.notify(
        next.activePanel === 'hidden'
          ? 'Account panel hidden'
          : `${next.activePanel === 'wallet' ? 'Wallet' : 'Hyperliquid'} panel shown`,
        'info'
      )
    }
  })

  pi.registerShortcut('ctrl+alt+left', {
    description: 'Previous account panel',
    handler: async (ctx) => {
      await setPanelState(ctx, selectStatusPanel(panelState))
    }
  })

  pi.registerShortcut('ctrl+alt+right', {
    description: 'Next account panel',
    handler: async (ctx) => {
      await setPanelState(ctx, selectStatusPanel(panelState))
    }
  })

  pi.registerCommand('wallet:refresh', {
    description: 'Fetch fresh wallet balances',
    handler: async (_args, ctx) => {
      await refreshStatus(ctx)
      ctx.ui.notify('Wallet balances refreshed', 'info')
    }
  })
}
