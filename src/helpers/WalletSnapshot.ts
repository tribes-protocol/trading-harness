import { unlink } from 'node:fs/promises'
import { join } from 'node:path'

import { resolveTradesStateDir } from '@/common/Env'

// The cached agent wallet snapshot. WalletService.listWallets serves this file as
// a read-through cache (it returns the file whenever non-empty and only re-fetches
// when it is missing/empty), so it must be cleared whenever the account changes —
// otherwise a switched account keeps reading the previous account's wallets.
// Anchored to the canonical state dir (never cwd) — same class as the auth key:
// a cwd-relative path lets a foreign-cwd process read/write a stray snapshot.
export const WALLET_SNAPSHOT_FILENAME = 'privy-wallets.json'

/** Absolute, anchored path to the wallet snapshot (never cwd-relative). */
export function resolveWalletSnapshotPath(): string {
  return join(resolveTradesStateDir(), WALLET_SNAPSHOT_FILENAME)
}

// Remove the cached snapshot so the next `wallet list` re-fetches for the current
// account. Best-effort: a missing file (nothing cached yet) is a no-op. Anchored
// to the canonical state dir (never cwd).
export async function clearWalletSnapshot(): Promise<void> {
  try {
    await unlink(resolveWalletSnapshotPath())
  } catch {
    // No snapshot on disk — nothing to clear.
  }
}
