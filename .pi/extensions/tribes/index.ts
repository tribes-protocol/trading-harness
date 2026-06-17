/**
 * The `tribes` extension — everything the harness wires into Pi, in one place:
 *   - installs the host-minted agent key + materializes .env (./AuthBootstrap.ts)
 *   - registers the `tribes-llm-proxy` model provider (./Provider.ts)
 *   - renders the welcome header on startup (./Welcome.ts)
 *   - warms the wallet snapshot on startup (./WalletSnapshot.ts)
 *
 * Sibling modules are imported relatively: Pi loads extensions via jiti, which
 * resolves relative paths but not the harness's `@/` tsconfig alias.
 */
import { AUTH_REFRESH_INTERVAL_MS, installAgentKey, writeAuthEnv } from './AuthBootstrap.ts'
import { registerTribesProvider, type TribesApi } from './Provider.ts'
import { warmWalletSnapshot } from './WalletSnapshot.ts'
import { showWelcome } from './Welcome.ts'

export default function tribes(pi: TribesApi): void {
  // Put the agent key in place before the provider's token command can run.
  installAgentKey(process.cwd())
  registerTribesProvider(pi)

  let authRefreshTimer: ReturnType<typeof setInterval> | undefined

  pi.on('session_start', async (event, ctx) => {
    if (event.reason !== 'startup') return
    if (ctx.hasUI) showWelcome(ctx)
    try {
      await writeAuthEnv(ctx.cwd)
    } catch {
      // Best-effort; the agent can still mint tokens on demand.
    }
    // Refresh the .env bearer token every 24h so it never goes stale.
    authRefreshTimer = setInterval(() => {
      void writeAuthEnv(ctx.cwd).catch(() => {})
    }, AUTH_REFRESH_INTERVAL_MS)
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

  pi.registerCommand('builtin-header', {
    description: 'Restore built-in header with keybinding hints',
    handler: async (_args, ctx) => {
      ctx.ui.setHeader(undefined)
      ctx.ui.notify('Built-in header restored', 'info')
    }
  })
}
