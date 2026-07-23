import { Command } from 'commander'

import { BIRDEYE_API_KEY, NANSEN_API_KEY } from '@/common/Env'
import { writeOutput } from '@/helpers/WriteOutput'
import { BirdeyeService } from '@/services/BirdeyeService'
import { NansenService } from '@/services/NansenService'
import {
  WalletAnalyticsBalanceChangeCommandOptionsSchema,
  WalletAnalyticsNetWorthChartCommandOptionsSchema,
  WalletAnalyticsNetWorthCommandOptionsSchema,
  WalletAnalyticsNetWorthDetailsCommandOptionsSchema,
  WalletAnalyticsTransferTotalCommandOptionsSchema
} from '@/types/Birdeye'
import {
  WalletDataCommandOptionsSchema,
  WalletDataEntitySearchCommandOptionsSchema,
  WalletDataListCommandOptionsSchema
} from '@/types/Nansen'
import { ensureJsonTreeString } from '@/utils/Lang'

const VERSION = '1.0.0'

const DEFAULT_CHAIN = 'all'
const DEFAULT_RELATED_CHAIN = 'ethereum'
const DEFAULT_LIMIT = 20
// The BirdEye wallet analytics endpoints are Solana-only.
const BIRDEYE_CHAIN = 'solana'
const DEFAULT_NET_WORTH_LIMIT = 20
const DEFAULT_NET_WORTH_INTERVAL = '1d'
const DEFAULT_NET_WORTH_CHART_COUNT = 7
const DEFAULT_BALANCE_CHANGE_LIMIT = 20

export function buildWalletDataCommand(): Command {
  const service = new NansenService({ apiKey: NANSEN_API_KEY })
  const birdeyeService = new BirdeyeService({ apiKey: BIRDEYE_API_KEY })

  const program = new Command('wallet-data')
  program
    .description(
      'Wallet intelligence: Nansen balances, labels, activity, PnL plus BirdEye Solana wallet analytics (structured JSON)'
    )
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

  program
    .command('historical-balances')
    .description('Historical token balance snapshots of a wallet (last 30 days), newest first')
    .requiredOption('--wallet <address>', 'Wallet address')
    .option('--chain <chain>', 'Chain, e.g. ethereum|solana|base|all (default all)')
    .option('--limit <n>', 'Rows to return, 1-100 (default 20)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = WalletDataListCommandOptionsSchema.parse(options)
      const balances = await service.getHistoricalBalances({
        wallet: request.wallet,
        chain: request.chain ?? DEFAULT_CHAIN,
        limit: request.limit ?? DEFAULT_LIMIT
      })
      await writeOutput({
        output: ensureJsonTreeString(balances),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('defi-holdings')
    .description('DeFi holdings of a wallet grouped by protocol, with summary totals (all chains)')
    .requiredOption('--wallet <address>', 'Wallet address')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = WalletDataCommandOptionsSchema.parse(options)
      const holdings = await service.getDefiHoldings({ wallet: request.wallet })
      await writeOutput({
        output: ensureJsonTreeString(holdings),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('entity-search')
    .description('Search canonical Nansen entity names (funds, exchanges, protocols)')
    .requiredOption('--query <text>', 'Entity name to search for (min 2 chars)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = WalletDataEntitySearchCommandOptionsSchema.parse(options)
      const entities = await service.getEntitySearch({ query: request.query })
      await writeOutput({
        output: ensureJsonTreeString(entities),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('net-worth')
    .description(
      'Current net worth and holdings of a Solana wallet — BirdEye-backed, Solana only, largest USD value first'
    )
    .requiredOption('--wallet <address>', 'Solana wallet address')
    .option('--limit <n>', 'Holdings to return, 1-100 (default 20)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = WalletAnalyticsNetWorthCommandOptionsSchema.parse(options)
      const netWorth = await birdeyeService.getWalletNetWorth({
        wallet: request.wallet,
        limit: request.limit ?? DEFAULT_NET_WORTH_LIMIT,
        chain: BIRDEYE_CHAIN
      })
      await writeOutput({
        output: ensureJsonTreeString(netWorth),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('net-worth-details')
    .description(
      'Asset-level net-worth composition of a Solana wallet at a timepoint — BirdEye-backed, Solana only'
    )
    .requiredOption('--wallet <address>', 'Solana wallet address')
    .option('--type <interval>', 'Interval unit: 1h|1d (default 1d)')
    .option('--time <timestamp>', 'Base timestamp YYYY-MM-DD HH:MM:SS (default latest snapshot)')
    .option('--limit <n>', 'Asset rows to return, 1-100 (default 20)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = WalletAnalyticsNetWorthDetailsCommandOptionsSchema.parse(options)
      const details = await birdeyeService.getWalletNetWorthDetails({
        wallet: request.wallet,
        interval: request.type ?? DEFAULT_NET_WORTH_INTERVAL,
        time: request.time,
        limit: request.limit ?? DEFAULT_NET_WORTH_LIMIT,
        chain: BIRDEYE_CHAIN
      })
      await writeOutput({
        output: ensureJsonTreeString(details),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('net-worth-chart')
    .description(
      'Historical net-worth points of a Solana wallet across hourly/daily intervals — BirdEye-backed, Solana only'
    )
    .requiredOption('--wallet <address>', 'Solana wallet address')
    .option('--type <interval>', 'Interval unit: 1h|1d (default 1d)')
    .option('--count <n>', 'Intervals to return, 1-30 (default 7)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = WalletAnalyticsNetWorthChartCommandOptionsSchema.parse(options)
      const chart = await birdeyeService.getWalletNetWorthChart({
        wallet: request.wallet,
        interval: request.type ?? DEFAULT_NET_WORTH_INTERVAL,
        count: request.count ?? DEFAULT_NET_WORTH_CHART_COUNT,
        chain: BIRDEYE_CHAIN
      })
      await writeOutput({ output: ensureJsonTreeString(chart), outPath: request.out ?? undefined })
    })

  program
    .command('balance-change')
    .description(
      'Balance delta history (increases/decreases) of a Solana wallet — BirdEye-backed, Solana only'
    )
    .requiredOption('--wallet <address>', 'Solana wallet address')
    .option('--from <epoch-s>', 'Window start in epoch seconds', (value) => Number(value))
    .option('--to <epoch-s>', 'Window end in epoch seconds', (value) => Number(value))
    .option('--limit <n>', 'Rows to return, 1-100 (default 20)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = WalletAnalyticsBalanceChangeCommandOptionsSchema.parse(options)
      const changes = await birdeyeService.getWalletBalanceChanges({
        wallet: request.wallet,
        from: request.from,
        to: request.to,
        limit: request.limit ?? DEFAULT_BALANCE_CHANGE_LIMIT,
        chain: BIRDEYE_CHAIN
      })
      await writeOutput({
        output: ensureJsonTreeString(changes),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('transfer-total')
    .description(
      'Aggregate transfer totals of a Solana wallet without full transfer rows — BirdEye-backed, Solana only'
    )
    .requiredOption('--wallet <address>', 'Solana wallet address')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = WalletAnalyticsTransferTotalCommandOptionsSchema.parse(options)
      const totals = await birdeyeService.getWalletTransferTotal({
        wallet: request.wallet,
        chain: BIRDEYE_CHAIN
      })
      await writeOutput({ output: ensureJsonTreeString(totals), outPath: request.out ?? undefined })
    })

  return program
}
