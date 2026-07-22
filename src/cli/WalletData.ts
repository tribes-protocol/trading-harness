import { Command } from 'commander'

import { NANSEN_API_KEY } from '@/common/Env'
import { writeOutput } from '@/helpers/WriteOutput'
import { NansenService } from '@/services/NansenService'
import { WalletDataCommandOptionsSchema, WalletDataListCommandOptionsSchema } from '@/types/Nansen'
import { ensureJsonTreeString } from '@/utils/Lang'

const VERSION = '1.0.0'

const DEFAULT_CHAIN = 'all'
const DEFAULT_RELATED_CHAIN = 'ethereum'
const DEFAULT_LIMIT = 20

export function buildWalletDataCommand(): Command {
  const service = new NansenService({ apiKey: NANSEN_API_KEY })

  const program = new Command('wallet-data')
  program
    .description('Nansen wallet intelligence: balances, labels, activity, PnL (structured JSON)')
    .version(VERSION)

  program
    .command('balances')
    .description('Current token balances of a wallet, largest USD value first')
    .requiredOption('--wallet <address>', 'Wallet address')
    .option('--chain <chain>', 'Chain, e.g. ethereum|solana|base|all (default all)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = WalletDataCommandOptionsSchema.parse(options)
      const balances = await service.getBalances({
        wallet: request.wallet,
        chain: request.chain ?? DEFAULT_CHAIN
      })
      await writeOutput({
        output: ensureJsonTreeString(balances),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('labels')
    .description('Nansen labels attached to a wallet (fund, smart trader, exchange, ...)')
    .requiredOption('--wallet <address>', 'Wallet address')
    .option('--chain <chain>', 'Chain, e.g. ethereum|solana|base|all (default all)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = WalletDataCommandOptionsSchema.parse(options)
      const labels = await service.getLabels({
        wallet: request.wallet,
        chain: request.chain ?? DEFAULT_CHAIN
      })
      await writeOutput({ output: ensureJsonTreeString(labels), outPath: request.out ?? undefined })
    })

  program
    .command('counterparties')
    .description('Top counterparties of a wallet over the last 30 days by volume')
    .requiredOption('--wallet <address>', 'Wallet address')
    .option('--chain <chain>', 'Chain, e.g. ethereum|solana|base|all (default all)')
    .option('--limit <n>', 'Counterparties to return, 1-100 (default 20)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = WalletDataListCommandOptionsSchema.parse(options)
      const counterparties = await service.getCounterparties({
        wallet: request.wallet,
        chain: request.chain ?? DEFAULT_CHAIN,
        limit: request.limit ?? DEFAULT_LIMIT
      })
      await writeOutput({
        output: ensureJsonTreeString(counterparties),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('transactions')
    .description('Recent transactions of a wallet (last 30 days), newest first')
    .requiredOption('--wallet <address>', 'Wallet address')
    .option('--chain <chain>', 'Chain, e.g. ethereum|solana|base|all (default all)')
    .option('--limit <n>', 'Transactions to return, 1-100 (default 20)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = WalletDataListCommandOptionsSchema.parse(options)
      const transactions = await service.getTransactions({
        wallet: request.wallet,
        chain: request.chain ?? DEFAULT_CHAIN,
        limit: request.limit ?? DEFAULT_LIMIT
      })
      await writeOutput({
        output: ensureJsonTreeString(transactions),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('related')
    .description('Wallets related to an address (funding, first-in, common deployers)')
    .requiredOption('--wallet <address>', 'Wallet address')
    .option('--chain <chain>', 'Chain, e.g. ethereum|solana|base (default ethereum, no all)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = WalletDataCommandOptionsSchema.parse(options)
      const related = await service.getRelatedWallets({
        wallet: request.wallet,
        chain: request.chain ?? DEFAULT_RELATED_CHAIN
      })
      await writeOutput({
        output: ensureJsonTreeString(related),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('pnl')
    .description('Trading PnL summary of a wallet over the last 30 days, with top-5 tokens')
    .requiredOption('--wallet <address>', 'Wallet address')
    .option('--chain <chain>', 'Chain, e.g. ethereum|solana|base|all (default all)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = WalletDataCommandOptionsSchema.parse(options)
      const pnl = await service.getPnlSummary({
        wallet: request.wallet,
        chain: request.chain ?? DEFAULT_CHAIN
      })
      await writeOutput({ output: ensureJsonTreeString(pnl), outPath: request.out ?? undefined })
    })

  return program
}
