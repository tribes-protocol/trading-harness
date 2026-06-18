import { Command } from 'commander'

import { writeOutput } from '@/helpers/WriteOutput'
import { WalletService } from '@/services/WalletService'
import {
  ListWalletAssetsCommandOptionsSchema,
  ListWalletsCommandOptionsSchema
} from '@/types/WalletCli'
import { ensureJsonTreeString } from '@/utils/Lang'

const VERSION = '1.0.0'

export function buildWalletCommand(): Command {
  const walletService = new WalletService({ cwd: process.cwd() })

  const program = new Command('wallet')
  program.description('Wallet CLI').version(VERSION)

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

  return program
}
