import { Command } from 'commander'

import { ALCHEMY_API_KEY, HELIUS_API_KEY, MORALIS_API_KEY } from '@/common/Env'
import { writeOutput } from '@/helpers/WriteOutput'
import { OnchainService } from '@/services/OnchainService'
import type { EvmChainId } from '@/types/ChainId'
import {
  EvmChainIdSchema,
  SUPPORTED_CHAIN_IDS_TEXT,
  SUPPORTED_EVM_CHAIN_IDS
} from '@/types/ChainId'
import {
  OnchainBalancesCommandOptionsSchema,
  OnchainNetWorthCommandOptionsSchema,
  OnchainTransfersCommandOptionsSchema
} from '@/types/Onchain'
import { compactMap, ensureJsonTreeString, isNullish } from '@/utils/Lang'

const VERSION = '1.0.0'

export function buildOnchainCommand(): Command {
  const onchainService = new OnchainService({
    moralisApiKey: MORALIS_API_KEY,
    alchemyApiKey: ALCHEMY_API_KEY,
    heliusApiKey: HELIUS_API_KEY
  })

  const program = new Command('onchain')
  program.description('Third-party wallet forensics (Moralis, Alchemy, Helius)').version(VERSION)

  program
    .command('balances')
    .description('Token balances (native + fungible) for any wallet, USD-sorted where priced')
    .requiredOption('--address <address>', 'Wallet address (EVM or Solana)')
    .requiredOption('--chain <chainId>', `Chain id: ${SUPPORTED_CHAIN_IDS_TEXT}`)
    .option('--limit <count>', 'Max assets to return (default 50)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = OnchainBalancesCommandOptionsSchema.parse(options)
      const response = await onchainService.getBalances({
        address: request.address,
        chainId: request.chain,
        limit: request.limit
      })
      await writeOutput({
        output: ensureJsonTreeString(response),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('net-worth')
    .description('Total USD net worth of a wallet across EVM chains (Moralis)')
    .requiredOption('--address <address>', 'EVM wallet address')
    .option(
      '--chains <chainIds>',
      'Comma-separated EVM chain ids, e.g. 1,8453 (default: all six supported EVM chains)'
    )
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = OnchainNetWorthCommandOptionsSchema.parse(options)
      const response = await onchainService.getNetWorth({
        address: request.address,
        chainIds: parseNetWorthChainIds(request.chains)
      })
      await writeOutput({
        output: ensureJsonTreeString(response),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('transfers')
    .description('Latest transfers for any wallet, newest first')
    .requiredOption('--address <address>', 'Wallet address (EVM or Solana)')
    .requiredOption('--chain <chainId>', `Chain id: ${SUPPORTED_CHAIN_IDS_TEXT}`)
    .option('--limit <count>', 'Max transfers to return (default 25)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = OnchainTransfersCommandOptionsSchema.parse(options)
      const response = await onchainService.getTransfers({
        address: request.address,
        chainId: request.chain,
        limit: request.limit
      })
      await writeOutput({
        output: ensureJsonTreeString(response),
        outPath: request.out ?? undefined
      })
    })

  return program
}

function parseNetWorthChainIds(chainsText: string | null | undefined): readonly EvmChainId[] {
  if (isNullish(chainsText)) {
    return SUPPORTED_EVM_CHAIN_IDS
  }
  const parts = compactMap(
    chainsText.split(',').map((part) => {
      const trimmed = part.trim()
      return trimmed.length === 0 ? null : trimmed
    })
  )
  if (parts.length === 0) {
    return SUPPORTED_EVM_CHAIN_IDS
  }
  return parts.map((part) => {
    if (part.toLowerCase() === 'solana') {
      throw new Error(
        'onchain net-worth is EVM-only and does not support solana; use `onchain balances --address <addr> --chain solana` for Solana holdings'
      )
    }
    return EvmChainIdSchema.parse(part)
  })
}
