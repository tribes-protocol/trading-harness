import { Command } from 'commander'

import { BIRDEYE_API_KEY, MARKETSTACK_API_KEY } from '@/common/Env'
import { writeOutput } from '@/helpers/WriteOutput'
import { IndicatorsService } from '@/services/IndicatorsService'
import { IndicatorsRequestSchema } from '@/types/Indicators'
import { ensureJsonTreeString } from '@/utils/Lang'

const VERSION = '1.0.0'

// Fetches OHLCV (via the candles service) and computes TA indicators in one call.
export function buildIndicatorsCommand(): Command {
  const service = new IndicatorsService({
    birdeyeApiKey: BIRDEYE_API_KEY,
    marketStackApiKey: MARKETSTACK_API_KEY
  })

  const program = new Command('indicators')
  program
    .description(
      'Compute TA indicators (RSI, MACD, SMA/EMA, Bollinger, ADX, ATR, OBV, ROC, Momentum)'
    )
    .version(VERSION)
    .requiredOption('--kind <kind>', 'Asset kind: token | perp | stock')
    .requiredOption(
      '--asset <asset>',
      'Symbol/address (token), coin incl. dex prefix (perp), or ticker (stock)'
    )
    .option(
      '--chain <chain>',
      'Token chain (required for --kind token): ethereum | solana | base | bsc | arbitrum | optimism | polygon'
    )
    .option(
      '--timeframe <timeframe>',
      'Candle timeframe (1m,5m,15m,30m,1H,2H,4H,6H,8H,12H,1D,3D,1W,1M)',
      '1D'
    )
    .option('--days <days>', 'Lookback window in days (needs enough for the longest period)', '365')
    .option(
      '--source <source>',
      'Price source: close | open | high | low | hl2 | hlc3 | ohlc4',
      'close'
    )
    .option(
      '--indicators <list>',
      'Comma list to compute (default all): rsi,macd,sma,ema,bbands,adx,atr,obv,roc,mom'
    )
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = IndicatorsRequestSchema.parse(options)
      const result = await service.compute(request)
      await writeOutput({
        output: ensureJsonTreeString(result),
        outPath: request.out ?? undefined
      })
    })

  return program
}
