import { Command } from 'commander'

import { NANSEN_API_KEY } from '@/common/Env'
import { writeOutput } from '@/helpers/WriteOutput'
import { NansenService } from '@/services/NansenService'
import {
  SmartMoneyFlowIntelligenceCommandOptionsSchema,
  SmartMoneyListCommandOptionsSchema,
  SmartMoneyPnlLeaderboardCommandOptionsSchema,
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

  return program
}
