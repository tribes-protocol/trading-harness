import { Command } from 'commander'

import { SOL_CONNECTION } from '@/common/Web3'
import { writeOutput } from '@/helpers/WriteOutput'
import { WalletService } from '@/services/WalletService'
import {
  EthTransferCommandOptionsSchema,
  ListWalletAssetsCommandOptionsSchema,
  ListWalletsCommandOptionsSchema,
  SolTransferCommandOptionsSchema
} from '@/types/WalletCli'
import { ensureJsonTreeString } from '@/utils/Lang'

const VERSION = '1.0.0'

export function buildWalletCommand(): Command {
  const walletService = new WalletService({ cwd: process.cwd(), solConnection: SOL_CONNECTION })

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

  program
    .command('ethTransfer')
    .description('Generate unsigned EVM transfer txData for native or ERC-20 tokens')
    .requiredOption('--chain-id <chainId>', 'EVM chain id (e.g. 1, 8453, 42161)')
    .requiredOption('--token-id <tokenId>', 'Token contract address or "network" for native asset')
    .requiredOption('--amount <amount>', 'Transfer amount in base units (wei or token raw units)')
    .requiredOption('--to-address <address>', 'Recipient EVM address')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = EthTransferCommandOptionsSchema.parse(options)
      const response = walletService.buildEthTransfer({
        chainId: request.chainId,
        tokenId: request.tokenId,
        amount: request.amount,
        toAddress: request.toAddress
      })
      const output = ensureJsonTreeString(response)
      await writeOutput({
        output,
        outPath: request.out ?? undefined
      })
    })

  program
    .command('solTransfer')
    .description('Generate unsigned Solana transfer instruction for native SOL or SPL tokens')
    .requiredOption('--chain-id <chainId>', 'Must be "solana"')
    .requiredOption(
      '--token-id <tokenId>',
      'SPL mint address or native mint (So11111111111111111111111111111111111111111)'
    )
    .requiredOption(
      '--amount <amount>',
      'Transfer amount in base units (lamports or token raw units)'
    )
    .requiredOption('--to-address <address>', 'Recipient Solana address')
    .requiredOption('--from-address <address>', 'Sender Solana address (fee payer)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = SolTransferCommandOptionsSchema.parse(options)
      const response = await walletService.buildSolTransfer({
        chainId: request.chainId,
        tokenId: request.tokenId,
        amount: request.amount,
        toAddress: request.toAddress,
        fromAddress: request.fromAddress
      })
      const output = ensureJsonTreeString(response)
      await writeOutput({
        output,
        outPath: request.out ?? undefined
      })
    })

  return program
}
