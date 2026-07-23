import { Command } from 'commander'

import { BIRDEYE_API_KEY } from '@/common/Env'
import { writeOutput } from '@/helpers/WriteOutput'
import { BirdeyeService } from '@/services/BirdeyeService'
import {
  TokenDataCreationInfoCommandOptionsSchema,
  TokenDataExitLiquidityCommandOptionsSchema,
  TokenDataHoldersCommandOptionsSchema,
  TokenDataMintBurnCommandOptionsSchema,
  TokenDataNewListingsCommandOptionsSchema,
  TokenDataOhlcvCommandOptionsSchema,
  TokenDataOverviewCommandOptionsSchema,
  TokenDataPriceCommandOptionsSchema,
  TokenDataSecurityCommandOptionsSchema,
  TokenDataTradeDataCommandOptionsSchema,
  TokenDataTradeHistoryCommandOptionsSchema,
  TokenDataTradesCommandOptionsSchema,
  TokenDataTransferTotalCommandOptionsSchema,
  TokenDataTrendingCommandOptionsSchema
} from '@/types/Birdeye'
import { ensureJsonTreeString } from '@/utils/Lang'

const VERSION = '1.0.0'

const DEFAULT_CHAIN = 'solana'
const DEFAULT_HOLDERS_LIMIT = 20
const DEFAULT_TRADES_LIMIT = 20
const DEFAULT_TRENDING_LIMIT = 20
const DEFAULT_NEW_LISTINGS_LIMIT = 10
const DEFAULT_MINT_BURN_LIMIT = 20
const DEFAULT_TRADE_HISTORY_TIME_FRAME = '24h'
// The BirdEye exit-liquidity endpoint is Base-only in the legacy client.
const DEFAULT_EXIT_LIQUIDITY_CHAIN = 'base'

export function buildTokenDataCommand(): Command {
  const service = new BirdeyeService({ apiKey: BIRDEYE_API_KEY })

  const program = new Command('token-data')
  program.description('Per-token and wallet data from BirdEye (structured JSON)').version(VERSION)

  program
    .command('price')
    .description('Multi-token prices with 24h change and liquidity')
    .requiredOption('--addresses <addresses>', 'Comma-separated token addresses')
    .option('--chain <chain>', 'BirdEye chain, e.g. solana|ethereum|base (default solana)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = TokenDataPriceCommandOptionsSchema.parse(options)
      const addresses = request.addresses
        .split(',')
        .map((address) => address.trim())
        .filter((address) => address !== '')
      const prices = await service.getPrices({ addresses, chain: request.chain ?? DEFAULT_CHAIN })
      await writeOutput({ output: ensureJsonTreeString(prices), outPath: request.out ?? undefined })
    })

  program
    .command('overview')
    .description('Token overview: price, mcap, liquidity, volume, holders, trades')
    .requiredOption('--address <address>', 'Token address')
    .option('--chain <chain>', 'BirdEye chain, e.g. solana|ethereum|base (default solana)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = TokenDataOverviewCommandOptionsSchema.parse(options)
      const overview = await service.getOverview({
        address: request.address,
        chain: request.chain ?? DEFAULT_CHAIN
      })
      await writeOutput({
        output: ensureJsonTreeString(overview),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('security')
    .description('Token security: top-holder %, owner/creator, mint/freeze flags')
    .requiredOption('--address <address>', 'Token address')
    .option('--chain <chain>', 'BirdEye chain, e.g. solana|ethereum|base (default solana)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = TokenDataSecurityCommandOptionsSchema.parse(options)
      const security = await service.getSecurity({
        address: request.address,
        chain: request.chain ?? DEFAULT_CHAIN
      })
      await writeOutput({
        output: ensureJsonTreeString(security),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('holders')
    .description('Top token holders')
    .requiredOption('--address <address>', 'Token address')
    .option('--limit <n>', 'Holders to return, 1-100 (default 20)', (value) => Number(value))
    .option('--chain <chain>', 'BirdEye chain, e.g. solana|ethereum|base (default solana)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = TokenDataHoldersCommandOptionsSchema.parse(options)
      const holders = await service.getHolders({
        address: request.address,
        limit: request.limit ?? DEFAULT_HOLDERS_LIMIT,
        chain: request.chain ?? DEFAULT_CHAIN
      })
      await writeOutput({
        output: ensureJsonTreeString(holders),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('trades')
    .description('Recent swaps for a token, newest first')
    .requiredOption('--address <address>', 'Token address')
    .option('--limit <n>', 'Trades to return, 1-50 (default 20)', (value) => Number(value))
    .option('--chain <chain>', 'BirdEye chain, e.g. solana|ethereum|base (default solana)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = TokenDataTradesCommandOptionsSchema.parse(options)
      const trades = await service.getTrades({
        address: request.address,
        limit: request.limit ?? DEFAULT_TRADES_LIMIT,
        chain: request.chain ?? DEFAULT_CHAIN
      })
      await writeOutput({ output: ensureJsonTreeString(trades), outPath: request.out ?? undefined })
    })

  program
    .command('trending')
    .description('Trending tokens ranked by BirdEye')
    .option('--limit <n>', 'Tokens to return, 1-20 (default 20)', (value) => Number(value))
    .option('--chain <chain>', 'BirdEye chain, e.g. solana|ethereum|base (default solana)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = TokenDataTrendingCommandOptionsSchema.parse(options)
      const trending = await service.getTrending({
        limit: request.limit ?? DEFAULT_TRENDING_LIMIT,
        chain: request.chain ?? DEFAULT_CHAIN
      })
      await writeOutput({
        output: ensureJsonTreeString(trending),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('new-listings')
    .description('Newly listed tokens with initial liquidity')
    .option('--limit <n>', 'Tokens to return, 1-20 (default 10)', (value) => Number(value))
    .option('--chain <chain>', 'BirdEye chain, e.g. solana|ethereum|base (default solana)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = TokenDataNewListingsCommandOptionsSchema.parse(options)
      const listings = await service.getNewListings({
        limit: request.limit ?? DEFAULT_NEW_LISTINGS_LIMIT,
        chain: request.chain ?? DEFAULT_CHAIN
      })
      await writeOutput({
        output: ensureJsonTreeString(listings),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('ohlcv')
    .description('Token OHLCV candles (t in epoch ms)')
    .requiredOption('--address <address>', 'Token address')
    .requiredOption('--timeframe <timeframe>', 'Candle size: 1m|5m|15m|1H|4H|1D|1W')
    .option('--from <epoch-s>', 'Window start in epoch seconds', (value) => Number(value))
    .option('--to <epoch-s>', 'Window end in epoch seconds (default now)', (value) => Number(value))
    .option('--chain <chain>', 'BirdEye chain, e.g. solana|ethereum|base (default solana)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = TokenDataOhlcvCommandOptionsSchema.parse(options)
      const candles = await service.getOhlcv({
        address: request.address,
        timeframe: request.timeframe,
        from: request.from,
        to: request.to,
        chain: request.chain ?? DEFAULT_CHAIN
      })
      await writeOutput({
        output: ensureJsonTreeString(candles),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('mint-burn')
    .description('Token mint/burn transactions for supply-change analysis, newest first')
    .requiredOption('--address <address>', 'Token address')
    .option('--limit <n>', 'Transactions to return, 1-100 (default 20)', (value) => Number(value))
    .option('--chain <chain>', 'BirdEye chain, e.g. solana|ethereum|base (default solana)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = TokenDataMintBurnCommandOptionsSchema.parse(options)
      const mintBurns = await service.getMintBurns({
        address: request.address,
        limit: request.limit ?? DEFAULT_MINT_BURN_LIMIT,
        chain: request.chain ?? DEFAULT_CHAIN
      })
      await writeOutput({
        output: ensureJsonTreeString(mintBurns),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('creation-info')
    .description('Token creation info: creator, deploy tx, creation time')
    .requiredOption('--address <address>', 'Token address')
    .option('--chain <chain>', 'BirdEye chain, e.g. solana|ethereum|base (default solana)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = TokenDataCreationInfoCommandOptionsSchema.parse(options)
      const creationInfo = await service.getCreationInfo({
        address: request.address,
        chain: request.chain ?? DEFAULT_CHAIN
      })
      await writeOutput({
        output: ensureJsonTreeString(creationInfo),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('exit-liquidity')
    .description('Estimated exit liquidity for multiple tokens')
    .requiredOption('--addresses <addresses>', 'Comma-separated token addresses')
    .option('--chain <chain>', 'BirdEye chain (default base; the endpoint is Base-only)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = TokenDataExitLiquidityCommandOptionsSchema.parse(options)
      const addresses = request.addresses
        .split(',')
        .map((address) => address.trim())
        .filter((address) => address !== '')
      const exitLiquidity = await service.getExitLiquidity({
        addresses,
        chain: request.chain ?? DEFAULT_EXIT_LIQUIDITY_CHAIN
      })
      await writeOutput({
        output: ensureJsonTreeString(exitLiquidity),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('trade-history')
    .description('Windowed trade-activity totals: buys/sells and USD volumes')
    .requiredOption('--address <address>', 'Token address')
    .option(
      '--time-frame <frame>',
      'Window: 1m|5m|30m|1h|2h|4h|8h|24h|3d|7d|14d|30d|90d|180d|1y|alltime (default 24h)'
    )
    .option('--chain <chain>', 'BirdEye chain, e.g. solana|ethereum|base (default solana)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = TokenDataTradeHistoryCommandOptionsSchema.parse(options)
      const tradeHistory = await service.getTradeHistory({
        address: request.address,
        timeFrame: request.timeFrame ?? DEFAULT_TRADE_HISTORY_TIME_FRAME,
        chain: request.chain ?? DEFAULT_CHAIN
      })
      await writeOutput({
        output: ensureJsonTreeString(tradeHistory),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('trade-data')
    .description('Aggregated 24h trade metrics for multiple tokens')
    .requiredOption('--addresses <addresses>', 'Comma-separated token addresses')
    .option('--chain <chain>', 'BirdEye chain, e.g. solana|ethereum|base (default solana)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = TokenDataTradeDataCommandOptionsSchema.parse(options)
      const addresses = request.addresses
        .split(',')
        .map((address) => address.trim())
        .filter((address) => address !== '')
      const tradeStats = await service.getTradeStats({
        addresses,
        chain: request.chain ?? DEFAULT_CHAIN
      })
      await writeOutput({
        output: ensureJsonTreeString(tradeStats),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('transfer-total')
    .description('Aggregate token transfer totals over all history (Solana only)')
    .requiredOption('--address <address>', 'Token address')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = TokenDataTransferTotalCommandOptionsSchema.parse(options)
      const totals = await service.getTokenTransferTotal({
        address: request.address,
        chain: DEFAULT_CHAIN
      })
      await writeOutput({ output: ensureJsonTreeString(totals), outPath: request.out ?? undefined })
    })

  return program
}
