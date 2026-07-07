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

import type { ExtensionContext } from '@earendil-works/pi-coding-agent'

import {
  AUTH_REFRESH_INTERVAL_MS,
  hasAgentKey,
  hasAgentKeyFile,
  installAgentKey,
  runLogin,
  syncKeyQuorum,
  writeAuthEnv
} from './AuthBootstrap.ts'
import { registerTribesProvider, type TribesApi } from './Provider.ts'
import { warmWalletSnapshot } from './WalletSnapshot.ts'
import { showWelcome } from './Welcome.ts'

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export default async function tribes(pi: TribesApi): Promise<void> {
  const cwd = process.cwd()

  // Put the agent key in place before the provider's token command can run.
  installAgentKey(cwd)

  // Track whether the LLM provider is live so session_start can register it once
  // the login state resolves (a web-booted sandbox only becomes logged in after
  // the quorum self-heal below).
  let providerRegistered = false

  // Only register the LLM provider when logged in. Logged out, Pi boots with no
  // Tribes models — the user can't switch to or message the LLM until it logs in
  // (via /tribes:login, or the web-boot quorum self-heal on session_start).
  // Genuine failures (network) are retried on session_start after writeAuthEnv
  // persists runtime env into .env.
  if (hasAgentKey(cwd)) {
    try {
      await registerTribesProvider(pi)
      providerRegistered = true
    } catch {
      // Retried on session_start.
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

  // Pi prints its built-in "No models available" warning immediately AFTER
  // session_start returns (in interactive run()). Defer ours by a macrotask so it
  // lands just below that default warning rather than above it.
  function notifyLoginRequired(ctx: ExtensionContext): void {
    if (!ctx.hasUI) return
    setTimeout(
      () => ctx.ui.notify('Log in with /tribes:login to use agentic trading.', 'warning'),
      0
    )
  }

  pi.on('session_start', async (event, ctx) => {
    if (event.reason !== 'startup') return
    if (ctx.hasUI) showWelcome(ctx)

    // Nothing provisioned yet: /tribes:login wires everything up on demand.
    if (!hasAgentKeyFile(ctx.cwd)) {
      notifyLoginRequired(ctx)
      return
    }

    // Materialize .env (mint the bearer token) so every CLI — including the
    // quorum self-heal — can authenticate. A swallowed failure here means no
    // API_BEARER_TOKEN, which silently breaks every proxy + wallet call (e.g.
    // hyperliquid shows "Missing account address"), so surface it without
    // failing startup.
    try {
      await writeAuthEnv(ctx.cwd)
    } catch (err) {
      if (ctx.hasUI)
        ctx.ui.notify(`auth bootstrap failed — .env not written: ${errorMessage(err)}`, 'error')
    }

    // Backfill keyQuorumId for a web-booted sandbox so it reads as logged in. A
    // no-op that leaves the sandbox logged-out for any other origin.
    try {
      await syncKeyQuorum(ctx.cwd)
    } catch {
      // Self-heal is best-effort.
    }

    // Host-minted key with no bound quorum (e.g. a plain sandbox the user cloned
    // the harness into): prompt login and stop — no provider, no polling.
    if (!hasAgentKey(ctx.cwd)) {
      notifyLoginRequired(ctx)
      return
    }

    if (!providerRegistered) {
      try {
        await registerTribesProvider(pi)
        providerRegistered = true
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
