import { Command } from 'commander'

import { SURFAI_API_KEY } from '@/common/Env'
import { writeOutput } from '@/helpers/WriteOutput'
import { SurfService } from '@/services/SurfService'
import {
  SurfEtfCommandOptionsSchema,
  SurfFundingCommandOptionsSchema,
  SurfLiquidationChartCommandOptionsSchema,
  SurfLiquidationOrdersCommandOptionsSchema,
  SurfLiquidationVenuesCommandOptionsSchema,
  SurfLongShortCommandOptionsSchema,
  SurfOptionsCommandOptionsSchema
} from '@/types/Surf'
import { ensureJsonTreeString } from '@/utils/Lang'

const VERSION = '1.0.0'

export function buildSurfCommand(): Command {
  const service = new SurfService({ apiKey: SURFAI_API_KEY })

  const program = new Command('surf')
  program
    .description(
      'SurfAI derivatives data: funding history, long/short ratio, liquidations, options and ETF flows (structured JSON)'
    )
    .version(VERSION)

  program
    .command('funding-history')
    .description('Perp funding-rate history for one pair, on one venue')
    .requiredOption(
      '--pair <pair>',
      "Trading pair, not a ticker — 'BTC/USDT', or 'BTC/USDC:USDC' on Hyperliquid"
    )
    .option(
      '--exchange <name>',
      'Lowercase venue id, e.g. binance or hyperliquid (default binance)'
    )
    .option('--from <when>', 'Start time: Unix seconds or YYYY-MM-DD')
    .option('--limit <n>', 'Rows to return (default 100)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = SurfFundingCommandOptionsSchema.parse(options)
      const funding = await service.getFundingHistory({
        pair: request.pair,
        exchange: request.exchange ?? null,
        from: request.from ?? null,
        limit: request.limit ?? null
      })
      await writeOutput({
        output: ensureJsonTreeString(funding),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('long-short')
    .description('Long/short account ratio history. Binance retains only the last 30 days')
    .requiredOption('--pair <pair>', "Trading pair, e.g. 'BTC/USDT'")
    .option('--interval <interval>', 'Bar interval: 1h, 4h or 1d (default 1h)')
    .option('--exchange <name>', 'binance, okx, bybit or bitget (default binance)')
    .option('--from <when>', 'Start time: Unix seconds or YYYY-MM-DD')
    .option('--limit <n>', 'Rows to return (default 50)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = SurfLongShortCommandOptionsSchema.parse(options)
      const ratio = await service.getLongShortRatio({
        pair: request.pair,
        interval: request.interval ?? null,
        exchange: request.exchange ?? null,
        from: request.from ?? null,
        limit: request.limit ?? null
      })
      await writeOutput({
        output: ensureJsonTreeString(ratio),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('liquidations')
    .description('Aggregated liquidation volume over time for one symbol')
    .requiredOption('--symbol <symbol>', 'Ticker, e.g. BTC')
    .option('--interval <interval>', 'Bar interval, e.g. 1h or 1d (default 1h)')
    .option('--exchange <name>', 'Title-case venue, e.g. Binance or Hyperliquid (default Binance)')
    .option('--limit <n>', 'Bars to return (default 500)', (value) => Number(value))
    .option('--from <when>', 'Start time: Unix seconds or YYYY-MM-DD')
    .option('--to <when>', 'End time: Unix seconds or YYYY-MM-DD')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = SurfLiquidationChartCommandOptionsSchema.parse(options)
      const chart = await service.getLiquidationChart({
        symbol: request.symbol,
        interval: request.interval ?? null,
        exchange: request.exchange ?? null,
        limit: request.limit ?? null,
        from: request.from ?? null,
        to: request.to ?? null
      })
      await writeOutput({
        output: ensureJsonTreeString(chart),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('liquidation-venues')
    .description('Liquidation totals ranked across venues — one snapshot, not a series')
    .option('--symbol <symbol>', 'Ticker (default BTC)')
    .option('--time-range <range>', 'Window: 1h, 4h, 12h or 24h (default 24h)')
    .option('--sort-by <field>', 'liquidation_usd, long_liquidation_usd or short_liquidation_usd')
    .option('--order <order>', 'asc or desc (default desc)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = SurfLiquidationVenuesCommandOptionsSchema.parse(options)
      const venues = await service.getLiquidationVenues({
        symbol: request.symbol ?? null,
        timeRange: request.timeRange ?? null,
        sortBy: request.sortBy ?? null,
        order: request.order ?? null
      })
      await writeOutput({
        output: ensureJsonTreeString(venues),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('liquidation-orders')
    .description('Individual liquidation prints above a USD threshold')
    .option('--symbol <symbol>', 'Ticker (default BTC)')
    .option('--exchange <name>', 'Title-case venue, e.g. Binance (default Binance)')
    .option('--min-amount <usd>', 'Minimum USD size (default 10000)', (value) => Number(value))
    .option('--side <side>', 'long or short; omit for both')
    .option('--sort-by <field>', 'usd_value, timestamp or price (default timestamp)')
    .option('--order <order>', 'asc or desc (default desc)')
    .option('--limit <n>', 'Rows to return (default 20)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = SurfLiquidationOrdersCommandOptionsSchema.parse(options)
      const orders = await service.getLiquidationOrders({
        symbol: request.symbol ?? null,
        exchange: request.exchange ?? null,
        minAmount: request.minAmount ?? null,
        side: request.side ?? null,
        sortBy: request.sortBy ?? null,
        order: request.order ?? null,
        limit: request.limit ?? null
      })
      await writeOutput({
        output: ensureJsonTreeString(orders),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('options')
    .description('Options market data — the volatility surface a crypto-native feed cannot give')
    .requiredOption('--symbol <symbol>', 'BTC, ETH, SOL, XRP, BNB or DOGE')
    .option('--sort-by <field>', 'open_interest or volume_24h (default volume_24h)')
    .option('--order <order>', 'asc or desc (default desc)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = SurfOptionsCommandOptionsSchema.parse(options)
      const chain = await service.getOptions({
        symbol: request.symbol,
        sortBy: request.sortBy ?? null,
        order: request.order ?? null
      })
      await writeOutput({
        output: ensureJsonTreeString(chain),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('etf-flows')
    .description('Spot-ETF net flow history — the TradFi bid, invisible to every onchain source')
    .requiredOption('--symbol <symbol>', 'BTC, ETH, XRP, SOL or HYPE')
    .option('--sort-by <field>', 'flow_usd or timestamp (default timestamp)')
    .option('--order <order>', 'asc or desc (default desc)')
    .option('--from <when>', 'Start time: Unix seconds or YYYY-MM-DD')
    .option('--to <when>', 'End time: Unix seconds or YYYY-MM-DD')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = SurfEtfCommandOptionsSchema.parse(options)
      const flows = await service.getEtfFlows({
        symbol: request.symbol,
        sortBy: request.sortBy ?? null,
        order: request.order ?? null,
        from: request.from ?? null,
        to: request.to ?? null
      })
      await writeOutput({
        output: ensureJsonTreeString(flows),
        outPath: request.out ?? undefined
      })
    })

  return program
}
