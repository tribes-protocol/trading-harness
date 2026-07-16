import { Command } from 'commander'

import { MARKETSTACK_API_KEY } from '@/common/Env'
import { writeOutput } from '@/helpers/WriteOutput'
import { MarketstackService } from '@/services/MarketstackService'
import {
  MarketstackEodCommandOptionsSchema,
  MarketstackIntradayCommandOptionsSchema,
  MarketstackSearchCommandOptionsSchema,
  MarketstackTickerCommandOptionsSchema
} from '@/types/Marketstack'
import { ensureJsonTreeString } from '@/utils/Lang'

const VERSION = '1.0.0'

export function buildStocksCommand(): Command {
  const marketstackService = new MarketstackService({ apiKey: MARKETSTACK_API_KEY })

  const program = new Command('stocks')
  program.description('Stock market data CLI (direct Marketstack v2)').version(VERSION)

  program
    .command('eod')
    .description('End-of-day OHLCV bars for one or more symbols')
    .requiredOption('--symbols <symbols>', 'Comma-separated tickers, e.g. AAPL,MSFT')
    .option('--date-from <date>', 'Earliest bar date (YYYY-MM-DD or ISO-8601)')
    .option('--date-to <date>', 'Latest bar date (YYYY-MM-DD or ISO-8601)')
    .option('--limit <count>', 'Bars to return (default 100, max 1000)')
    .option('--latest', 'Latest available EOD bar per symbol (ignores --date-from/--date-to)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = MarketstackEodCommandOptionsSchema.parse(options)
      const response = await marketstackService.getEodBars({
        symbols: request.symbols,
        dateFrom: request.dateFrom ?? null,
        dateTo: request.dateTo ?? null,
        limit: request.limit,
        latest: request.latest
      })
      await writeOutput({
        output: ensureJsonTreeString(response),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('intraday')
    .description('Intraday OHLCV bars (US tickers via IEX; Marketstack Basic+ plans)')
    .requiredOption('--symbols <symbols>', 'Comma-separated tickers, e.g. AAPL,MSFT')
    .option(
      '--interval <interval>',
      'Bar interval: 1min|5min|10min|15min|30min|1hour|3hour|6hour|12hour|24hour (default 1hour)'
    )
    .option('--date-from <date>', 'Earliest bar date (YYYY-MM-DD or ISO-8601)')
    .option('--date-to <date>', 'Latest bar date (YYYY-MM-DD or ISO-8601)')
    .option('--limit <count>', 'Bars to return (default 100, max 1000)')
    .option('--latest', 'Latest intraday bar per symbol (ignores --date-from/--date-to)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = MarketstackIntradayCommandOptionsSchema.parse(options)
      const response = await marketstackService.getIntradayBars({
        symbols: request.symbols,
        interval: request.interval,
        dateFrom: request.dateFrom ?? null,
        dateTo: request.dateTo ?? null,
        limit: request.limit,
        latest: request.latest
      })
      await writeOutput({
        output: ensureJsonTreeString(response),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('search')
    .description('Search supported tickers by symbol or company name')
    .requiredOption('--query <text>', 'Ticker or company-name fragment, e.g. apple')
    .option('--limit <count>', 'Results to return (default 20)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = MarketstackSearchCommandOptionsSchema.parse(options)
      const response = await marketstackService.searchTickers({
        query: request.query,
        limit: request.limit
      })
      await writeOutput({
        output: ensureJsonTreeString(response),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('ticker')
    .description('Compact profile for one ticker (name, identifiers, exchange)')
    .requiredOption('--symbol <symbol>', 'Single ticker symbol, e.g. AAPL')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = MarketstackTickerCommandOptionsSchema.parse(options)
      const response = await marketstackService.getTickerProfile({ symbol: request.symbol })
      await writeOutput({
        output: ensureJsonTreeString(response),
        outPath: request.out ?? undefined
      })
    })

  return program
}
