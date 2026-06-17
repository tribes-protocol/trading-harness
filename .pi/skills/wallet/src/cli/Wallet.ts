#!/usr/bin/env node

import { ensureJsonTreeString } from '@shared/utils/lang'
import { Command } from 'commander'

import { writeCliError, writeOutput } from '@/helpers/WriteOutput'
import { WalletService } from '@/services/WalletService'
import {
  ListWalletAssetsCommandOptionsSchema,
  ListWalletsCommandOptionsSchema
} from '@/types/WalletCli'

const VERSION = '1.0.0'

const program = new Command()
const walletService = new WalletService({
  cwd: process.cwd()
})

program.name('wallet-cli').description('Wallet CLI').version(VERSION)

program
  .command('list')
  .description('List wallets and return parsed wallet snapshot')
  .option('--out <file>', 'Write output JSON to file')
  .action(async (options: unknown): Promise<void> => {
    const request = ListWalletsCommandOptionsSchema.parse(options)
    const response = await walletService.listWallets()
    const output = ensureJsonTreeString(response)
    await writeOutput({
      output,
      outPath: request.out ?? undefined
    })
  })

program
  .command('assets')
  .description('List wallet balances from /user/assets')
  .requiredOption(
    '--wallet-addresses <addresses...>',
    'Wallet addresses (space-separated, EVM and/or Solana)'
  )
  .option(
    '--chain-ids [chainIds...]',
    'Optional EVM chain IDs to query (omit for all supported EVM chains)'
  )
  .option('--out <file>', 'Write output JSON to file')
  .action(async (options: unknown): Promise<void> => {
    const request = ListWalletAssetsCommandOptionsSchema.parse(options)
    const response = await walletService.listAssets({
      walletAddresses: request.walletAddresses,
      chainIds: request.chainIds ?? undefined
    })
    const output = ensureJsonTreeString(response)
    await writeOutput({
      output,
      outPath: request.out ?? undefined
    })
  })

async function main(): Promise<void> {
  await program.parseAsync(process.argv)
}

void main().catch((error: unknown) => {
  if (error instanceof Error) {
    writeCliError(error.message)
  } else {
    writeCliError('Unknown error')
  }
  process.exit(1)
})
