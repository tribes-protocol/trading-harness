/**
 * The `tribes` extension — everything the harness wires into Pi, in one place:
 *   - installs the host-minted agent key + materializes .env (./AuthBootstrap.ts)
 *   - registers the `tribes-llm-proxy` model provider (./Provider.ts)
 *   - renders the welcome header on startup (./Welcome.ts)
 *   - warms the wallet snapshot on startup (./WalletSnapshot.ts)
 *   - exposes a `/login-tribes` command so a logged-out user can authenticate in-app
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

  // Only register the LLM provider when logged in. Logged out, Pi boots with no
  // Tribes models — the user can't switch to or message the LLM until /login-tribes.
  // Genuine failures (corrupt key, network) surface as an error notice rather
  // than crashing extension load.
  //
  // On failure, providerFailed is set so session_start can retry — by that point
  // the host's /assign may have populated API_BASE_URL/PRIVY_APP_ID in the pty's
  // environment, or the fallback to the production URL + .env (Provider.ts) may
  // now resolve.
  let startupNotice: StartupNotice | null = null
  let providerFailed = false
  if (hasAgentKey(cwd)) {
    try {
      await registerTribesProvider(pi)
    } catch (err) {
      providerFailed = true
      startupNotice = {
        message: `Tribes provider failed to load: ${errorMessage(err)}`,
        level: 'error'
      }
    }
  } else {
    startupNotice = {
      message: 'Log in with /login-tribes to use agentic trading.',
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

    // Logged out: nothing to materialize yet. /login-tribes wires everything up
    // once the user authenticates.
    if (!hasAgentKey(ctx.cwd)) return

    try {
      await writeAuthEnv(ctx.cwd)
      // If initial provider registration failed (missing env vars at extension
      // factory time), retry now — .env is written and process.env may be
      // populated enough to resolve the model list.
      if (providerFailed) {
        try {
          await registerTribesProvider(pi)
          providerFailed = false
          if (ctx.hasUI)
            ctx.ui.notify('Tribes provider loaded successfully', 'info')
        } catch {
          // Still failing — the startup notice was already shown.
        }
      }
    } catch (err) {
      // Surface it — a swallowed failure here means no .env (no API_BEARER_TOKEN),
      // which silently breaks every proxy + wallet call (e.g. hyperliquid shows
      // "Missing account address"). Don't fail startup, but make it visible.
      if (ctx.hasUI)
        ctx.ui.notify(`auth bootstrap failed — .env not written: ${errorMessage(err)}`, 'error')
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

  pi.registerCommand('login-tribes', {
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

  pi.registerCommand('builtin-header', {
    description: 'Restore built-in header with keybinding hints',
    handler: async (_args, ctx) => {
      ctx.ui.setHeader(undefined)
      ctx.ui.notify('Built-in header restored', 'info')
    }
  })
}
