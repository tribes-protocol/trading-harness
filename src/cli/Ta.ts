import { Command } from 'commander'

import { writeOutput } from '@/helpers/WriteOutput'
import { TaService } from '@/services/TaService'
import {
  TaBacktestCommandOptionsSchema,
  TaIndicatorNameSchema,
  TaIndicatorsCommandOptionsSchema,
  TaLevelsCommandOptionsSchema
} from '@/types/Ta'
import { ensureJsonTreeString } from '@/utils/Lang'

const VERSION = '1.0.0'

const DEFAULT_INDICATOR_SET = 'sma,ema,rsi,macd,bb,atr,vwap,stoch'
const DEFAULT_BACKTEST_FAST = 20
const DEFAULT_BACKTEST_SLOW = 50
const DEFAULT_RSI_LOW = 30
const DEFAULT_RSI_HIGH = 70

export function buildTaCommand(): Command {
  const service = new TaService()

  const program = new Command('ta')
  program
    .description('Technical analysis over a saved candles file — pure compute, no network')
    .version(VERSION)

  program
    .command('indicators')
    .description('Indicator snapshot (latest, previous, last-10 series) plus ema20/ema50 trend')
    .requiredOption(
      '--candles-file <path>',
      'Candle-contract JSON ({source, candles: [{t,o,h,l,c,v}]}) written by an ohlcv/candles command via --out'
    )
    .option(
      '--set <csv>',
      'Indicators to compute: sma,ema,rsi,macd,bb,atr,vwap,stoch (default all)'
    )
    .option(
      '--length <n>',
      'Override lookback for sma/ema/rsi/bb/atr (defaults: sma/ema/bb 20, rsi/atr 14)',
      (value) => Number(value)
    )
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = TaIndicatorsCommandOptionsSchema.parse(options)
      const set = TaIndicatorNameSchema.array().parse(
        (request.set ?? DEFAULT_INDICATOR_SET)
          .split(',')
          .map((name) => name.trim())
          .filter((name) => name !== '')
      )
      const result = await service.indicators({
        candlesFile: request.candlesFile,
        set,
        length: request.length ?? null
      })
      await writeOutput({ output: ensureJsonTreeString(result), outPath: request.out ?? undefined })
    })

  program
    .command('levels')
    .description('Swing-high/low support and resistance (top 3 by touches) plus 52-period range')
    .requiredOption(
      '--candles-file <path>',
      'Candle-contract JSON ({source, candles: [{t,o,h,l,c,v}]}) written by an ohlcv/candles command via --out'
    )
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = TaLevelsCommandOptionsSchema.parse(options)
      const result = await service.levels({ candlesFile: request.candlesFile })
      await writeOutput({ output: ensureJsonTreeString(result), outPath: request.out ?? undefined })
    })

  program
    .command('backtest')
    .description('Long-only bar-close backtest: ma-cross or rsi-revert')
    .requiredOption(
      '--candles-file <path>',
      'Candle-contract JSON ({source, candles: [{t,o,h,l,c,v}]}) written by an ohlcv/candles command via --out'
    )
    .requiredOption('--strategy <name>', 'Strategy: ma-cross|rsi-revert')
    .option('--fast <n>', 'ma-cross fast SMA length (default 20)', (value) => Number(value))
    .option('--slow <n>', 'ma-cross slow SMA length (default 50)', (value) => Number(value))
    .option('--rsi-low <n>', 'rsi-revert entry threshold (default 30)', (value) => Number(value))
    .option('--rsi-high <n>', 'rsi-revert exit threshold (default 70)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = TaBacktestCommandOptionsSchema.parse(options)
      const result = await service.backtest({
        candlesFile: request.candlesFile,
        strategy: request.strategy,
        fast: request.fast ?? DEFAULT_BACKTEST_FAST,
        slow: request.slow ?? DEFAULT_BACKTEST_SLOW,
        rsiLow: request.rsiLow ?? DEFAULT_RSI_LOW,
        rsiHigh: request.rsiHigh ?? DEFAULT_RSI_HIGH
      })
      await writeOutput({ output: ensureJsonTreeString(result), outPath: request.out ?? undefined })
    })

  return program
}
