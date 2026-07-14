import { Command } from 'commander'

import { BIRDEYE_API_KEY, COIN_GECKO_PRO_API_KEY, NANSEN_API_KEY } from '@/common/Env'
import { writeOutput } from '@/helpers/WriteOutput'
import { AlphaScoutService } from '@/services/AlphaScoutService'
import {
  NewListingsCommandOptionsSchema,
  RecentlyUpdatedCommandOptionsSchema,
  SmartMoneyChainCommandOptionsSchema,
  SmartMoneyGlobalCommandOptionsSchema,
  SmartMoneyHistoricalCommandOptionsSchema,
  SmartMoneyTokensCommandOptionsSchema,
  TokenSearchCommandOptionsSchema,
  TrendingCommandOptionsSchema
} from '@/types/AlphaScoutCli'
import { BirdEyeChainSchema } from '@/types/BirdEye'
import { NansenChainSchema } from '@/types/Nansen'
import { ensureJsonTreeString } from '@/utils/Lang'

const VERSION = '1.0.0'

const BIRDEYE_CHAINS = BirdEyeChainSchema.options.join(', ')
const NANSEN_CHAINS = NansenChainSchema.options.join(', ')

async function emit(payload: unknown, outPath: string | null | undefined): Promise<void> {
  await writeOutput({ output: ensureJsonTreeString(payload), outPath: outPath ?? undefined })
}

export function buildAlphaScoutCommand(): Command {
  const service = new AlphaScoutService({
    birdEyeApiKey: BIRDEYE_API_KEY,
    nansenApiKey: NANSEN_API_KEY,
    coinGeckoApiKey: COIN_GECKO_PRO_API_KEY
  })

  const program = new Command('alpha-scout')
  program.description('Discovery CLI: trending, new listings, smart-money flows').version(VERSION)

  program
    .command('trending')
    .description('Trending tokens on one chain')
    .option('--chain <chain>', `One of: ${BIRDEYE_CHAINS} (default solana)`)
    .option('--sort-type <sortType>', 'desc or asc (default desc)')
    .option('--limit <limit>', 'Max tokens to return (1-50, default 20)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = TrendingCommandOptionsSchema.parse(options)
      const response = await service.getTrending({
        chain: request.chain,
        sortType: request.sortType,
        limit: request.limit
      })
      await emit(response, request.out)
    })

  program
    .command('new-listings')
    .description('Newly listed tokens on one chain')
    .option('--chain <chain>', `One of: ${BIRDEYE_CHAINS} (default solana)`)
    .option('--limit <limit>', 'Max tokens to return (1-50, default 20)')
    .option('--meme-platform', 'Include meme-platform launches')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = NewListingsCommandOptionsSchema.parse(options)
      const response = await service.getNewListings({
        chain: request.chain,
        limit: request.limit,
        memePlatformEnabled: request.memePlatform
      })
      await emit(response, request.out)
    })

  program
    .command('smart-money-tokens')
    .description('Tokens ranked by smart-trader count, net flow, or market cap')
    .option('--interval <interval>', 'Lookback: 1d, 7d, or 30d (default 1d)')
    .option('--trader-style <style>', 'all, risk_averse, risk_balancers, or trenchers')
    .option('--sort-by <field>', 'smart_traders_no, net_flow, or market_cap')
    .option('--sort-type <sortType>', 'desc or asc (default desc)')
    .option('--limit <limit>', 'Max tokens to return (1-20, default 20)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = SmartMoneyTokensCommandOptionsSchema.parse(options)
      const response = await service.getSmartMoneyTokens({
        interval: request.interval,
        traderStyle: request.traderStyle,
        sortBy: request.sortBy,
        sortType: request.sortType,
        limit: request.limit
      })
      await emit(response, request.out)
    })

  program
    .command('search')
    .description('Find tokens or markets by name, symbol, or address on one chain')
    .requiredOption('--query <query>', 'Name, symbol, or contract address')
    .option('--chain <chain>', `One of: ${BIRDEYE_CHAINS} (default solana)`)
    .option('--target <target>', 'token or market (default token)')
    .option('--limit <limit>', 'Max results (1-50, default 20)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = TokenSearchCommandOptionsSchema.parse(options)
      const response = await service.searchTokens({
        query: request.query,
        chain: request.chain,
        target: request.target,
        limit: request.limit
      })
      await emit(response, request.out)
    })

  program
    .command('recently-updated')
    .description('Tokens whose on-chain metadata was just refreshed')
    .option('--network <network>', 'CoinGecko onchain network slug (default eth)')
    .option('--limit <limit>', 'Max tokens to return (1-100, default 20)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = RecentlyUpdatedCommandOptionsSchema.parse(options)
      const response = await service.getRecentlyUpdatedTokens(request.network, request.limit)
      await emit(response, request.out)
    })

  program
    .command('sm-netflow')
    .description('Smart-money net flow per token')
    .requiredOption('--chains <chains>', `Comma-separated. One of: ${NANSEN_CHAINS}`)
    .option('--limit <limit>', 'Rows per page (1-1000, default 20)')
    .option('--page <page>', 'Page number (default 1)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = SmartMoneyChainCommandOptionsSchema.parse(options)
      const response = await service.getSmartMoneyNetflow(request)
      await emit(response, request.out)
    })

  program
    .command('sm-holdings')
    .description('What smart money currently holds')
    .requiredOption('--chains <chains>', `Comma-separated. One of: ${NANSEN_CHAINS}`)
    .option('--limit <limit>', 'Rows per page (1-1000, default 20)')
    .option('--page <page>', 'Page number (default 1)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = SmartMoneyChainCommandOptionsSchema.parse(options)
      const response = await service.getSmartMoneyHoldings(request)
      await emit(response, request.out)
    })

  program
    .command('sm-historical-holdings')
    .description('Smart-money holdings over a date range')
    .requiredOption('--chains <chains>', 'Comma-separated: base, bnb, ethereum, monad, solana')
    .requiredOption('--from <date>', 'Start date (YYYY-MM-DD)')
    .option('--to <date>', 'End date (YYYY-MM-DD)')
    .option('--limit <limit>', 'Rows per page (1-1000, default 20)')
    .option('--page <page>', 'Page number (default 1)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = SmartMoneyHistoricalCommandOptionsSchema.parse(options)
      const response = await service.getSmartMoneyHistoricalHoldings({
        chains: request.chains,
        from: request.from,
        to: request.to,
        limit: request.limit,
        page: request.page
      })
      await emit(response, request.out)
    })

  program
    .command('sm-dex-trades')
    .description('Recent smart-money DEX trades')
    .requiredOption('--chains <chains>', `Comma-separated. One of: ${NANSEN_CHAINS}`)
    .option('--limit <limit>', 'Rows per page (1-1000, default 20)')
    .option('--page <page>', 'Page number (default 1)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = SmartMoneyChainCommandOptionsSchema.parse(options)
      const response = await service.getSmartMoneyDexTrades(request)
      await emit(response, request.out)
    })

  program
    .command('sm-perp-trades')
    .description('Recent smart-money perp trades (venue-wide, not chain-scoped)')
    .option('--limit <limit>', 'Rows per page (1-1000, default 20)')
    .option('--page <page>', 'Page number (default 1)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = SmartMoneyGlobalCommandOptionsSchema.parse(options)
      const response = await service.getSmartMoneyPerpTrades(request)
      await emit(response, request.out)
    })

  program
    .command('sm-dcas')
    .description('Smart-money dollar-cost-averaging positions (venue-wide)')
    .option('--limit <limit>', 'Rows per page (1-1000, default 20)')
    .option('--page <page>', 'Page number (default 1)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = SmartMoneyGlobalCommandOptionsSchema.parse(options)
      const response = await service.getSmartMoneyDcas(request)
      await emit(response, request.out)
    })

  return program
}
