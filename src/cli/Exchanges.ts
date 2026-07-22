import { Command } from 'commander'

import { COIN_GECKO_PRO_API_KEY } from '@/common/Env'
import { writeOutput } from '@/helpers/WriteOutput'
import { ExchangesService } from '@/services/ExchangesService'
import {
  ExchangesDerivativesCommandOptionsSchema,
  ExchangesDerivativesExchangesCommandOptionsSchema,
  ExchangesDetailCommandOptionsSchema,
  ExchangesListCommandOptionsSchema,
  ExchangesTickersCommandOptionsSchema,
  ExchangesTreasuryCommandOptionsSchema,
  ExchangesVolumeChartCommandOptionsSchema
} from '@/types/Exchanges'
import { ensureJsonTreeString } from '@/utils/Lang'

const VERSION = '1.0.0'

const DEFAULT_LIST_LIMIT = 50
const DEFAULT_TICKERS_LIMIT = 50
const DEFAULT_DERIVATIVES_LIMIT = 50
const DEFAULT_DERIVATIVES_EXCHANGES_LIMIT = 50

export function buildExchangesCommand(): Command {
  const service = new ExchangesService({ apiKey: COIN_GECKO_PRO_API_KEY })

  const program = new Command('exchanges')
  program
    .description('Exchange, derivatives, and treasury data from CoinGecko Pro (structured JSON)')
    .version(VERSION)

  program
    .command('list')
    .description('Ranked exchanges: trust score, trust rank, 24h BTC volume')
    .option('--limit <n>', 'Exchanges to return, 1-250 (default 50)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = ExchangesListCommandOptionsSchema.parse(options)
      const exchanges = await service.list({ limit: request.limit ?? DEFAULT_LIST_LIMIT })
      await writeOutput({
        output: ensureJsonTreeString(exchanges),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('detail')
    .description('One exchange: trust, 24h BTC volume, top tickers')
    .requiredOption('--id <id>', 'CoinGecko exchange id, e.g. binance')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = ExchangesDetailCommandOptionsSchema.parse(options)
      const detail = await service.detail({ id: request.id })
      await writeOutput({
        output: ensureJsonTreeString(detail),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('tickers')
    .description('Tickers on one exchange: pair, USD price/volume, spread, trust')
    .requiredOption('--id <id>', 'CoinGecko exchange id, e.g. binance')
    .option('--limit <n>', 'Tickers to return, 1-100 (default 50)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = ExchangesTickersCommandOptionsSchema.parse(options)
      const tickers = await service.tickers({
        id: request.id,
        limit: request.limit ?? DEFAULT_TICKERS_LIMIT
      })
      await writeOutput({
        output: ensureJsonTreeString(tickers),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('volume-chart')
    .description('Exchange BTC volume time series')
    .requiredOption('--id <id>', 'CoinGecko exchange id, e.g. binance')
    .requiredOption('--days <days>', 'Window: 1|7|14|30|90|180|365')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = ExchangesVolumeChartCommandOptionsSchema.parse(options)
      const chart = await service.volumeChart({ id: request.id, days: request.days })
      await writeOutput({
        output: ensureJsonTreeString(chart),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('derivatives')
    .description('Derivatives tickers: symbol, price, open interest, volume, funding')
    .option('--limit <n>', 'Tickers to return, 1-500 (default 50)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = ExchangesDerivativesCommandOptionsSchema.parse(options)
      const tickers = await service.derivatives({
        limit: request.limit ?? DEFAULT_DERIVATIVES_LIMIT
      })
      await writeOutput({
        output: ensureJsonTreeString(tickers),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('derivatives-exchanges')
    .description('Derivatives venues ranked by open interest')
    .option('--limit <n>', 'Exchanges to return, 1-250 (default 50)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = ExchangesDerivativesExchangesCommandOptionsSchema.parse(options)
      const exchanges = await service.derivativesExchanges({
        limit: request.limit ?? DEFAULT_DERIVATIVES_EXCHANGES_LIMIT
      })
      await writeOutput({
        output: ensureJsonTreeString(exchanges),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('treasury')
    .description('Public companies holding BTC or ETH in treasury')
    .requiredOption('--coin <coin>', 'Treasury coin: bitcoin | ethereum')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = ExchangesTreasuryCommandOptionsSchema.parse(options)
      const treasury = await service.treasury({ coin: request.coin })
      await writeOutput({
        output: ensureJsonTreeString(treasury),
        outPath: request.out ?? undefined
      })
    })

  return program
}
