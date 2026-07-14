import { Command } from 'commander'

import { COIN_GECKO_PRO_API_KEY } from '@/common/Env'
import { writeOutput } from '@/helpers/WriteOutput'
import { FundamentalsService } from '@/services/FundamentalsService'
import { CoinGeckoOhlcDaysSchema } from '@/types/CoinGecko'
import {
  CoinCommandOptionsSchema,
  CoinHistoryCommandOptionsSchema,
  CoinSearchCommandOptionsSchema,
  ContractCommandOptionsSchema,
  ContractMarketChartCommandOptionsSchema,
  MarketChartCommandOptionsSchema,
  NoArgCommandOptionsSchema,
  OhlcCommandOptionsSchema,
  SupplyChartCommandOptionsSchema,
  TickersCommandOptionsSchema,
  TokenPriceCommandOptionsSchema
} from '@/types/FundamentalsAnalystCli'
import { ensureJsonTreeString } from '@/utils/Lang'

const VERSION = '1.0.0'

const OHLC_DAYS = CoinGeckoOhlcDaysSchema.options.join(', ')

async function emit(payload: unknown, outPath: string | null | undefined): Promise<void> {
  await writeOutput({ output: ensureJsonTreeString(payload), outPath: outPath ?? undefined })
}

export function buildFundamentalsAnalystCommand(): Command {
  const service = new FundamentalsService({ apiKey: COIN_GECKO_PRO_API_KEY })

  const program = new Command('fundamentals-analyst')
  program.description('Coin research CLI (CoinGecko)').version(VERSION)

  program
    .command('coin')
    .description('Coin profile: price, market cap, supply, categories, links')
    .requiredOption('--id <id>', 'CoinGecko coin ID (e.g. bitcoin)')
    .option('--community', 'Include community metrics (Twitter, Reddit, Telegram)')
    .option('--developer', 'Include developer metrics (stars, forks, commits)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = CoinCommandOptionsSchema.parse(options)
      const response = await service.getCoinProfile(request.id, {
        community: request.community,
        developer: request.developer
      })
      await emit(response, request.out)
    })

  program
    .command('search')
    .description("Find a coin's CoinGecko ID by name or symbol")
    .requiredOption('--query <query>', 'Coin name or symbol (e.g. "render")')
    .option('--limit <limit>', 'Max results (1-50, default 10)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = CoinSearchCommandOptionsSchema.parse(options)
      const response = await service.searchCoins(request.query, request.limit)
      await emit(response, request.out)
    })

  program
    .command('history')
    .description('Point-in-time snapshot of price, market cap, and volume on a date')
    .requiredOption('--id <id>', 'CoinGecko coin ID (e.g. bitcoin)')
    .requiredOption('--date <date>', 'Date in dd-mm-yyyy format')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = CoinHistoryCommandOptionsSchema.parse(options)
      const response = await service.getCoinHistory(request.id, request.date)
      await emit(response, request.out)
    })

  program
    .command('market-chart')
    .description('Price, market cap, and volume time-series')
    .requiredOption('--id <id>', 'CoinGecko coin ID (e.g. bitcoin)')
    .option('--vs <currency>', 'Quote currency (default usd)')
    .option('--days <days>', 'Lookback in days, or "max" (ignored when --from and --to are set)')
    .option('--from <unix>', 'Range start, UNIX seconds (use with --to)')
    .option('--to <unix>', 'Range end, UNIX seconds (use with --from)')
    .option('--interval <interval>', 'Sampling interval: daily or hourly')
    .option('--precision <precision>', 'Decimal precision: full or 0-6')
    .option('--limit <limit>', 'Return only the most recent N points')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = MarketChartCommandOptionsSchema.parse(options)
      const response = await service.getMarketChart({
        id: request.id,
        vsCurrency: request.vs,
        days: request.days,
        from: request.from,
        to: request.to,
        interval: request.interval,
        precision: request.precision,
        limit: request.limit
      })
      await emit(response, request.out)
    })

  program
    .command('ohlc')
    .description('OHLC candles for a coin')
    .requiredOption('--id <id>', 'CoinGecko coin ID (e.g. bitcoin)')
    .option('--vs <currency>', 'Quote currency (default usd)')
    .option('--days <days>', `Lookback, one of: ${OHLC_DAYS} (ignored with --from/--to)`)
    .option('--from <unix>', 'Range start, UNIX seconds (use with --to)')
    .option('--to <unix>', 'Range end, UNIX seconds (use with --from)')
    .option('--interval <interval>', 'Range-mode sampling interval: daily or hourly')
    .option('--limit <limit>', 'Return only the most recent N candles')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = OhlcCommandOptionsSchema.parse(options)
      const response = await service.getOhlc({
        id: request.id,
        vsCurrency: request.vs,
        days: request.days,
        from: request.from,
        to: request.to,
        interval: request.interval,
        limit: request.limit
      })
      await emit(response, request.out)
    })

  program
    .command('supply-chart')
    .description('Circulating or total supply history')
    .requiredOption('--id <id>', 'CoinGecko coin ID (e.g. bitcoin)')
    .requiredOption('--kind <kind>', 'circulating or total')
    .option('--days <days>', 'Lookback in days, or "max" (ignored when --from and --to are set)')
    .option('--from <unix>', 'Range start, UNIX seconds (use with --to)')
    .option('--to <unix>', 'Range end, UNIX seconds (use with --from)')
    .option('--limit <limit>', 'Return only the most recent N points')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = SupplyChartCommandOptionsSchema.parse(options)
      const response = await service.getSupplyChart({
        id: request.id,
        kind: request.kind,
        days: request.days,
        from: request.from,
        to: request.to,
        limit: request.limit
      })
      await emit(response, request.out)
    })

  program
    .command('tickers')
    .description('Where a coin trades: exchange, pair, price, volume, trust score')
    .requiredOption('--id <id>', 'CoinGecko coin ID (e.g. bitcoin)')
    .option('--exchange-ids <ids>', 'Comma-separated exchange IDs to filter by')
    .option('--page <page>', 'Page number')
    .option('--order <order>', 'trust_score_desc or volume_desc')
    .option('--limit <limit>', 'Max tickers to return (1-100, default 20)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = TickersCommandOptionsSchema.parse(options)
      const response = await service.getTickers({
        id: request.id,
        exchangeIds: request.exchangeIds,
        page: request.page,
        order: request.order,
        limit: request.limit
      })
      await emit(response, request.out)
    })

  program
    .command('contract')
    .description('Coin profile looked up by contract address instead of coin ID')
    .requiredOption('--network <network>', 'Asset platform (e.g. ethereum, solana, base)')
    .requiredOption('--address <address>', 'Token contract address')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = ContractCommandOptionsSchema.parse(options)
      const response = await service.getContractProfile(request.network, request.address)
      await emit(response, request.out)
    })

  program
    .command('contract-market-chart')
    .description('Price, market cap, and volume time-series by contract address')
    .requiredOption('--network <network>', 'Asset platform (e.g. ethereum, solana, base)')
    .requiredOption('--address <address>', 'Token contract address')
    .option('--vs <currency>', 'Quote currency (default usd)')
    .option('--days <days>', 'Lookback in days, or "max" (ignored when --from and --to are set)')
    .option('--from <unix>', 'Range start, UNIX seconds (use with --to)')
    .option('--to <unix>', 'Range end, UNIX seconds (use with --from)')
    .option('--limit <limit>', 'Return only the most recent N points')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = ContractMarketChartCommandOptionsSchema.parse(options)
      const response = await service.getContractMarketChart({
        network: request.network,
        address: request.address,
        vsCurrency: request.vs,
        days: request.days,
        from: request.from,
        to: request.to,
        limit: request.limit
      })
      await emit(response, request.out)
    })

  program
    .command('token-price')
    .description('Spot price by contract address on an asset platform')
    .requiredOption('--platform <platform>', 'Asset platform (e.g. ethereum, solana)')
    .requiredOption('--addresses <addresses>', 'Comma-separated contract addresses')
    .option('--vs <currencies>', 'Comma-separated quote currencies (default usd)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = TokenPriceCommandOptionsSchema.parse(options)
      const response = await service.getTokenPrice({
        platform: request.platform,
        addresses: request.addresses,
        vsCurrencies: request.vs
      })
      await emit(response, request.out)
    })

  program
    .command('exchange-rates')
    .description('BTC-denominated rates across fiat, crypto, and commodity currencies')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = NoArgCommandOptionsSchema.parse(options)
      const response = await service.getExchangeRates()
      await emit(response, request.out)
    })

  program
    .command('supported-currencies')
    .description('Quote currencies accepted by the pricing endpoints')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = NoArgCommandOptionsSchema.parse(options)
      const response = await service.getSupportedCurrencies()
      await emit(response, request.out)
    })

  return program
}
