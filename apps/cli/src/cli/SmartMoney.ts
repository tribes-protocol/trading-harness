import { Command } from 'commander'

import { NANSEN_API_KEY } from '@/common/Env'
import { writeOutput } from '@/helpers/WriteOutput'
import { NansenService } from '@/services/NansenService'
import {
  SmartMoneyAddressLeaderboardCommandOptionsSchema,
  SmartMoneyFlowIntelligenceCommandOptionsSchema,
  SmartMoneyFlowsCommandOptionsSchema,
  SmartMoneyListCommandOptionsSchema,
  SmartMoneyPerpLeaderboardCommandOptionsSchema,
  SmartMoneyPnlLeaderboardCommandOptionsSchema,
  SmartMoneyTokenChainCommandOptionsSchema,
  SmartMoneyTokenListCommandOptionsSchema,
  SmartMoneyTradesCommandOptionsSchema
} from '@/types/Nansen'
import { ensureJsonTreeString } from '@/utils/Lang'

const VERSION = '1.0.0'

const DEFAULT_CHAIN = 'all'
const DEFAULT_TOKEN_LIST_CHAIN = 'ethereum'
const DEFAULT_LIMIT = 20
const DEFAULT_TOKEN_LIST_TIMEFRAME = '24h'
const DEFAULT_FLOW_TIMEFRAME = '1d'
const DEFAULT_FLOWS_WINDOW = '30d'

export function buildSmartMoneyCommand(): Command {
  const service = new NansenService({ apiKey: NANSEN_API_KEY })

  const program = new Command('smart-money')
  program
    .description('Nansen smart-money netflows, holdings, and trades (structured JSON)')
    .version(VERSION)

  program
    .command('netflow')
    .description('Token netflows by smart money, largest 24h inflow first')
    .option('--chain <chain>', 'Chain, e.g. ethereum|solana|base|all (default all)')
    .option('--limit <n>', 'Rows to return, 1-100 (default 20)', (value) => Number(value))
    .option('--token <address>', 'Filter to one token address')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = SmartMoneyListCommandOptionsSchema.parse(options)
      const netflows = await service.getNetflow({
        chain: request.chain ?? DEFAULT_CHAIN,
        limit: request.limit ?? DEFAULT_LIMIT,
        tokenAddress: request.token ?? null
      })
      await writeOutput({
        output: ensureJsonTreeString(netflows),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('holdings')
    .description('Tokens smart money currently holds, largest USD value first')
    .option('--chain <chain>', 'Chain, e.g. ethereum|solana|base|all (default all)')
    .option('--limit <n>', 'Rows to return, 1-100 (default 20)', (value) => Number(value))
    .option('--token <address>', 'Filter to one token address')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = SmartMoneyListCommandOptionsSchema.parse(options)
      const holdings = await service.getHoldings({
        chain: request.chain ?? DEFAULT_CHAIN,
        limit: request.limit ?? DEFAULT_LIMIT,
        tokenAddress: request.token ?? null
      })
      await writeOutput({
        output: ensureJsonTreeString(holdings),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('dex-trades')
    .description('Latest smart-money DEX trades')
    .option('--chain <chain>', 'Chain, e.g. ethereum|solana|base|all (default all)')
    .option('--limit <n>', 'Trades to return, 1-100 (default 20)', (value) => Number(value))
    .option('--token <address>', 'Filter to trades where this token address was bought')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = SmartMoneyListCommandOptionsSchema.parse(options)
      const trades = await service.getDexTrades({
        chain: request.chain ?? DEFAULT_CHAIN,
        limit: request.limit ?? DEFAULT_LIMIT,
        tokenAddress: request.token ?? null
      })
      await writeOutput({ output: ensureJsonTreeString(trades), outPath: request.out ?? undefined })
    })

  program
    .command('perp-trades')
    .description('Latest smart-money Hyperliquid perp trades')
    .option('--limit <n>', 'Trades to return, 1-100 (default 20)', (value) => Number(value))
    .option('--token <symbol>', 'Filter by perp token symbol, e.g. BTC')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = SmartMoneyTradesCommandOptionsSchema.parse(options)
      const trades = await service.getPerpTrades({
        limit: request.limit ?? DEFAULT_LIMIT,
        tokenSymbol: request.token ?? null
      })
      await writeOutput({ output: ensureJsonTreeString(trades), outPath: request.out ?? undefined })
    })

  program
    .command('dcas')
    .description('Latest smart-money DCA orders (Solana), newest first')
    .option('--limit <n>', 'DCAs to return, 1-100 (default 20)', (value) => Number(value))
    .option('--token <symbol>', 'Filter by output (accumulated) token symbol')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = SmartMoneyTradesCommandOptionsSchema.parse(options)
      const dcas = await service.getDcas({
        limit: request.limit ?? DEFAULT_LIMIT,
        outputTokenSymbol: request.token ?? null
      })
      await writeOutput({ output: ensureJsonTreeString(dcas), outPath: request.out ?? undefined })
    })

  program
    .command('token-list')
    .description('Token screener restricted to smart-money activity, highest volume first')
    .option('--chain <chain>', 'Chain, e.g. ethereum|solana|base (default ethereum, no all)')
    .option('--limit <n>', 'Tokens to return, 1-100 (default 20)', (value) => Number(value))
    .option('--timeframe <window>', 'Window: 5m|10m|1h|6h|24h|7d|30d (default 24h)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = SmartMoneyTokenListCommandOptionsSchema.parse(options)
      const tokens = await service.getTokenList({
        chain: request.chain ?? DEFAULT_TOKEN_LIST_CHAIN,
        limit: request.limit ?? DEFAULT_LIMIT,
        timeframe: request.timeframe ?? DEFAULT_TOKEN_LIST_TIMEFRAME
      })
      await writeOutput({ output: ensureJsonTreeString(tokens), outPath: request.out ?? undefined })
    })

  program
    .command('flow-intelligence')
    .description('Per-cohort netflows (smart traders, whales, exchanges) for one token')
    .requiredOption('--token <address>', 'Token address')
    .requiredOption('--chain <chain>', 'Chain, e.g. ethereum|solana|base')
    .option('--timeframe <window>', 'Window: 5m|1h|6h|12h|1d|7d (default 1d)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = SmartMoneyFlowIntelligenceCommandOptionsSchema.parse(options)
      const flows = await service.getFlowIntelligence({
        chain: request.chain,
        tokenAddress: request.token,
        timeframe: request.timeframe ?? DEFAULT_FLOW_TIMEFRAME
      })
      await writeOutput({ output: ensureJsonTreeString(flows), outPath: request.out ?? undefined })
    })

  program
    .command('pnl-leaderboard')
    .description('Top trader PnL leaderboard for one token over the last 30 days')
    .requiredOption('--token <address>', 'Token address')
    .requiredOption('--chain <chain>', 'Chain, e.g. ethereum|solana|base')
    .option('--limit <n>', 'Traders to return, 1-100 (default 20)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = SmartMoneyPnlLeaderboardCommandOptionsSchema.parse(options)
      const leaderboard = await service.getPnlLeaderboard({
        chain: request.chain,
        tokenAddress: request.token,
        limit: request.limit ?? DEFAULT_LIMIT
      })
      await writeOutput({
        output: ensureJsonTreeString(leaderboard),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('screener')
    .description('General token screener across all traders (not smart-money-only)')
    .option('--chain <chain>', 'Chain, e.g. ethereum|solana|base (default ethereum, no all)')
    .option('--limit <n>', 'Tokens to return, 1-100 (default 20)', (value) => Number(value))
    .option('--timeframe <window>', 'Window: 5m|10m|1h|6h|24h|7d|30d (default 24h)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = SmartMoneyTokenListCommandOptionsSchema.parse(options)
      const tokens = await service.getScreener({
        chain: request.chain ?? DEFAULT_TOKEN_LIST_CHAIN,
        limit: request.limit ?? DEFAULT_LIMIT,
        timeframe: request.timeframe ?? DEFAULT_TOKEN_LIST_TIMEFRAME
      })
      await writeOutput({ output: ensureJsonTreeString(tokens), outPath: request.out ?? undefined })
    })

  program
    .command('flows')
    .description('Daily token flow time series (inflows/outflows, DEX vs CEX), newest first')
    .requiredOption('--token <address>', 'Token address')
    .requiredOption('--chain <chain>', 'Chain, e.g. ethereum|solana|base')
    .option('--timeframe <window>', 'Lookback window: 1d|7d|30d (default 30d)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = SmartMoneyFlowsCommandOptionsSchema.parse(options)
      const flows = await service.getFlows({
        chain: request.chain,
        tokenAddress: request.token,
        timeframe: request.timeframe ?? DEFAULT_FLOWS_WINDOW
      })
      await writeOutput({ output: ensureJsonTreeString(flows), outPath: request.out ?? undefined })
    })

  program
    .command('who-bought-sold')
    .description('Top buyers and sellers of a token over the last 30 days by trade volume')
    .requiredOption('--token <address>', 'Token address')
    .requiredOption('--chain <chain>', 'Chain, e.g. ethereum|solana|base')
    .option('--limit <n>', 'Traders to return, 1-100 (default 20)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = SmartMoneyTokenChainCommandOptionsSchema.parse(options)
      const traders = await service.getWhoBoughtSold({
        chain: request.chain,
        tokenAddress: request.token,
        limit: request.limit ?? DEFAULT_LIMIT
      })
      await writeOutput({
        output: ensureJsonTreeString(traders),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('signals')
    .description('Nansen risk and reward indicator scores for one token')
    .requiredOption('--token <address>', 'Token address')
    .requiredOption('--chain <chain>', 'Chain, e.g. ethereum|solana|base')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = SmartMoneyTokenChainCommandOptionsSchema.parse(options)
      const signals = await service.getSignals({
        chain: request.chain,
        tokenAddress: request.token
      })
      await writeOutput({
        output: ensureJsonTreeString(signals),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('transfers')
    .description('Recent transfers of a token (last 30 days), newest first')
    .requiredOption('--token <address>', 'Token address')
    .requiredOption('--chain <chain>', 'Chain, e.g. ethereum|solana|base')
    .option('--limit <n>', 'Transfers to return, 1-100 (default 20)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = SmartMoneyTokenChainCommandOptionsSchema.parse(options)
      const transfers = await service.getTransfers({
        chain: request.chain,
        tokenAddress: request.token,
        limit: request.limit ?? DEFAULT_LIMIT
      })
      await writeOutput({
        output: ensureJsonTreeString(transfers),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('historical-holdings')
    .description('Daily smart-money holdings snapshots over the last 30 days, newest first')
    .option('--chain <chain>', 'Chain: ethereum|base|bnb|monad|solana (default ethereum, no all)')
    .option('--limit <n>', 'Rows to return, 1-100 (default 20)', (value) => Number(value))
    .option('--token <address>', 'Filter to one token address')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = SmartMoneyListCommandOptionsSchema.parse(options)
      const holdings = await service.getHistoricalHoldings({
        chain: request.chain ?? DEFAULT_TOKEN_LIST_CHAIN,
        limit: request.limit ?? DEFAULT_LIMIT,
        tokenAddress: request.token ?? null
      })
      await writeOutput({
        output: ensureJsonTreeString(holdings),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('perp-leaderboard')
    .description('Hyperliquid perp trader PnL leaderboard for one token over the last 30 days')
    .requiredOption('--token <symbol>', 'Perp token symbol, e.g. BTC')
    .option('--limit <n>', 'Traders to return, 1-100 (default 20)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = SmartMoneyPerpLeaderboardCommandOptionsSchema.parse(options)
      const leaderboard = await service.getPerpPnlLeaderboard({
        tokenSymbol: request.token,
        limit: request.limit ?? DEFAULT_LIMIT
      })
      await writeOutput({
        output: ensureJsonTreeString(leaderboard),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('address-leaderboard')
    .description('Hyperliquid address leaderboard by total PnL over the last 30 days')
    .option('--limit <n>', 'Addresses to return, 1-100 (default 20)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = SmartMoneyAddressLeaderboardCommandOptionsSchema.parse(options)
      const leaderboard = await service.getAddressLeaderboard({
        limit: request.limit ?? DEFAULT_LIMIT
      })
      await writeOutput({
        output: ensureJsonTreeString(leaderboard),
        outPath: request.out ?? undefined
      })
    })

  return program
}
