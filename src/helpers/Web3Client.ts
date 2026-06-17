import { SAFE_CONFIRMATIONS } from '@shared/common/constants'
import { retry, sleep } from '@shared/helpers/AsyncControl'
import { EvmRegistry } from '@shared/helpers/EvmRegistry'
import {
  ChainId,
  EvmChainId,
  EvmChainIdSchema,
  SolanaChainId,
  SolanaChainIdSchema
} from '@shared/types/ChainId'
import { HexString, HexStringSchema } from '@shared/types/lang'
import { SolSignature, SolSignatureSchema } from '@shared/types/solana'
import { TxId } from '@shared/types/transaction'
import { discernChain } from '@shared/utils/chain'
import { isNullish } from '@shared/utils/lang'
import { logger } from '@shared/utils/Logger'
import { Connection } from '@solana/web3.js'
import { getTransactionReceipt } from 'viem/actions'
import { z } from 'zod'

const SolBlockResponseSchema = z.object({
  blockHeight: z.number()
})

interface TxStatus {
  status: 'pending' | 'success' | 'failed'
  blockNumber?: bigint
}

export class Web3Client {
  private evmRegistry: EvmRegistry
  private solConnection: Connection

  constructor(evmRegistry: EvmRegistry, solConnection: Connection) {
    this.evmRegistry = evmRegistry
    this.solConnection = solConnection
  }

  public async getCrosschainBlockNumber(chainId: ChainId): Promise<bigint> {
    switch (discernChain(chainId)) {
      case 'evm':
        return BigInt(
          await this.evmRegistry.getPublicClient(EvmChainIdSchema.parse(chainId)).getBlockNumber()
        )
      case 'solana':
        return BigInt(await this.solConnection.getBlockHeight())
    }
  }

  public async getTransactionStatus(
    chainId: ChainId,
    hash: TxId,
    opts: { timestamp?: number; checkSafeConfirmations?: boolean } = {}
  ): Promise<TxStatus> {
    const shouldCheckSafeConfirmations = opts.checkSafeConfirmations ?? false

    let status: TxStatus
    switch (discernChain(chainId)) {
      case 'evm':
        status = await this.getEvmTransactionStatus(
          EvmChainIdSchema.parse(chainId),
          HexStringSchema.parse(hash),
          opts
        )
        break
      case 'solana':
        status = await this.getSolanaTransactionStatus(
          SolanaChainIdSchema.parse(chainId),
          SolSignatureSchema.parse(hash),
          opts
        )
        break
    }
    if (status.status === 'failed') {
      return status
    }

    if (shouldCheckSafeConfirmations) {
      const confirmationsRequired = SAFE_CONFIRMATIONS[chainId]
      const currentBlockNumber = await this.getCrosschainBlockNumber(chainId)
      const receiptBlockNumber = status.blockNumber
      if (isNullish(receiptBlockNumber)) {
        return { status: 'pending' }
      }
      if (currentBlockNumber - receiptBlockNumber >= BigInt(confirmationsRequired)) {
        return { status: 'success' }
      }
    }
    return status
  }

  public async getEvmTransactionStatus(
    chainId: EvmChainId,
    hash: HexString,
    opts: { timestamp?: number } = {}
  ): Promise<TxStatus> {
    const client = this.evmRegistry.getPublicClient(chainId)
    const receipt = await getTransactionReceipt(client, { hash })

    if (isNullish(receipt)) {
      if (opts.timestamp && activityIsStale(opts.timestamp)) {
        return { status: 'failed' }
      }
      return { status: 'pending' }
    }

    if (receipt.status === 'success') {
      return { status: 'success', blockNumber: receipt.blockNumber }
    }

    return { status: 'failed', blockNumber: receipt.blockNumber }
  }

  public async getSolanaTransactionStatus(
    _chainId: SolanaChainId,
    hash: SolSignature,
    opts: { timestamp?: number } = {}
  ): Promise<TxStatus> {
    const tx = await this.solConnection.getTransaction(hash, { maxSupportedTransactionVersion: 0 })

    if (isNullish(tx)) {
      if (opts.timestamp && activityIsStale(opts.timestamp)) {
        return { status: 'failed' }
      }
      return { status: 'pending' }
    }

    const blockResponse = await this.solConnection.getBlock(tx.slot, {
      rewards: false,
      transactionDetails: 'none',
      maxSupportedTransactionVersion: 0
    })

    const block = SolBlockResponseSchema.parse(blockResponse)

    if (tx.meta?.err) {
      return { status: 'failed', blockNumber: BigInt(block.blockHeight) }
    }

    return { status: 'success', blockNumber: BigInt(block.blockHeight) }
  }

  public async waitForConfirmations(params: {
    chainId: ChainId
    hash: TxId
    confirmationsRequired: number
  }): Promise<void> {
    const { chainId, hash, confirmationsRequired } = params
    const POLL_INTERVAL_MS = 1000

    while (true) {
      try {
        const status = await retry({
          fn: () => this.getTransactionStatus(chainId, hash),
          maxRetries: 20
        })
        const receiptBlockNumber = status.blockNumber
        if (isNullish(receiptBlockNumber)) {
          continue
        }
        const currentBlockNumber = await this.getCrosschainBlockNumber(chainId)
        if (currentBlockNumber - receiptBlockNumber >= BigInt(confirmationsRequired)) {
          return
        }
      } catch (error) {
        logger.error('Failed to get transaction status', {
          error,
          details: {
            module: 'Web3Client',
            chainId,
            hash
          }
        })
      } finally {
        await sleep(POLL_INTERVAL_MS)
      }
    }
  }
}

// Note: activityIsStale is left as a module-level function as it is stateless/utility.
function activityIsStale(timestamp: number): boolean {
  const twentyFourHoursInMs = 24 * 60 * 60 * 1000
  const ageMs = Date.now() - timestamp
  return ageMs > twentyFourHoursInMs
}
