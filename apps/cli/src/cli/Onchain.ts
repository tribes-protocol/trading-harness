import { Command } from 'commander'

import { COIN_GECKO_PRO_API_KEY } from '@/common/Env'
import { writeOutput } from '@/helpers/WriteOutput'
import { OnchainService } from '@/services/OnchainService'
import {
  OnchainCategoriesCommandOptionsSchema,
  OnchainDexesCommandOptionsSchema,
  OnchainMegafilterCommandOptionsSchema,
  OnchainNetworksCommandOptionsSchema,
  OnchainNewPoolsCommandOptionsSchema,
  OnchainPairOhlcvCommandOptionsSchema,
  OnchainPoolCommandOptionsSchema,
  OnchainPoolOhlcvCommandOptionsSchema,
  OnchainPoolsByCategoryCommandOptionsSchema,
  OnchainPoolTradesCommandOptionsSchema,
  OnchainRecentlyUpdatedCommandOptionsSchema,
  OnchainSearchCommandOptionsSchema,
  OnchainTopPoolsCommandOptionsSchema,
  OnchainTrendingPoolsCommandOptionsSchema,
  OnchainTrendingSearchCommandOptionsSchema
} from '@/types/Onchain'
import { ensureJsonTreeString } from '@/utils/Lang'

const VERSION = '1.0.0'

const DEFAULT_NETWORKS_LIMIT = 50
const DEFAULT_DEXES_LIMIT = 50
const DEFAULT_POOLS_LIMIT = 20
const DEFAULT_OHLCV_LIMIT = 100
const DEFAULT_TRADES_LIMIT = 50
const DEFAULT_CATEGORIES_LIMIT = 50
const DEFAULT_TRENDING_SEARCH_LIMIT = 10
const DEFAULT_RECENT_TOKENS_LIMIT = 50

export function buildOnchainCommand(): Command {
  const service = new OnchainService({ apiKey: COIN_GECKO_PRO_API_KEY })

  const program = new Command('onchain')
  program
    .description('Onchain DEX and pool data from CoinGecko Pro / GeckoTerminal (structured JSON)')
    .version(VERSION)

  program
    .command('networks')
    .description('Supported onchain networks')
    .option('--limit <n>', 'Networks to return, 1-100 (default 50)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = OnchainNetworksCommandOptionsSchema.parse(options)
      const networks = await service.getNetworks({
        limit: request.limit ?? DEFAULT_NETWORKS_LIMIT
      })
      await writeOutput({
        output: ensureJsonTreeString(networks),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('dexes')
    .description('DEXes on a network')
    .requiredOption('--network <network>', 'Network id, e.g. eth, solana, base')
    .option('--limit <n>', 'DEXes to return, 1-100 (default 50)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = OnchainDexesCommandOptionsSchema.parse(options)
      const dexes = await service.getDexes({
        network: request.network,
        limit: request.limit ?? DEFAULT_DEXES_LIMIT
      })
      await writeOutput({ output: ensureJsonTreeString(dexes), outPath: request.out ?? undefined })
    })

  program
    .command('trending-pools')
    .description('Trending pools, across all networks or one network')
    .option('--network <network>', 'Network id; omit for all networks')
    .option('--limit <n>', 'Pools to return, 1-20 (default 20)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = OnchainTrendingPoolsCommandOptionsSchema.parse(options)
      const pools = await service.getTrendingPools({
        network: request.network ?? null,
        limit: request.limit ?? DEFAULT_POOLS_LIMIT
      })
      await writeOutput({ output: ensureJsonTreeString(pools), outPath: request.out ?? undefined })
    })

  program
    .command('top-pools')
    .description('Top pools on a network, optionally scoped to one DEX')
    .requiredOption('--network <network>', 'Network id, e.g. eth, solana, base')
    .option('--dex <dex>', 'DEX id, e.g. uniswap_v3')
    .option('--limit <n>', 'Pools to return, 1-20 (default 20)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = OnchainTopPoolsCommandOptionsSchema.parse(options)
      const pools = await service.getTopPools({
        network: request.network,
        dex: request.dex ?? null,
        limit: request.limit ?? DEFAULT_POOLS_LIMIT
      })
      await writeOutput({ output: ensureJsonTreeString(pools), outPath: request.out ?? undefined })
    })

  program
    .command('new-pools')
    .description('Newest pools, across all networks or one network')
    .option('--network <network>', 'Network id; omit for all networks')
    .option('--limit <n>', 'Pools to return, 1-20 (default 20)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = OnchainNewPoolsCommandOptionsSchema.parse(options)
      const pools = await service.getNewPools({
        network: request.network ?? null,
        limit: request.limit ?? DEFAULT_POOLS_LIMIT
      })
      await writeOutput({ output: ensureJsonTreeString(pools), outPath: request.out ?? undefined })
    })

  program
    .command('pool')
    .description('One pool: price, FDV, reserve, volume, price changes, tx counts')
    .requiredOption('--network <network>', 'Network id, e.g. eth, solana, base')
    .requiredOption('--address <address>', 'Pool address')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = OnchainPoolCommandOptionsSchema.parse(options)
      const pool = await service.getPool({
        network: request.network,
        address: request.address
      })
      await writeOutput({ output: ensureJsonTreeString(pool), outPath: request.out ?? undefined })
    })

  program
    .command('pool-ohlcv')
    .description('Pool OHLCV candles (t in epoch ms)')
    .requiredOption('--network <network>', 'Network id, e.g. eth, solana, base')
    .requiredOption('--address <address>', 'Pool address')
    .requiredOption('--timeframe <timeframe>', 'Candle timeframe: minute|hour|day')
    .option('--aggregate <n>', 'Periods per candle, e.g. 5 for 5m or 4 for 4h', (value) =>
      Number(value)
    )
    .option('--limit <n>', 'Candles to return, 1-1000 (default 100)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = OnchainPoolOhlcvCommandOptionsSchema.parse(options)
      const candles = await service.getPoolOhlcv({
        network: request.network,
        address: request.address,
        timeframe: request.timeframe,
        aggregate: request.aggregate ?? null,
        limit: request.limit ?? DEFAULT_OHLCV_LIMIT
      })
      await writeOutput({
        output: ensureJsonTreeString(candles),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('pool-trades')
    .description('Recent trades in a pool')
    .requiredOption('--network <network>', 'Network id, e.g. eth, solana, base')
    .requiredOption('--address <address>', 'Pool address')
    .option('--limit <n>', 'Trades to return, 1-300 (default 50)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = OnchainPoolTradesCommandOptionsSchema.parse(options)
      const trades = await service.getPoolTrades({
        network: request.network,
        address: request.address,
        limit: request.limit ?? DEFAULT_TRADES_LIMIT
      })
      await writeOutput({ output: ensureJsonTreeString(trades), outPath: request.out ?? undefined })
    })

  program
    .command('search')
    .description('Search pools by token name, symbol, or address')
    .requiredOption('--query <text>', 'Search text')
    .option('--network <network>', 'Restrict results to one network')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = OnchainSearchCommandOptionsSchema.parse(options)
      const results = await service.searchPools({
        query: request.query,
        network: request.network ?? null
      })
      await writeOutput({
        output: ensureJsonTreeString(results),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('megafilter')
    .description('Screen pools by FDV, liquidity, and volume floors across networks and DEXes')
    .option('--networks <networks>', 'Comma-separated network ids, e.g. eth,base')
    .option('--dexes <dexes>', 'Comma-separated DEX ids, e.g. uniswap_v3')
    .option('--min-fdv <usd>', 'Minimum fully diluted valuation in USD', (value) => Number(value))
    .option('--min-liquidity <usd>', 'Minimum pool reserve in USD', (value) => Number(value))
    .option('--min-volume <usd>', 'Minimum 24h volume in USD', (value) => Number(value))
    .option('--sort <sort>', 'Sort expression, e.g. h24_volume_usd_desc')
    .option('--limit <n>', 'Pools to return, 1-20 (default 20)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = OnchainMegafilterCommandOptionsSchema.parse(options)
      const pools = await service.getMegafilterPools({
        networks: request.networks ?? null,
        dexes: request.dexes ?? null,
        minFdv: request.minFdv ?? null,
        minLiquidity: request.minLiquidity ?? null,
        minVolume: request.minVolume ?? null,
        sort: request.sort ?? null,
        limit: request.limit ?? DEFAULT_POOLS_LIMIT
      })
      await writeOutput({ output: ensureJsonTreeString(pools), outPath: request.out ?? undefined })
    })

  program
    .command('categories')
    .description('Onchain pool categories with 24h volume, reserve, FDV, and tx counts')
    .option('--limit <n>', 'Categories to return, 1-100 (default 50)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = OnchainCategoriesCommandOptionsSchema.parse(options)
      const categories = await service.getCategories({
        limit: request.limit ?? DEFAULT_CATEGORIES_LIMIT
      })
      await writeOutput({
        output: ensureJsonTreeString(categories),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('pools-by-category')
    .description('Pools in one onchain category (id from `onchain categories`)')
    .requiredOption('--category <category>', 'Category id, e.g. meme, cat-themed')
    .option('--limit <n>', 'Pools to return, 1-20 (default 20)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = OnchainPoolsByCategoryCommandOptionsSchema.parse(options)
      const pools = await service.getPoolsByCategory({
        category: request.category,
        limit: request.limit ?? DEFAULT_POOLS_LIMIT
      })
      await writeOutput({ output: ensureJsonTreeString(pools), outPath: request.out ?? undefined })
    })

  program
    .command('trending-search')
    .description('Most-searched pools on GeckoTerminal right now')
    .option('--limit <n>', 'Pools to return, 1-10 (default 10)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = OnchainTrendingSearchCommandOptionsSchema.parse(options)
      const pools = await service.getTrendingSearchPools({
        limit: request.limit ?? DEFAULT_TRENDING_SEARCH_LIMIT
      })
      await writeOutput({ output: ensureJsonTreeString(pools), outPath: request.out ?? undefined })
    })

  program
    .command('pair-ohlcv')
    .description('Base/quote pair OHLCV candles: base token priced in quote token (t in epoch ms)')
    .requiredOption('--network <network>', 'Network id, e.g. eth, solana, base')
    .requiredOption('--pool <address>', 'Pool address')
    .requiredOption('--base <address>', 'Base token address')
    .requiredOption('--quote <address>', 'Quote token address (denominates candle prices)')
    .requiredOption('--timeframe <timeframe>', 'Candle timeframe: minute|hour|day')
    .option('--aggregate <n>', 'Periods per candle, e.g. 5 for 5m or 4 for 4h', (value) =>
      Number(value)
    )
    .option('--limit <n>', 'Candles to return, 1-1000 (default 100)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = OnchainPairOhlcvCommandOptionsSchema.parse(options)
      const candles = await service.getPairOhlcv({
        network: request.network,
        pool: request.pool,
        base: request.base,
        quote: request.quote,
        timeframe: request.timeframe,
        aggregate: request.aggregate ?? null,
        limit: request.limit ?? DEFAULT_OHLCV_LIMIT
      })
      await writeOutput({
        output: ensureJsonTreeString(candles),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('recently-updated')
    .description('Tokens whose GeckoTerminal metadata was updated most recently')
    .option('--limit <n>', 'Tokens to return, 1-100 (default 50)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = OnchainRecentlyUpdatedCommandOptionsSchema.parse(options)
      const tokens = await service.getRecentlyUpdatedTokens({
        limit: request.limit ?? DEFAULT_RECENT_TOKENS_LIMIT
      })
      await writeOutput({ output: ensureJsonTreeString(tokens), outPath: request.out ?? undefined })
    })

  return program
}
