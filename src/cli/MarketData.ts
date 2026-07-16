import { Command } from 'commander'

import { COIN_GECKO_PRO_API_KEY } from '@/common/Env'
import { writeOutput } from '@/helpers/WriteOutput'
import { CoinGeckoService } from '@/services/CoinGeckoService'
import {
  CoinGeckoCoinCommandOptionsSchema,
  CoinGeckoGlobalCommandOptionsSchema,
  CoinGeckoOhlcCommandOptionsSchema,
  CoinGeckoPricesCommandOptionsSchema,
  CoinGeckoSearchCommandOptionsSchema,
  CoinGeckoTopCommandOptionsSchema,
  CoinGeckoTrendingCommandOptionsSchema
} from '@/types/CoinGecko'
import { ensureJsonTreeString } from '@/utils/Lang'

const VERSION = '1.0.0'

export function buildMarketDataCommand(): Command {
  const coinGeckoService = new CoinGeckoService({ apiKey: COIN_GECKO_PRO_API_KEY })

  const program = new Command('market-data')
  program.description('Crypto market data CLI (direct CoinGecko Pro)').version(VERSION)

  program
    .command('prices')
    .description('Spot prices with market cap, 24h volume and 24h change for coin ids')
    .requiredOption('--ids <ids>', 'Comma-separated CoinGecko coin ids, e.g. bitcoin,ethereum')
    .option('--vs <currency>', 'Quote currency (default usd)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = CoinGeckoPricesCommandOptionsSchema.parse(options)
      const response = await coinGeckoService.getPrices({ ids: request.ids, vs: request.vs })
      await writeOutput({
        output: ensureJsonTreeString(response),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('top')
    .description('Ranked coin list with market data (CoinGecko coins/markets)')
    .option('--vs <currency>', 'Quote currency (default usd)')
    .option('--limit <count>', 'Coins per page, 1-250 (default 100)')
    .option('--page <page>', 'Page number (default 1)')
    .option('--category <category>', 'Filter by CoinGecko category id, e.g. layer-1')
    .option('--change <windows>', 'Comma-separated change windows to include: 1h,24h,7d')
    .option(
      '--order <order>',
      'Sort order: market_cap_desc|market_cap_asc|volume_desc|volume_asc|id_asc|id_desc'
    )
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = CoinGeckoTopCommandOptionsSchema.parse(options)
      const response = await coinGeckoService.getTop({
        vs: request.vs,
        limit: request.limit,
        page: request.page,
        category: request.category ?? null,
        change: request.change ?? null,
        order: request.order
      })
      await writeOutput({
        output: ensureJsonTreeString(response),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('global')
    .description('Global crypto market aggregates (market cap, volume, BTC/ETH dominance)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = CoinGeckoGlobalCommandOptionsSchema.parse(options)
      const response = await coinGeckoService.getGlobal()
      await writeOutput({
        output: ensureJsonTreeString(response),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('trending')
    .description('Trending coins by search popularity over the last 24h')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = CoinGeckoTrendingCommandOptionsSchema.parse(options)
      const response = await coinGeckoService.getTrending()
      await writeOutput({
        output: ensureJsonTreeString(response),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('coin')
    .description('Compact research profile for one coin (description, links, market data)')
    .requiredOption('--id <id>', 'CoinGecko coin id, e.g. bitcoin')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = CoinGeckoCoinCommandOptionsSchema.parse(options)
      const response = await coinGeckoService.getCoin({ id: request.id })
      await writeOutput({
        output: ensureJsonTreeString(response),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('ohlc')
    .description('OHLC candles for one coin (auto granularity, no volume)')
    .requiredOption('--id <id>', 'CoinGecko coin id, e.g. bitcoin')
    .requiredOption('--days <days>', 'Candle window: 1|7|14|30|90|180|365|max')
    .option('--vs <currency>', 'Quote currency (default usd)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = CoinGeckoOhlcCommandOptionsSchema.parse(options)
      const response = await coinGeckoService.getOhlc({
        id: request.id,
        days: request.days,
        vs: request.vs
      })
      await writeOutput({
        output: ensureJsonTreeString(response),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('search')
    .description('Search coins by name or symbol')
    .requiredOption('--query <query>', 'Search text, e.g. solana')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = CoinGeckoSearchCommandOptionsSchema.parse(options)
      const response = await coinGeckoService.search({ query: request.query })
      await writeOutput({
        output: ensureJsonTreeString(response),
        outPath: request.out ?? undefined
      })
    })

  return program
}
