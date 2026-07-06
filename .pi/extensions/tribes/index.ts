/**
 * The `tribes` extension — everything the harness wires into Pi, in one place:
 *   - installs the host-minted agent key + materializes .env (./AuthBootstrap.ts)
 *   - registers the `tribes-llm-proxy` model provider (./Provider.ts)
 *   - renders the welcome header on startup (./Welcome.ts)
 *   - warms the wallet snapshot on startup (./WalletSnapshot.ts)
 *   - exposes a `/tribes:login` command so a logged-out user can authenticate in-app
 *
 * Sibling modules are imported relatively: Pi loads extensions via jiti, which
 * resolves relative paths but not the harness's `@/` tsconfig alias.
 */

import {
  AUTH_REFRESH_INTERVAL_MS,
  hasAgentKey,
  installAgentKey,
  runLogin,
  writeAuthEnv
} from './AuthBootstrap.ts'
import { registerTribesProvider, type TribesApi } from './Provider.ts'
import { warmWalletSnapshot } from './WalletSnapshot.ts'
import { showWelcome } from './Welcome.ts'

interface StartupNotice {
  readonly message: string
  readonly level: 'info' | 'warning' | 'error'
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export default async function tribes(pi: TribesApi): Promise<void> {
  const cwd = process.cwd()

  // Put the agent key in place before the provider's token command can run.
  installAgentKey(cwd)

  let providerFailed = false

  // Only register the LLM provider when logged in. Logged out, Pi boots with no
  // Tribes models — the user can't switch to or message the LLM until /tribes:login.
  // Genuine failures (corrupt key, network) are retried on session_start after
  // writeAuthEnv persists runtime env into .env.
  let startupNotice: StartupNotice | null = null
  if (hasAgentKey(cwd)) {
    try {
      await registerTribesProvider(pi)
    } catch {
      providerFailed = true
    }
  } else {
    startupNotice = {
      message: 'Log in with /tribes:login to use agentic trading.',
      level: 'warning'
    }
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

    if (providerFailed) {
      try {
        await registerTribesProvider(pi)
        providerFailed = false
      } catch (err) {
        if (ctx.hasUI)
          ctx.ui.notify(`Tribes provider failed to load: ${errorMessage(err)}`, 'error')
      }
    }

    startAuthRefreshTimer(ctx.cwd)
    try {
      await warmWalletSnapshot(ctx.cwd)
    } catch {
      // Warm-up is best-effort.
    }
  })

  pi.on('session_shutdown', async () => {
    if (authRefreshTimer) clearInterval(authRefreshTimer)
    authRefreshTimer = undefined
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

  pi.registerCommand('tribes:builtin-header', {
    description: 'Restore built-in header with keybinding hints',
    handler: async (_args, ctx) => {
      ctx.ui.setHeader(undefined)
      ctx.ui.notify('Built-in header restored', 'info')
    }
  })
}
