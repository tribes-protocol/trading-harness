/**
 * The `tribes` extension — everything the harness wires into Pi, in one place:
 *   - registers the `tribes-llm-proxy` model provider (./provider.ts)
 *   - renders the welcome header on startup (./welcome.ts)
 *   - warms the wallet snapshot on startup (./wallet-snapshot.ts)
 *
 * Sibling modules are imported relatively: Pi loads extensions via jiti, which
 * resolves relative paths but not the harness's `@/` tsconfig alias.
 */
import { registerTribesProvider, type TribesApi } from './provider.ts'
import { warmWalletSnapshot } from './wallet-snapshot.ts'
import { showWelcome } from './welcome.ts'

export default function tribes(pi: TribesApi): void {
  registerTribesProvider(pi)

  pi.on('session_start', async (event, ctx) => {
    if (event.reason !== 'startup') return
    if (ctx.hasUI) showWelcome(ctx)
    try {
      await warmWalletSnapshot(ctx.cwd)
    } catch {
      // Warm-up is best-effort.
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
