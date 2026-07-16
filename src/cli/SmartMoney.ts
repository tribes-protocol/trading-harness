import { Command } from 'commander'

import { NANSEN_API_KEY } from '@/common/Env'
import { writeOutput } from '@/helpers/WriteOutput'
import { NansenService } from '@/services/NansenService'
import { SUPPORTED_CHAIN_IDS_TEXT } from '@/types/ChainId'
import {
  SmartMoneyListCommandOptionsSchema,
  SmartMoneyNetflowsCommandOptionsSchema,
  SmartMoneyTokenFlowsCommandOptionsSchema,
  SmartMoneyWalletPnlCommandOptionsSchema
} from '@/types/Nansen'
import { ensureJsonTreeString } from '@/utils/Lang'

const VERSION = '1.0.0'

const CHAINS_FLAG_DESCRIPTION =
  `Comma-separated chain ids (${SUPPORTED_CHAIN_IDS_TEXT}); ` + 'defaults to all supported chains'

// Nansen-backed smart-money CLI group: a fast deterministic complement to the
// alpha-scout and wallet-analyst agents.
export function buildSmartMoneyCommand(): Command {
  const nansenService = new NansenService({ apiKey: NANSEN_API_KEY })

  const program = new Command('smart-money')
  program
    .description('Nansen smart-money flows, holdings, DEX trades and wallet PnL')
    .version(VERSION)

  program
    .command('netflows')
    .description('Tokens smart money is accumulating or distributing, ranked by netflow')
    .option('--chains <chainIds>', CHAINS_FLAG_DESCRIPTION)
    .option('--timeframe <window>', 'Netflow window to rank by: 1h, 24h, 7d, 30d (default 7d)')
    .option('--limit <count>', 'Number of tokens to return (default 25)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = SmartMoneyNetflowsCommandOptionsSchema.parse(options)
      const response = await nansenService.getNetflows({
        chains: request.chains ?? undefined,
        timeframe: request.timeframe,
        limit: request.limit
      })
      await writeOutput({
        output: ensureJsonTreeString(response),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('holdings')
    .description('Aggregate smart-money portfolio holdings per token')
    .option('--chains <chainIds>', CHAINS_FLAG_DESCRIPTION)
    .option('--limit <count>', 'Number of tokens to return (default 25)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = SmartMoneyListCommandOptionsSchema.parse(options)
      const response = await nansenService.getHoldings({
        chains: request.chains ?? undefined,
        limit: request.limit
      })
      await writeOutput({
        output: ensureJsonTreeString(response),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('dex-trades')
    .description('Latest DEX trades by smart-money wallets')
    .option('--chains <chainIds>', CHAINS_FLAG_DESCRIPTION)
    .option('--limit <count>', 'Number of trades to return (default 25)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = SmartMoneyListCommandOptionsSchema.parse(options)
      const response = await nansenService.getDexTrades({
        chains: request.chains ?? undefined,
        limit: request.limit
      })
      await writeOutput({
        output: ensureJsonTreeString(response),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('token-flows')
    .description(
      'Smart-money flow series for one token (hourly rows for windows of 7 days or less, else daily)'
    )
    .requiredOption('--address <tokenAddress>', 'Token contract or mint address')
    .requiredOption('--chain <chainId>', `Chain id (${SUPPORTED_CHAIN_IDS_TEXT})`)
    .option('--days <count>', 'Trailing window in days (default 30)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = SmartMoneyTokenFlowsCommandOptionsSchema.parse(options)
      const response = await nansenService.getTokenFlows({
        tokenAddress: request.address,
        chain: request.chain,
        days: request.days
      })
      await writeOutput({
        output: ensureJsonTreeString(response),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('wallet-pnl')
    .description('Profiler PnL summary for one wallet (realized PnL, win rate, top tokens)')
    .requiredOption('--address <walletAddress>', 'Wallet address to profile')
    .requiredOption('--chain <chainId>', `Chain id (${SUPPORTED_CHAIN_IDS_TEXT})`)
    .option('--days <count>', 'Trailing PnL window in days (default 30)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = SmartMoneyWalletPnlCommandOptionsSchema.parse(options)
      const response = await nansenService.getWalletPnl({
        address: request.address,
        chain: request.chain,
        days: request.days
      })
      await writeOutput({
        output: ensureJsonTreeString(response),
        outPath: request.out ?? undefined
      })
    })

  return program
}
