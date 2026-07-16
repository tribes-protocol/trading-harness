import { Command } from 'commander'

import {
  BIRDEYE_API_KEY,
  COIN_GECKO_PRO_API_KEY,
  MARKETSTACK_API_KEY,
  MORALIS_API_KEY
} from '@/common/Env'
import { writeOutput } from '@/helpers/WriteOutput'
import { CoinGeckoService } from '@/services/CoinGeckoService'
import { MarketstackService } from '@/services/MarketstackService'
import { TechnicalsService } from '@/services/TechnicalsService'
import { TokenDataService } from '@/services/TokenDataService'
import { TechnicalsCommandOptionsSchema } from '@/types/Technicals'
import { BirdeyeOhlcvIntervalSchema } from '@/types/TokenData'
import { ensureJsonTreeString, isNullish } from '@/utils/Lang'

const VERSION = '1.0.0'

export function buildTechnicalsCommand(): Command {
  const technicalsService = new TechnicalsService({
    coinGecko: new CoinGeckoService({ apiKey: COIN_GECKO_PRO_API_KEY }),
    marketstack: new MarketstackService({ apiKey: MARKETSTACK_API_KEY }),
    tokenData: new TokenDataService({
      birdeyeApiKey: BIRDEYE_API_KEY,
      moralisApiKey: MORALIS_API_KEY,
      coinGeckoProApiKey: COIN_GECKO_PRO_API_KEY
    })
  })

  const program = new Command('technicals')
  program
    .description('Indicator computation (RSI, MACD, SMA/EMA, Bollinger, ATR) from candle data')
    .version(VERSION)

  program
    .command('indicators')
    .description('Compute an indicator pack for one instrument from its native candle source')
    .option('--coin-id <id>', 'CoinGecko coin id (crypto), e.g. bitcoin')
    .option(
      '--days <days>',
      'CoinGecko window (default 30 = 4h candles; 365 = 4-day candles; 1-2 = 30min)'
    )
    .option('--vs <currency>', 'Quote currency for --coin-id (default usd)')
    .option('--symbol <ticker>', 'Stock ticker (Marketstack daily EOD), e.g. AAPL')
    .option('--address <address>', 'On-chain token address (Birdeye candles)')
    .option('--chain <chainId>', 'Chain id for --address (1 8453 56 42161 10 137 solana)')
    .option('--interval <interval>', 'Birdeye candle interval for --address (default 1D)')
    .option('--limit <count>', 'Candle count for --symbol/--address (30-500, default 120)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = TechnicalsCommandOptionsSchema.parse(options)
      const response = !isNullish(request.coinId)
        ? await technicalsService.computeForCoin({
            id: request.coinId,
            days: request.days,
            vs: request.vs
          })
        : !isNullish(request.symbol)
          ? await technicalsService.computeForSymbol({
              symbol: request.symbol,
              limit: request.limit
            })
          : await technicalsService.computeForToken({
              // superRefine guarantees address+chain are present on this path.
              address: ensureDefined(request.address, '--address'),
              chainId: ensureDefined(request.chain, '--chain'),
              interval: BirdeyeOhlcvIntervalSchema.parse(request.interval),
              limit: request.limit
            })
      await writeOutput({
        output: ensureJsonTreeString(response),
        outPath: request.out ?? undefined
      })
    })

  return program
}

function ensureDefined<T>(value: T | null | undefined, flag: string): T {
  if (isNullish(value)) {
    throw new Error(`${flag} is required for this source`)
  }
  return value
}
