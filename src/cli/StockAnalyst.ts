import { Command } from 'commander'

import { MARKETSTACK_API_KEY } from '@/common/Env'
import { writeOutput } from '@/helpers/WriteOutput'
import { StockService } from '@/services/StockService'
import { StockTimeframeSchema } from '@/types/MarketStack'
import {
  StockCandlesCommandOptionsSchema,
  StockDetailsCommandOptionsSchema,
  StockMarketSnapshotCommandOptionsSchema,
  StockSearchCommandOptionsSchema,
  StockSnapshotCommandOptionsSchema
} from '@/types/StockAnalystCli'
import { ensureJsonTreeString } from '@/utils/Lang'

const VERSION = '1.0.0'

const TIMEFRAMES = StockTimeframeSchema.options.join(', ')

export function buildStockAnalystCommand(): Command {
  const stockService = new StockService({ apiKey: MARKETSTACK_API_KEY })

  const program = new Command('stock-analyst')
  program.description('Stock market data CLI (Marketstack)').version(VERSION)

  program
    .command('snapshot')
    .description('Price, day bars, change, and previous close for one ticker')
    .requiredOption('--ticker <ticker>', 'Stock ticker symbol (e.g. AAPL)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = StockSnapshotCommandOptionsSchema.parse(options)
      const response = await stockService.getSnapshot(request.ticker)
      await writeOutput({
        output: ensureJsonTreeString(response),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('market-snapshot')
    .description('Price and change for many tickers at once (max 50)')
    .requiredOption('--tickers <tickers>', 'Comma-separated tickers (e.g. AAPL,MSFT,NVDA)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = StockMarketSnapshotCommandOptionsSchema.parse(options)
      const response = await stockService.getMarketSnapshot(request.tickers)
      await writeOutput({
        output: ensureJsonTreeString(response),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('details')
    .description('Company profile: name, exchange, sector, industry, and identifiers')
    .requiredOption('--ticker <ticker>', 'Stock ticker symbol (e.g. AAPL)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = StockDetailsCommandOptionsSchema.parse(options)
      const response = await stockService.getDetails(request.ticker)
      await writeOutput({
        output: ensureJsonTreeString(response),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('search')
    .description('Search tickers by symbol or company name')
    .requiredOption('--query <query>', 'Ticker symbol or company name')
    .option('--limit <limit>', 'Max results (1-50, default 10)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = StockSearchCommandOptionsSchema.parse(options)
      const response = await stockService.search(request.query, request.limit)
      await writeOutput({
        output: ensureJsonTreeString(response),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('candles')
    .description('OHLCV bars for one ticker over a date range')
    .requiredOption('--ticker <ticker>', 'Stock ticker symbol (e.g. AAPL)')
    .requiredOption('--timeframe <timeframe>', `One of: ${TIMEFRAMES}`)
    .requiredOption('--from <date>', 'Start date (YYYY-MM-DD)')
    .requiredOption('--to <date>', 'End date (YYYY-MM-DD)')
    .option('--limit <limit>', 'Max bars to return (1-5000)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = StockCandlesCommandOptionsSchema.parse(options)
      const response = await stockService.getCandles({
        ticker: request.ticker,
        timeframe: request.timeframe,
        from: request.from,
        to: request.to,
        limit: request.limit
      })
      await writeOutput({
        output: ensureJsonTreeString(response),
        outPath: request.out ?? undefined
      })
    })

  return program
}
