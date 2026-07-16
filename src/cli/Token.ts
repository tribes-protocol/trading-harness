import { Command } from 'commander'

import {
  API_BASE_URL,
  BIRDEYE_API_KEY,
  COIN_GECKO_PRO_API_KEY,
  MORALIS_API_KEY
} from '@/common/Env'
import { writeOutput } from '@/helpers/WriteOutput'
import { TokenDataService } from '@/services/TokenDataService'
import { TokenService } from '@/services/TokenService'
import { SUPPORTED_CHAIN_IDS_TEXT } from '@/types/ChainId'
import { TokenSearchCommandOptionsSchema } from '@/types/Search'
import {
  BIRDEYE_OHLCV_INTERVALS,
  TokenHoldersCommandOptionsSchema,
  TokenMarketCommandOptionsSchema,
  TokenOhlcvCommandOptionsSchema,
  TokenTrendingCommandOptionsSchema
} from '@/types/TokenData'
import { ensureJsonTreeString } from '@/utils/Lang'

const VERSION = '1.0.0'

const CHAIN_FLAG_DESCRIPTION = `Chain id (${SUPPORTED_CHAIN_IDS_TEXT})`
const ADDRESS_FLAG_DESCRIPTION = 'Token contract/mint address'
const OUT_FLAG_DESCRIPTION = 'Write output JSON to file'

export function buildTokenCommand(): Command {
  const tokenService = new TokenService({ apiBaseUrl: API_BASE_URL })
  const tokenDataService = new TokenDataService({
    birdeyeApiKey: BIRDEYE_API_KEY,
    moralisApiKey: MORALIS_API_KEY,
    coinGeckoProApiKey: COIN_GECKO_PRO_API_KEY
  })

  const program = new Command('token')
  program.description('Token search and per-token on-chain market data CLI').version(VERSION)

  program
    .command('search')
    .description('Search tokens via /search')
    .requiredOption('--query <query>', 'Token query text')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = TokenSearchCommandOptionsSchema.parse(options)
      const response = await tokenService.search(request.query)
      const output = ensureJsonTreeString(response)
      await writeOutput({
        output,
        outPath: request.out ?? undefined
      })
    })

  program
    .command('price')
    .description('Spot price with liquidity (Birdeye primary, Moralis fallback)')
    .requiredOption('--address <tokenAddress>', ADDRESS_FLAG_DESCRIPTION)
    .requiredOption('--chain <chainId>', CHAIN_FLAG_DESCRIPTION)
    .option('--out <file>', OUT_FLAG_DESCRIPTION)
    .action(async (options: unknown): Promise<void> => {
      const request = TokenMarketCommandOptionsSchema.parse(options)
      const response = await tokenDataService.getPrice({
        address: request.address,
        chainId: request.chain
      })
      await writeOutput({
        output: ensureJsonTreeString(response),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('overview')
    .description(
      'Token overview: marketcap, FDV, liquidity, volume, holders ' +
        '(Birdeye primary, CoinGecko onchain fallback)'
    )
    .requiredOption('--address <tokenAddress>', ADDRESS_FLAG_DESCRIPTION)
    .requiredOption('--chain <chainId>', CHAIN_FLAG_DESCRIPTION)
    .option('--out <file>', OUT_FLAG_DESCRIPTION)
    .action(async (options: unknown): Promise<void> => {
      const request = TokenMarketCommandOptionsSchema.parse(options)
      const response = await tokenDataService.getOverview({
        address: request.address,
        chainId: request.chain
      })
      await writeOutput({
        output: ensureJsonTreeString(response),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('ohlcv')
    .description('OHLCV candles (Birdeye, no fallback)')
    .requiredOption('--address <tokenAddress>', ADDRESS_FLAG_DESCRIPTION)
    .requiredOption('--chain <chainId>', CHAIN_FLAG_DESCRIPTION)
    .option(
      '--interval <interval>',
      `Candle interval, one of: ${BIRDEYE_OHLCV_INTERVALS.join(', ')} (default 1H)`
    )
    .option('--limit <count>', 'Number of candles to return (default 100, max 1000)')
    .option('--time-from <unixSeconds>', 'Window start (unix seconds; derived from limit if unset)')
    .option('--time-to <unixSeconds>', 'Window end (unix seconds; defaults to now)')
    .option('--out <file>', OUT_FLAG_DESCRIPTION)
    .action(async (options: unknown): Promise<void> => {
      const request = TokenOhlcvCommandOptionsSchema.parse(options)
      const response = await tokenDataService.getOhlcv({
        address: request.address,
        chainId: request.chain,
        interval: request.interval,
        limit: request.limit,
        timeFrom: request.timeFrom ?? null,
        timeTo: request.timeTo ?? null
      })
      await writeOutput({
        output: ensureJsonTreeString(response),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('security')
    .description('Token security / rug-risk audit (Birdeye, no fallback)')
    .requiredOption('--address <tokenAddress>', ADDRESS_FLAG_DESCRIPTION)
    .requiredOption('--chain <chainId>', CHAIN_FLAG_DESCRIPTION)
    .option('--out <file>', OUT_FLAG_DESCRIPTION)
    .action(async (options: unknown): Promise<void> => {
      const request = TokenMarketCommandOptionsSchema.parse(options)
      const response = await tokenDataService.getSecurity({
        address: request.address,
        chainId: request.chain
      })
      await writeOutput({
        output: ensureJsonTreeString(response),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('holders')
    .description('Top token holders (Solana via Birdeye, EVM via Moralis)')
    .requiredOption('--address <tokenAddress>', ADDRESS_FLAG_DESCRIPTION)
    .requiredOption('--chain <chainId>', CHAIN_FLAG_DESCRIPTION)
    .option('--limit <count>', 'Number of holders to return (default 20, max 100)')
    .option('--out <file>', OUT_FLAG_DESCRIPTION)
    .action(async (options: unknown): Promise<void> => {
      const request = TokenHoldersCommandOptionsSchema.parse(options)
      const response = await tokenDataService.getHolders({
        address: request.address,
        chainId: request.chain,
        limit: request.limit
      })
      await writeOutput({
        output: ensureJsonTreeString(response),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('trending')
    .description('Trending tokens by rank for one chain (Birdeye)')
    .option('--chain <chainId>', `${CHAIN_FLAG_DESCRIPTION}; default solana`)
    .option('--limit <count>', 'Number of tokens to return (default 20, max 50)')
    .option('--out <file>', OUT_FLAG_DESCRIPTION)
    .action(async (options: unknown): Promise<void> => {
      const request = TokenTrendingCommandOptionsSchema.parse(options)
      const response = await tokenDataService.getTrending({
        chainId: request.chain,
        limit: request.limit
      })
      await writeOutput({
        output: ensureJsonTreeString(response),
        outPath: request.out ?? undefined
      })
    })

  return program
}
