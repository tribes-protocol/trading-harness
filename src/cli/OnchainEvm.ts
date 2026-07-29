import { Command } from 'commander'

import { BLOCKSCOUT_API_KEY } from '@/common/Env'
import { writeOutput } from '@/helpers/WriteOutput'
import { BlockscoutService } from '@/services/BlockscoutService'
import {
  EvmAddressCommandOptionsSchema,
  EvmHoldersCommandOptionsSchema,
  EvmTransactionsCommandOptionsSchema
} from '@/types/Blockscout'
import { ensureJsonTreeString } from '@/utils/Lang'

const VERSION = '1.0.0'

const DEFAULT_LIMIT = 50

export function buildOnchainEvmCommand(): Command {
  const service = new BlockscoutService({ apiKey: BLOCKSCOUT_API_KEY })

  const program = new Command('onchain-evm')
  program
    .description(
      'EVM contract vetting via Blockscout: address identity, contract verification, token metadata, holder concentration, deployer history (structured JSON)'
    )
    .version(VERSION)

  program
    .command('address')
    .description('Address identity: contract or EOA, verified, scam-flagged, creator, proxy type')
    .requiredOption('--chain-id <id>', 'Numeric chain id, e.g. 1 Ethereum, 8453 Base', (value) =>
      Number(value)
    )
    .requiredOption('--address <address>', 'Address or contract hash')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = EvmAddressCommandOptionsSchema.parse(options)
      const address = await service.getAddress({
        chainId: request.chainId,
        address: request.address
      })
      await writeOutput({
        output: ensureJsonTreeString(address),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('contract')
    .description('Verification depth and proxy status for one contract')
    .requiredOption('--chain-id <id>', 'Numeric chain id, e.g. 1 Ethereum, 8453 Base', (value) =>
      Number(value)
    )
    .requiredOption('--address <address>', 'Contract address')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = EvmAddressCommandOptionsSchema.parse(options)
      const contract = await service.getContract({
        chainId: request.chainId,
        address: request.address
      })
      await writeOutput({
        output: ensureJsonTreeString(contract),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('token')
    .description('Token metadata: symbol, decimals, total supply, holder count, reputation')
    .requiredOption('--chain-id <id>', 'Numeric chain id, e.g. 1 Ethereum, 8453 Base', (value) =>
      Number(value)
    )
    .requiredOption('--address <address>', 'Token contract address')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = EvmAddressCommandOptionsSchema.parse(options)
      const token = await service.getToken({
        chainId: request.chainId,
        address: request.address
      })
      await writeOutput({
        output: ensureJsonTreeString(token),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('holders')
    .description('Top token holders by balance — the concentration read')
    .requiredOption('--chain-id <id>', 'Numeric chain id, e.g. 1 Ethereum, 8453 Base', (value) =>
      Number(value)
    )
    .requiredOption('--address <address>', 'Token contract address')
    .option('--limit <n>', `Holders to return, 1-100 (default ${DEFAULT_LIMIT})`, (value) =>
      Number(value)
    )
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = EvmHoldersCommandOptionsSchema.parse(options)
      const holders = await service.getTokenHolders({
        chainId: request.chainId,
        address: request.address,
        limit: request.limit ?? DEFAULT_LIMIT
      })
      await writeOutput({
        output: ensureJsonTreeString(holders),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('transactions')
    .description('Transaction history for an address — the deployer trail')
    .requiredOption('--chain-id <id>', 'Numeric chain id, e.g. 1 Ethereum, 8453 Base', (value) =>
      Number(value)
    )
    .requiredOption('--address <address>', 'Address to inspect')
    .option('--limit <n>', `Transactions to return, 1-100 (default ${DEFAULT_LIMIT})`, (value) =>
      Number(value)
    )
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = EvmTransactionsCommandOptionsSchema.parse(options)
      const transactions = await service.getAddressTransactions({
        chainId: request.chainId,
        address: request.address,
        limit: request.limit ?? DEFAULT_LIMIT
      })
      await writeOutput({
        output: ensureJsonTreeString(transactions),
        outPath: request.out ?? undefined
      })
    })

  return program
}
