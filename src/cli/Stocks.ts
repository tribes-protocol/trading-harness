import { Command } from 'commander'

import { MARKETSTACK_API_KEY } from '@/common/Env'
import { writeOutput } from '@/helpers/WriteOutput'
import { StocksService } from '@/services/StocksService'
import {
  StocksCandlesCommandOptionsSchema,
  StocksDetailCommandOptionsSchema,
  StocksSearchCommandOptionsSchema
} from '@/types/Stocks'
import { ensureJsonTreeString } from '@/utils/Lang'

const VERSION = '1.0.0'

const DEFAULT_CANDLES_LIMIT = 100
const DEFAULT_SEARCH_LIMIT = 20

export function buildStocksCommand(): Command {
  const service = new StocksService({ apiKey: MARKETSTACK_API_KEY })

  const program = new Command('stocks')
  program.description('Stock market data from Marketstack (structured JSON)').version(VERSION)

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

  return program
}
