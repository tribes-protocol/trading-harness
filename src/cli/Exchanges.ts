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
  ExchangesTreasuryChartCommandOptionsSchema,
  ExchangesTreasuryCommandOptionsSchema,
  ExchangesTreasuryEntitiesCommandOptionsSchema,
  ExchangesTreasuryEntityCommandOptionsSchema,
  ExchangesTreasuryHistoryCommandOptionsSchema,
  ExchangesVolumeChartCommandOptionsSchema
} from '@/types/Exchanges'
import { ensureJsonTreeString } from '@/utils/Lang'

const VERSION = '1.0.0'

const DEFAULT_LIST_LIMIT = 50
const DEFAULT_TICKERS_LIMIT = 50
const DEFAULT_DERIVATIVES_LIMIT = 50
const DEFAULT_DERIVATIVES_EXCHANGES_LIMIT = 50
const DEFAULT_TREASURY_ENTITIES_LIMIT = 50
const DEFAULT_TREASURY_HISTORY_LIMIT = 50
const DEFAULT_TREASURY_CHART_DAYS = '365'

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

  program
    .command('treasury-entities')
    .description('Companies and governments that publicly hold crypto, with entity ids')
    .option('--limit <n>', 'Entities to return, 1-250 (default 50)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = ExchangesTreasuryEntitiesCommandOptionsSchema.parse(options)
      const entities = await service.treasuryEntities({
        limit: request.limit ?? DEFAULT_TREASURY_ENTITIES_LIMIT
      })
      await writeOutput({
        output: ensureJsonTreeString(entities),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('treasury-entity')
    .description('Treasury holdings of one entity, optionally narrowed to one coin')
    .requiredOption('--entity <entity>', 'Entity id from `exchanges treasury-entities`')
    .option('--coin <coin>', 'CoinGecko coin id filter, e.g. bitcoin')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = ExchangesTreasuryEntityCommandOptionsSchema.parse(options)
      const holdings = await service.treasuryEntity({
        entity: request.entity,
        coin: request.coin ?? null
      })
      await writeOutput({
        output: ensureJsonTreeString(holdings),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('treasury-chart')
    .description('Holdings of one coin by one entity over time (t in epoch ms)')
    .requiredOption('--entity <entity>', 'Entity id from `exchanges treasury-entities`')
    .requiredOption('--coin <coin>', 'CoinGecko coin id, e.g. bitcoin')
    .option('--days <days>', 'Window: 7|14|30|90|180|365|730|max (default 365)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = ExchangesTreasuryChartCommandOptionsSchema.parse(options)
      const chart = await service.treasuryChart({
        entity: request.entity,
        coin: request.coin,
        days: request.days ?? DEFAULT_TREASURY_CHART_DAYS
      })
      await writeOutput({
        output: ensureJsonTreeString(chart),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('treasury-history')
    .description('Buy/sell transaction history of one treasury entity')
    .requiredOption('--entity <entity>', 'Entity id from `exchanges treasury-entities`')
    .option('--limit <n>', 'Transactions to return, 1-250 (default 50)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = ExchangesTreasuryHistoryCommandOptionsSchema.parse(options)
      const history = await service.treasuryHistory({
        entity: request.entity,
        limit: request.limit ?? DEFAULT_TREASURY_HISTORY_LIMIT
      })
      await writeOutput({
        output: ensureJsonTreeString(history),
        outPath: request.out ?? undefined
      })
    })

  return program
}
