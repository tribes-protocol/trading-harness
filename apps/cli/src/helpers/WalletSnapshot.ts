import { unlink } from 'node:fs/promises'
import { resolve } from 'node:path'

// The cached agent wallet snapshot. WalletService.listWallets serves this file as
// a read-through cache (it returns the file whenever non-empty and only re-fetches
// when it is missing/empty), so it must be cleared whenever the account changes —
// otherwise a switched account keeps reading the previous account's wallets.
export const WALLET_SNAPSHOT_PATH = '.tribes/privy-wallets.json'

// Remove the cached snapshot so the next `wallet list` re-fetches for the current
// account. Best-effort: a missing file (nothing cached yet) is a no-op.
export async function clearWalletSnapshot(cwd: string): Promise<void> {
  try {
    await unlink(resolve(cwd, WALLET_SNAPSHOT_PATH))
  } catch {
    // No snapshot on disk — nothing to clear.
  }
}
