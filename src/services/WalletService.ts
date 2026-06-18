import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { API_BASE_URL, API_BEARER_TOKEN } from '@/common/Env'
import type { AgentWalletSnapshot } from '@/types/Privy'
import { AgentWalletSnapshotSchema } from '@/types/Privy'
import { type AssetBalance, AssetBalanceSchema } from '@/types/Wallet'
import type { ListWalletAssetsParams } from '@/types/WalletCli'
import { ensureJsonTreeString, isNullish } from '@/utils/Lang'
import { isSolanaWalletAddress } from '@/utils/Solana'

const WALLET_SNAPSHOT_PATH = '.pi/privy-wallets.json'

interface WalletServiceParams {
  readonly cwd: string
}

export class WalletService {
  private readonly cwd: string

  constructor(params: WalletServiceParams) {
    this.cwd = params.cwd
  }

  async listWallets(): Promise<AgentWalletSnapshot[]> {
    const cachedSnapshot = await this.readWalletSnapshot()
    if (!isNullish(cachedSnapshot) && cachedSnapshot.length > 0) {
      return cachedSnapshot
    }

    const response = await fetch(new URL('/agent/wallets', API_BASE_URL), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${API_BEARER_TOKEN}`
      }
    })
    if (!response.ok) {
      throw new Error(`Agent wallet fetch failed: ${response.status} ${response.statusText}`)
    }
    const data: unknown = await response.json()
    const wallets = AgentWalletSnapshotSchema.array().parse(data)
    if (wallets.length === 0) {
      throw new Error('No agent wallet found')
    }
    await this.writeWalletSnapshot(wallets)
    return wallets
  }

  async listAssets(params: ListWalletAssetsParams): Promise<AssetBalance[]> {
    const { walletAddresses, chainIds } = params
    if (walletAddresses.length === 0) {
      return []
    }
    const searchQuery = new URLSearchParams({
      userAddresses: walletAddresses.join(',')
    })
    const areSolanaOnlyWalletAddresses = walletAddresses.every((walletAddress) =>
      isSolanaWalletAddress(walletAddress)
    )
    if (!isNullish(chainIds) && chainIds.length > 0 && !areSolanaOnlyWalletAddresses) {
      searchQuery.set('chainIds', chainIds.join(','))
    }
    const response = await fetch(new URL(`/user/assets?${searchQuery.toString()}`, API_BASE_URL), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${API_BEARER_TOKEN}`
      }
    })
    if (!response.ok) {
      throw new Error(`User assets fetch failed: ${response.status} ${response.statusText}`)
    }
    const data: unknown = await response.json()
    return AssetBalanceSchema.array().parse(data)
  }

  private async readWalletSnapshot(): Promise<AgentWalletSnapshot[] | null> {
    const path = resolve(this.cwd, WALLET_SNAPSHOT_PATH)
    try {
      const text = await readFile(path, 'utf8')
      const parsed: unknown = JSON.parse(text)
      return AgentWalletSnapshotSchema.array().parse(parsed)
    } catch {
      return null
    }
  }

  private async writeWalletSnapshot(snapshot: AgentWalletSnapshot[]): Promise<void> {
    const path = resolve(this.cwd, WALLET_SNAPSHOT_PATH)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, `${ensureJsonTreeString(snapshot)}\n`, 'utf8')
  }
}
