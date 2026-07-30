import { Command } from 'commander'

import { COIN_GECKO_PRO_API_KEY } from '@/common/Env'
import { writeOutput } from '@/helpers/WriteOutput'
import { CoinService } from '@/services/CoinService'
import {
  CoinChartCommandOptionsSchema,
  CoinContractCommandOptionsSchema,
  CoinOhlcCommandOptionsSchema,
  CoinProfileCommandOptionsSchema,
  CoinRatesCommandOptionsSchema,
  CoinSupplyCommandOptionsSchema,
  CoinTickersCommandOptionsSchema
} from '@/types/Coin'
import { ensureJsonTreeString } from '@/utils/Lang'

const VERSION = '1.0.0'

const DEFAULT_TICKERS_LIMIT = 50

export function buildCoinCommand(): Command {
  const service = new CoinService({ apiKey: COIN_GECKO_PRO_API_KEY })

  const program = new Command('coin')
  program.description('Single-coin deep dive from CoinGecko Pro (structured JSON)').version(VERSION)

  program
    .command('profile')
    .description('Coin fundamentals: rank, price, ath/atl, supply, sentiment, links')
    .requiredOption('--id <id>', 'CoinGecko coin id, e.g. bitcoin')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = CoinProfileCommandOptionsSchema.parse(options)
      const profile = await service.getProfile({ id: request.id })
      await writeOutput({
        output: ensureJsonTreeString(profile),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('chart')
    .description('Price, market cap, and volume time series for one coin')
    .requiredOption('--id <id>', 'CoinGecko coin id, e.g. bitcoin')
    .requiredOption('--days <days>', 'Window: 1|7|14|30|90|180|365|max')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = CoinChartCommandOptionsSchema.parse(options)
      const chart = await service.getChart({ id: request.id, days: request.days })
      await writeOutput({ output: ensureJsonTreeString(chart), outPath: request.out ?? undefined })
    })

  program
    .command('ohlc')
    .description('OHLC candles for one coin (no volume on this endpoint)')
    .requiredOption('--id <id>', 'CoinGecko coin id, e.g. bitcoin')
    .requiredOption('--days <days>', 'Window: 1|7|14|30|90|180|365|max')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = CoinOhlcCommandOptionsSchema.parse(options)
      const candles = await service.getOhlc({ id: request.id, days: request.days })
      await writeOutput({
        output: ensureJsonTreeString(candles),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('tickers')
    .description('Exchange tickers for one coin: market, pair, price, volume, trust score')
    .requiredOption('--id <id>', 'CoinGecko coin id, e.g. bitcoin')
    .option('--limit <n>', 'Tickers to return, 1-100 (default 50)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = CoinTickersCommandOptionsSchema.parse(options)
      const tickers = await service.getTickers({
        id: request.id,
        limit: request.limit ?? DEFAULT_TICKERS_LIMIT
      })
      await writeOutput({
        output: ensureJsonTreeString(tickers),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('contract')
    .description('Resolve a token contract address to a coin id and core market data')
    .requiredOption('--platform <platform>', 'Asset platform id, e.g. ethereum, solana')
    .requiredOption('--address <address>', 'Token contract address')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = CoinContractCommandOptionsSchema.parse(options)
      const contract = await service.getContract({
        platform: request.platform,
        address: request.address
      })
      await writeOutput({
        output: ensureJsonTreeString(contract),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('supply')
    .description('Circulating supply time series for one coin')
    .requiredOption('--id <id>', 'CoinGecko coin id, e.g. bitcoin')
    .requiredOption('--days <days>', 'Window: 1|7|14|30|90|180|365|max')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = CoinSupplyCommandOptionsSchema.parse(options)
      const supply = await service.getSupplyHistory({ id: request.id, days: request.days })
      await writeOutput({ output: ensureJsonTreeString(supply), outPath: request.out ?? undefined })
    })

  program
    .command('rates')
    .description('BTC-relative fiat and crypto exchange rates')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = CoinRatesCommandOptionsSchema.parse(options)
      const rates = await service.getRates()
      await writeOutput({ output: ensureJsonTreeString(rates), outPath: request.out ?? undefined })
    })

  return program
}
