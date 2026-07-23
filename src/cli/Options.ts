import { Command } from 'commander'

import { API_BASE_URL, API_BEARER_TOKEN, MASSIVE_API_KEY } from '@/common/Env'
import { writeOutput } from '@/helpers/WriteOutput'
import { OptionsService } from '@/services/OptionsService'
import {
  OptionsCandlesCommandOptionsSchema,
  OptionsChainCommandOptionsSchema,
  OptionsContractCommandOptionsSchema,
  OptionsContractsCommandOptionsSchema,
  OptionsTicksCommandOptionsSchema
} from '@/types/Options'
import { ensureJsonTreeString } from '@/utils/Lang'

const VERSION = '1.0.0'

const DEFAULT_CONTRACTS_LIMIT = 100
const DEFAULT_TICKS_LIMIT = 50
const DEFAULT_CANDLES_LIMIT = 100

export function buildOptionsCommand(): Command {
  const service = new OptionsService({
    apiKey: MASSIVE_API_KEY,
    apiBaseUrl: API_BASE_URL,
    apiBearerToken: API_BEARER_TOKEN
  })

  const program = new Command('options')
  program
    .description('Equity options data from the Tribes options proxy and Massive (structured JSON)')
    .version(VERSION)

  program
    .command('chain')
    .description('Option chain snapshot: strikes, bid/ask, IV, greeks, open interest')
    .requiredOption('--symbol <symbol>', 'Underlying stock ticker, e.g. AAPL')
    .option('--expiry <date>', 'Filter by expiration date YYYY-MM-DD')
    .option('--strike-range <min-max>', 'Strike price range, e.g. 180-220')
    .option('--limit <n>', 'Contracts to return, 1-250 (default 250)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = OptionsChainCommandOptionsSchema.parse(options)
      const range = request.strikeRange?.split('-')
      const chain = await service.getChain({
        symbol: request.symbol,
        expiry: request.expiry,
        strikeGte: range === undefined ? null : Number(range[0]),
        strikeLte: range === undefined ? null : Number(range[1]),
        limit: request.limit
      })
      await writeOutput({ output: ensureJsonTreeString(chain), outPath: request.out ?? undefined })
    })

  program
    .command('contract')
    .description('Single option contract snapshot: quote, IV, greeks, day bar, open interest')
    .requiredOption('--contract <ticker>', 'OCC option ticker, e.g. O:AAPL250620C00200000')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = OptionsContractCommandOptionsSchema.parse(options)
      const detail = await service.getContract({ contract: request.contract })
      await writeOutput({ output: ensureJsonTreeString(detail), outPath: request.out ?? undefined })
    })

  program
    .command('contracts')
    .description('List option contracts for an underlying from the reference endpoint')
    .requiredOption('--symbol <symbol>', 'Underlying stock ticker, e.g. AAPL')
    .option('--expiry <date>', 'Filter by expiration date YYYY-MM-DD')
    .option('--type <type>', 'Filter by contract type: call|put')
    .option('--limit <n>', 'Contracts to return, 1-1000 (default 100)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = OptionsContractsCommandOptionsSchema.parse(options)
      const contracts = await service.getContracts({
        symbol: request.symbol,
        expiry: request.expiry,
        type: request.type,
        limit: request.limit ?? DEFAULT_CONTRACTS_LIMIT
      })
      await writeOutput({
        output: ensureJsonTreeString(contracts),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('trades')
    .description('Recent trades for an option contract, newest first')
    .requiredOption('--contract <ticker>', 'OCC option ticker, e.g. O:AAPL250620C00200000')
    .option('--limit <n>', 'Trades to return, 1-1000 (default 50)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = OptionsTicksCommandOptionsSchema.parse(options)
      const trades = await service.getTrades({
        contract: request.contract,
        limit: request.limit ?? DEFAULT_TICKS_LIMIT
      })
      await writeOutput({ output: ensureJsonTreeString(trades), outPath: request.out ?? undefined })
    })

  program
    .command('quotes')
    .description('Recent NBBO quotes for an option contract, newest first')
    .requiredOption('--contract <ticker>', 'OCC option ticker, e.g. O:AAPL250620C00200000')
    .option('--limit <n>', 'Quotes to return, 1-1000 (default 50)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = OptionsTicksCommandOptionsSchema.parse(options)
      const quotes = await service.getQuotes({
        contract: request.contract,
        limit: request.limit ?? DEFAULT_TICKS_LIMIT
      })
      await writeOutput({ output: ensureJsonTreeString(quotes), outPath: request.out ?? undefined })
    })

  program
    .command('last-trade')
    .description('Last trade for an option contract')
    .requiredOption('--contract <ticker>', 'OCC option ticker, e.g. O:AAPL250620C00200000')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = OptionsContractCommandOptionsSchema.parse(options)
      const trade = await service.getLastTrade({ contract: request.contract })
      await writeOutput({ output: ensureJsonTreeString(trade), outPath: request.out ?? undefined })
    })

  program
    .command('candles')
    .description('Daily OHLCV candles for an option contract (shared candle contract for `ta`)')
    .requiredOption('--contract <ticker>', 'OCC option ticker, e.g. O:AAPL250620C00200000')
    .option('--from <date>', 'Start date YYYY-MM-DD (default 180 days before --to)')
    .option('--to <date>', 'End date YYYY-MM-DD (default today)')
    .option('--limit <n>', 'Candles to return, 1-1000 (default 100)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = OptionsCandlesCommandOptionsSchema.parse(options)
      const candles = await service.getCandles({
        contract: request.contract,
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
    .command('prev-day')
    .description('Previous trading day OHLCV bar for an option contract')
    .requiredOption('--contract <ticker>', 'OCC option ticker, e.g. O:AAPL250620C00200000')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = OptionsContractCommandOptionsSchema.parse(options)
      const bar = await service.getPrevDay({ contract: request.contract })
      await writeOutput({ output: ensureJsonTreeString(bar), outPath: request.out ?? undefined })
    })

  return program
}
