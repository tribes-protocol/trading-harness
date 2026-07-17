import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import {
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync
} from '@solana/spl-token'
import { Connection, PublicKey, SystemProgram, Transaction } from '@solana/web3.js'
import { encodeFunctionData, erc20Abi } from 'viem'

import { API_BASE_URL, API_BEARER_TOKEN } from '@/common/Env'
import { fetchTerminalApi } from '@/helpers/TerminalApiRequest'
import { WALLET_SNAPSHOT_PATH } from '@/helpers/WalletSnapshot'
import type { AgentWalletSnapshot } from '@/types/Privy'
import { AgentWalletSnapshotSchema } from '@/types/Privy'
import { NATIVE_MINT, type SolInstruction, SolInstructionSchema } from '@/types/Solana'
import { type Tx, TxSchema } from '@/types/Tx'
import { type AssetBalanceWithPnl, AssetBalanceWithPnlSchema } from '@/types/Wallet'
import type {
  BuildEthTransferParams,
  BuildSolTransferParams,
  ListWalletAssetsParams
} from '@/types/WalletCli'
import { ensureJsonTreeString, isNullish } from '@/utils/Lang'
import { isSolanaWalletAddress } from '@/utils/Solana'

interface WalletServiceParams {
  readonly cwd: string
  readonly solConnection: Connection
}

export class WalletService {
  private readonly cwd: string
  private readonly solConnection: Connection

  constructor(params: WalletServiceParams) {
    this.cwd = params.cwd
    this.solConnection = params.solConnection
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

  async listAssets(params: ListWalletAssetsParams): Promise<AssetBalanceWithPnl[]> {
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
    const response = await fetchTerminalApi({
      apiBaseUrl: API_BASE_URL,
      path: `/agent/assets?${searchQuery.toString()}`,
      init: {
        method: 'GET',
        headers: {
          Accept: 'application/json'
        }
      },
      apiBearerToken: API_BEARER_TOKEN
    })
    if (!response.ok) {
      throw new Error(`Agent assets fetch failed: ${response.status} ${response.statusText}`)
    }
    const data: unknown = await response.json()
    return AssetBalanceWithPnlSchema.array().parse(data)
  }

  buildEthTransfer(params: BuildEthTransferParams): Tx {
    const { chainId, tokenId, amount, toAddress } = params
    switch (tokenId) {
      case 'network':
        return TxSchema.parse({
          chainId,
          to: toAddress,
          data: '0x',
          value: amount
        })
      default:
        return TxSchema.parse({
          chainId,
          to: tokenId,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: 'transfer',
            args: [toAddress, amount]
          }),
          value: BigInt(0)
        })
    }
  }

  async buildSolTransfer(params: BuildSolTransferParams): Promise<SolInstruction> {
    const { tokenId, amount, toAddress, fromAddress } = params
    const fromPubkey = new PublicKey(fromAddress)
    const toPubkey = new PublicKey(toAddress)
    const transaction = new Transaction()
    const { blockhash } = await this.solConnection.getLatestBlockhash()
    transaction.recentBlockhash = blockhash
    transaction.feePayer = fromPubkey

    switch (tokenId) {
      case NATIVE_MINT:
        if (amount > BigInt(Number.MAX_SAFE_INTEGER)) {
          throw new Error('native SOL transfer amount exceeds Number.MAX_SAFE_INTEGER lamports')
        }
        transaction.add(
          SystemProgram.transfer({
            fromPubkey,
            toPubkey,
            lamports: Number(amount)
          })
        )
        break
      default: {
        const mintPubkey = new PublicKey(tokenId)
        const sourceAta = getAssociatedTokenAddressSync(mintPubkey, fromPubkey)
        const destinationAta = getAssociatedTokenAddressSync(mintPubkey, toPubkey)
        const destinationAccount = await this.solConnection.getAccountInfo(destinationAta)
        if (isNullish(destinationAccount)) {
          transaction.add(
            createAssociatedTokenAccountInstruction(
              fromPubkey,
              destinationAta,
              toPubkey,
              mintPubkey
            )
          )
        }
        transaction.add(createTransferInstruction(sourceAta, destinationAta, fromPubkey, amount))
        break
      }
    }

    const serialized = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false
    })

    return SolInstructionSchema.parse(Buffer.from(serialized).toString('base64'))
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
