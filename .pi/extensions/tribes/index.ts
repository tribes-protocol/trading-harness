/**
 * The `tribes` extension — everything the harness wires into Pi, in one place:
 *   - installs the host-minted agent key + materializes .env (./AuthBootstrap.ts)
 *   - renders the welcome header on startup (./Welcome.ts)
 *   - warms the wallet snapshot on startup so both status panels (and the CLI)
 *     find an account the moment they need one
 *   - registers the independent wallet + Hyperliquid status extensions
 *     (./wallet, ./hyperliquid); BOTH are OFF by default, each toggled by its
 *     own /wallet:status and /hyperliquid:status (persisted in
 *     runtime/tribes/extension-toggles.json)
 *   - exposes a `/tribes:login` command so a logged-out user can authenticate in-app
 *
 * The LLM needs no wiring here: pi's built-in openrouter provider runs off the
 * boot-env OPENROUTER_API_KEY egress placeholder (swapped for the real key at
 * the MITM hop), and settings.json pins the default model on it.
 *
 * Sibling modules are imported relatively: Pi loads extensions via jiti, which
 * resolves relative paths but not the harness's `@/` tsconfig alias.
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'

import {
  AUTH_REFRESH_INTERVAL_MS,
  hasAgentKey,
  installAgentKey,
  runLogin,
  writeAuthEnv
} from './AuthBootstrap.ts'
import registerHyperliquidExtension from './hyperliquid/index.ts'
import { STATUS_REFRESH_EVENT } from './StatusRefresh.ts'
import { registerWalletExtension } from './wallet/WalletExtension.ts'
import { warmWalletSnapshot } from './WalletSnapshot.ts'
import { showWelcome } from './Welcome.ts'

interface StartupNotice {
  readonly message: string
  readonly level: 'info' | 'warning' | 'error'
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export default async function tribes(pi: ExtensionAPI): Promise<void> {
  const cwd = process.cwd()

  // Put the agent key in place before AgentProxyToken.ts mints the CLI bearer.
  installAgentKey(cwd)

  // Logged out, wallet/trading calls have no bearer — surface the login path.
  const startupNotice: StartupNotice | null = hasAgentKey(cwd)
    ? null
    : {
        message: 'Log in with /tribes:login to use agentic trading.',
        level: 'warning'
      }

  let authRefreshTimer: ReturnType<typeof setInterval> | undefined

  function startAuthRefreshTimer(targetCwd: string): void {
    if (authRefreshTimer) return
    // Refresh the .env bearer token every 24h so it never goes stale.
    authRefreshTimer = setInterval(() => {
      void writeAuthEnv(targetCwd).catch(() => {})
    }, AUTH_REFRESH_INTERVAL_MS)
  }

  pi.on('session_start', async (event, ctx) => {
    if (event.reason !== 'startup') return
    if (ctx.hasUI) showWelcome(ctx)
    if (ctx.hasUI && startupNotice) {
      const notice = startupNotice
      // Pi prints its built-in "No models available" warning immediately AFTER
      // session_start returns (in interactive run()). Defer ours by a macrotask
      // so it lands just below that default warning rather than above it.
      setTimeout(() => ctx.ui.notify(notice.message, notice.level), 0)
    }

    // Logged out: nothing to materialize yet. /tribes:login wires everything up
    // once the user authenticates.
    if (!hasAgentKey(ctx.cwd)) return

    try {
      await writeAuthEnv(ctx.cwd)
    } catch (err) {
      // Surface it — a swallowed failure here means no .env (no API_BEARER_TOKEN),
      // which silently breaks every proxy + wallet call (e.g. hyperliquid shows
      // "Missing account address"). Don't fail startup, but make it visible.
      if (ctx.hasUI)
        ctx.ui.notify(`auth bootstrap failed — .env not written: ${errorMessage(err)}`, 'error')
    }

    startAuthRefreshTimer(ctx.cwd)
    // Warm the wallet snapshot regardless of which panels are on: it is the
    // account cache the wallet panel, the Hyperliquid panel and tribes-cli all
    // read, so gating it on one panel's toggle would leave the other blank.
    try {
      await warmWalletSnapshot(ctx.cwd)
      pi.events.emit('wallet:changed', undefined)
    } catch {
      // Warm-up is best-effort.
    }
  })

  pi.on('session_shutdown', async () => {
    if (authRefreshTimer) clearInterval(authRefreshTimer)
    authRefreshTimer = undefined

    // Let the user know the agent's done without them having to watch the
    // terminal. `tribes-cli notify` isn't reachable here (jiti-loaded
    // extension, no subprocess spawn), so write the same OSC 9 escape
    // directly — the zipbox web terminal parses it into a bell + OS push
    // either way.
    process.stdout.write('\x1b]9;Trading agent session ended\x07')
  })

  pi.registerCommand('tribes:login', {
    description: 'Log in to Tribes to enable the agent',
    handler: async (_args, ctx) => {
      if (hasAgentKey(ctx.cwd)) {
        const again = await ctx.ui.confirm(
          'Already logged in',
          'An account is already linked. Log in again with a different account?'
        )
        if (!again) return
      }
      await runLogin(pi, ctx, startAuthRefreshTimer)
    }
  })

  pi.registerCommand('refresh', {
    description: 'Refresh the account data behind the status panels',
    handler: async (_args, ctx) => {
      // Broadcast only — each status extension refreshes itself if it is on.
      pi.events.emit(STATUS_REFRESH_EVENT, undefined)
      ctx.ui.notify('Account data refresh requested', 'info')
    }
  })

  pi.registerCommand('tribes:builtin-header', {
    description: 'Restore built-in header with keybinding hints',
    handler: async (_args, ctx) => {
      ctx.ui.setHeader(undefined)
      ctx.ui.notify('Built-in header restored', 'info')
    }
  })

  registerHyperliquidExtension(pi)
  registerWalletExtension(pi)
}
