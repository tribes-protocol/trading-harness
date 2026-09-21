import { resolve } from 'node:path'

/**
 * jiti-safe mirror of the harness path anchors in src/common/Env.ts.
 *
 * Pi loads extensions through jiti, which resolves relative paths + node_modules
 * but NOT the harness's `@/*` tsconfig alias — so the extension cannot import the
 * shared resolver. Keep this in sync with `resolveWorkspaceRoot` /
 * `resolveTradesStateDir` in src/common/Env.ts: the extension writes the agent
 * authorization key and `.env` to exactly the paths the CLI reads.
 *
 * Precedence is identical: TRIBES_STATE_DIR / TRIBES_WORKSPACE_ROOT win, else the
 * harness checkout (the extension's cwd). cwd is a reliable anchor because Pi is
 * launched with the checkout as its working directory.
 */
export function resolveWorkspaceRoot(cwd: string): string {
  const explicit = process.env.TRIBES_WORKSPACE_ROOT?.trim()
  if (explicit !== undefined && explicit.length > 0) return resolve(explicit)
  return resolve(cwd)
}

export function resolveTradesStateDir(cwd: string): string {
  const explicit = process.env.TRIBES_STATE_DIR?.trim()
  if (explicit !== undefined && explicit.length > 0) return resolve(explicit)
  return resolve(resolveWorkspaceRoot(cwd), '.tribes')
}

/**
 * Pin TRIBES_WORKSPACE_ROOT for this process (and every child it spawns) so the
 * bun-spawned token minter and the agent's `tribes-cli` calls resolve the same
 * checkout the extension does. Idempotent: an explicit value from the platform
 * always wins.
 */
export function anchorWorkspaceRoot(cwd: string): void {
  const existing = process.env.TRIBES_WORKSPACE_ROOT?.trim()
  if (existing !== undefined && existing.length > 0) return
  process.env.TRIBES_WORKSPACE_ROOT = resolve(cwd)
}
