import { Command } from 'commander'

import { COIN_GECKO_PRO_API_KEY } from '@/common/Env'
import { writeOutput } from '@/helpers/WriteOutput'
import { MarketService } from '@/services/MarketService'
import {
  MarketCategoriesCommandOptionsSchema,
  MarketCurrenciesCommandOptionsSchema,
  MarketGlobalCommandOptionsSchema,
  MarketHistoryCommandOptionsSchema,
  MarketMoversCommandOptionsSchema,
  MarketNewCommandOptionsSchema,
  MarketPlatformsCommandOptionsSchema,
  MarketPlatformTokensCommandOptionsSchema,
  MarketPriceCommandOptionsSchema,
  MarketSearchCommandOptionsSchema,
  MarketTopCommandOptionsSchema
} from '@/types/Market'
import { ensureJsonTreeString } from '@/utils/Lang'

const VERSION = '1.0.0'

const DEFAULT_TOP_LIMIT = 50
const DEFAULT_CATEGORIES_LIMIT = 50
const DEFAULT_NEW_LIMIT = 50
const DEFAULT_MOVERS_DURATION = '24h'
const DEFAULT_PLATFORMS_LIMIT = 100
const DEFAULT_PLATFORM_TOKENS_LIMIT = 100

export function buildMarketCommand(): Command {
  const service = new MarketService({ apiKey: COIN_GECKO_PRO_API_KEY })

  const program = new Command('market')
  program
    .description('Market-wide crypto aggregates from CoinGecko Pro (structured JSON)')
    .version(VERSION)

  program
    .command('global')
    .description('Global market cap, 24h volume, BTC/ETH dominance')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = MarketGlobalCommandOptionsSchema.parse(options)
      const snapshot = await service.getGlobal()
      await writeOutput({
        output: ensureJsonTreeString(snapshot),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('defi')
    .description('Global DeFi market cap, 24h volume, DeFi dominance, top coin')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = MarketGlobalCommandOptionsSchema.parse(options)
      const snapshot = await service.getDefi()
      await writeOutput({
        output: ensureJsonTreeString(snapshot),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('history')
    .description('Total market cap and volume time series')
    .requiredOption('--days <days>', 'Window: 1|7|14|30|90|180|365|max')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = MarketHistoryCommandOptionsSchema.parse(options)
      const history = await service.getHistory({ days: request.days })
      await writeOutput({
        output: ensureJsonTreeString(history),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('top')
    .description('Ranked coin table with 1h/24h/7d change')
    .option('--limit <n>', 'Coins to return, 1-250 (default 50)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = MarketTopCommandOptionsSchema.parse(options)
      const coins = await service.getTopCoins({ limit: request.limit ?? DEFAULT_TOP_LIMIT })
      await writeOutput({ output: ensureJsonTreeString(coins), outPath: request.out ?? undefined })
    })

  program
    .command('movers')
    .description('Top gainers and losers vs usd')
    .option('--duration <window>', 'Change window: 1h|24h|7d|14d|30d|60d|1y (default 24h)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = MarketMoversCommandOptionsSchema.parse(options)
      const movers = await service.getMovers({
        duration: request.duration ?? DEFAULT_MOVERS_DURATION
      })
      await writeOutput({ output: ensureJsonTreeString(movers), outPath: request.out ?? undefined })
    })

  program
    .command('categories')
    .description('Category table: market cap, 24h change, volume, top-3 coins')
    .option('--limit <n>', 'Categories to return, 1-250 (default 50)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = MarketCategoriesCommandOptionsSchema.parse(options)
      const categories = await service.getCategories({
        limit: request.limit ?? DEFAULT_CATEGORIES_LIMIT
      })
      await writeOutput({
        output: ensureJsonTreeString(categories),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('new')
    .description('Recently added coins, newest first')
    .option('--limit <n>', 'Coins to return, 1-200 (default 50)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = MarketNewCommandOptionsSchema.parse(options)
      const coins = await service.getNewCoins({ limit: request.limit ?? DEFAULT_NEW_LIMIT })
      await writeOutput({ output: ensureJsonTreeString(coins), outPath: request.out ?? undefined })
    })

  program
    .command('price')
    .description('Quick multi-coin prices, market caps, and 24h change')
    .requiredOption('--ids <ids>', 'Comma-separated CoinGecko ids, e.g. bitcoin,ethereum')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = MarketPriceCommandOptionsSchema.parse(options)
      const ids = request.ids
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id !== '')
      if (ids.length === 0) {
        throw new Error('--ids must list at least one CoinGecko id, e.g. bitcoin,ethereum')
      }
      const prices = await service.getPrices({ ids })
      await writeOutput({ output: ensureJsonTreeString(prices), outPath: request.out ?? undefined })
    })

  program
    .command('search')
    .description('Resolve names/symbols to CoinGecko ids')
    .requiredOption('--query <text>', 'Name or symbol to search for')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = MarketSearchCommandOptionsSchema.parse(options)
      const results = await service.search({ query: request.query })
      await writeOutput({
        output: ensureJsonTreeString(results),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('trending')
    .description('Trending coins by search popularity')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = MarketGlobalCommandOptionsSchema.parse(options)
      const trending = await service.getTrending()
      await writeOutput({
        output: ensureJsonTreeString(trending),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('platforms')
    .description('Asset platforms (blockchains) with ids for token and contract lookups')
    .option('--limit <n>', 'Platforms to return, 1-500 (default 100)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = MarketPlatformsCommandOptionsSchema.parse(options)
      const platforms = await service.getPlatforms({
        limit: request.limit ?? DEFAULT_PLATFORMS_LIMIT
      })
      await writeOutput({
        output: ensureJsonTreeString(platforms),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('platform-tokens')
    .description('Token list for an asset platform: symbol, name, address, decimals')
    .requiredOption('--platform <platform>', 'Asset platform id, e.g. ethereum, polygon-pos')
    .option('--limit <n>', 'Tokens to return, 1-1000 (default 100)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = MarketPlatformTokensCommandOptionsSchema.parse(options)
      const tokens = await service.getPlatformTokens({
        platform: request.platform,
        limit: request.limit ?? DEFAULT_PLATFORM_TOKENS_LIMIT
      })
      await writeOutput({ output: ensureJsonTreeString(tokens), outPath: request.out ?? undefined })
    })

  program
    .command('currencies')
    .description('Quote currencies supported by CoinGecko pricing endpoints')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = MarketCurrenciesCommandOptionsSchema.parse(options)
      const currencies = await service.getSupportedCurrencies()
      await writeOutput({
        output: ensureJsonTreeString(currencies),
        outPath: request.out ?? undefined
      })
    })

  return program
}
