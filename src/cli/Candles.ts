import { Command } from 'commander'

import { BIRDEYE_API_KEY, MARKETSTACK_API_KEY } from '@/common/Env'
import { writeOutput } from '@/helpers/WriteOutput'
import { CandlesService } from '@/services/CandlesService'
import { OhlcvRequestSchema } from '@/types/Candles'
import { ensureJsonTreeString } from '@/utils/Lang'

const VERSION = '1.0.0'

// Single-purpose group: unified OHLCV candles across a token, perp, or stock,
// keyed on the AssetIdentity kind.
export function buildCandlesCommand(): Command {
  const service = new CandlesService({
    birdeyeApiKey: BIRDEYE_API_KEY,
    marketStackApiKey: MARKETSTACK_API_KEY
  })

  const program = new Command('candles')
  program
    .description('Unified OHLCV candles for a token, perp, or stock')
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
      'Candle timeframe (1m,5m,15m,30m,1H,2H,4H,6H,8H,12H,1D,3D,1W,1M; perps have no 6H)',
      '1D'
    )
    .option('--days <days>', 'Lookback window in days', '45')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = OhlcvRequestSchema.parse(options)
      const candles = await service.getOhlcv(request)
      await writeOutput({
        output: ensureJsonTreeString(candles),
        outPath: request.out ?? undefined
      })
    })

  return program
}
