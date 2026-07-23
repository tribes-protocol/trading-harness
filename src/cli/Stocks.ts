import { Command } from 'commander'

import { API_BASE_URL, API_BEARER_TOKEN, MARKETSTACK_API_KEY, MASSIVE_API_KEY } from '@/common/Env'
import { writeOutput } from '@/helpers/WriteOutput'
import { StocksService } from '@/services/StocksService'
import {
  StocksCandlesCommandOptionsSchema,
  StocksDetailCommandOptionsSchema,
  StocksMarketStatusCommandOptionsSchema,
  StocksMoversCommandOptionsSchema,
  StocksQuoteCommandOptionsSchema,
  StocksSearchCommandOptionsSchema
} from '@/types/Stocks'
import { ensureJsonTreeString } from '@/utils/Lang'

const VERSION = '1.0.0'

const DEFAULT_CANDLES_LIMIT = 100
const DEFAULT_SEARCH_LIMIT = 20
const DEFAULT_MOVERS_LIMIT = 10
const DEFAULT_MOVERS_DIRECTION = 'both'

export function buildStocksCommand(): Command {
  const service = new StocksService({
    apiKey: MARKETSTACK_API_KEY,
    massiveApiKey: MASSIVE_API_KEY,
    apiBaseUrl: API_BASE_URL,
    apiBearerToken: API_BEARER_TOKEN
  })

  const program = new Command('stocks')
  program
    .description(
      'Stock market data from Marketstack, Massive, and the Tribes stocks proxy (structured JSON)'
    )
    .version(VERSION)

  program
    .command('candles')
    .description('Daily OHLCV candles for a stock symbol')
    .requiredOption('--symbol <symbol>', 'Stock ticker, e.g. AAPL')
    .option('--interval <interval>', 'Candle interval, only 1d supported (default 1d)')
    .option('--from <date>', 'Start date YYYY-MM-DD')
    .option('--to <date>', 'End date YYYY-MM-DD')
    .option('--limit <n>', 'Candles to return, 1-1000 (default 100)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = StocksCandlesCommandOptionsSchema.parse(options)
      const candles = await service.getCandles({
        symbol: request.symbol,
        from: request.from,
        to: request.to,
        limit: request.limit ?? DEFAULT_CANDLES_LIMIT
      })
      await writeOutput({
        output: ensureJsonTreeString(candles),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('detail')
    .description('Ticker profile: name, sector, industry, exchange')
    .requiredOption('--symbol <symbol>', 'Stock ticker, e.g. AAPL')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = StocksDetailCommandOptionsSchema.parse(options)
      const detail = await service.getDetail({ symbol: request.symbol })
      await writeOutput({ output: ensureJsonTreeString(detail), outPath: request.out ?? undefined })
    })

  program
    .command('search')
    .description('Resolve company names/symbols to stock tickers')
    .requiredOption('--query <text>', 'Company name or ticker to search for')
    .option('--limit <n>', 'Results to return, 1-100 (default 20)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = StocksSearchCommandOptionsSchema.parse(options)
      const results = await service.search({
        query: request.query,
        limit: request.limit ?? DEFAULT_SEARCH_LIMIT
      })
      await writeOutput({
        output: ensureJsonTreeString(results),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('quote')
    .description('Live snapshot quote: price, day range, change, volume')
    .requiredOption('--symbol <symbol>', 'Stock ticker, e.g. AAPL')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = StocksQuoteCommandOptionsSchema.parse(options)
      const quote = await service.getQuote({ symbol: request.symbol })
      await writeOutput({ output: ensureJsonTreeString(quote), outPath: request.out ?? undefined })
    })

  program
    .command('market-status')
    .description('US stock market state: open/closed plus early- and after-hours flags')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = StocksMarketStatusCommandOptionsSchema.parse(options)
      const status = await service.getMarketStatus()
      await writeOutput({ output: ensureJsonTreeString(status), outPath: request.out ?? undefined })
    })

  program
    .command('movers')
    .description('Top gaining/losing US stocks: price, change, change %, volume')
    .option('--direction <direction>', 'gainers, losers, or both (default both)')
    .option('--limit <n>', 'Rows per direction, 1-50 (default 10)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = StocksMoversCommandOptionsSchema.parse(options)
      const movers = await service.getMovers({
        direction: request.direction ?? DEFAULT_MOVERS_DIRECTION,
        limit: request.limit ?? DEFAULT_MOVERS_LIMIT
      })
      await writeOutput({ output: ensureJsonTreeString(movers), outPath: request.out ?? undefined })
    })

  return program
}
