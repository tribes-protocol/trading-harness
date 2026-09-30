import { Command } from 'commander'

import {
  API_BASE_URL,
  API_BEARER_TOKEN,
  BIRDEYE_API_KEY,
  MARKETSTACK_API_KEY,
  PRIVY_APP_ID
} from '@/common/Env'
import { writeOutput } from '@/helpers/WriteOutput'
import {
  type AssetServices,
  candlesContractSources,
  candlesPoolSources,
  candlesTickerSources,
  holdersSources,
  newListingSources,
  priceContractSources,
  pricePerpSources,
  priceTickerSources,
  profileContractSources,
  profileTickerSources,
  searchSources,
  trendingSources
} from '@/routing/Adapters'
import { type CandleSource, type PriceSource, type ProfileSource } from '@/routing/Capabilities'
import { resolveChain, type ResolvedChain } from '@/routing/Chains'
import { resolveCapability } from '@/routing/Router'
import { BirdeyeService } from '@/services/BirdeyeService'
import { HyperliquidService } from '@/services/HyperliquidService'
import { StocksService } from '@/services/StocksService'
import { TransactionService } from '@/services/TransactionService'
import {
  type AssetCandlesCommandOptions,
  AssetCandlesCommandOptionsSchema,
  AssetCandlesSchema,
  AssetHoldersCommandOptionsSchema,
  AssetHoldersListSchema,
  AssetNewCommandOptionsSchema,
  AssetNewListSchema,
  type AssetPriceCommandOptions,
  AssetPriceCommandOptionsSchema,
  AssetPriceQuoteSchema,
  type AssetProfileCommandOptions,
  AssetProfileCommandOptionsSchema,
  AssetProfileSchema,
  AssetSearchCommandOptionsSchema,
  AssetSearchResultsSchema,
  type AssetTimeframe,
  AssetTrendingCommandOptionsSchema,
  AssetTrendingListSchema
} from '@/types/Capability'
import { ensureJsonTreeString, isNullish } from '@/utils/Lang'

const VERSION = '1.0.0'

const DEFAULT_TIMEFRAME: AssetTimeframe = '1h'
const DEFAULT_LIST_LIMIT = 10
const DEFAULT_SEARCH_LIMIT = 20
const DEFAULT_HOLDERS_LIMIT = 20

const CHAIN_FLAG_HELP =
  'Canonical chain: solana|ethereum|base|bsc|arbitrum|polygon|optimism|avalanche'

function createAssetServices(): AssetServices {
  return {
    birdeye: new BirdeyeService({ apiKey: BIRDEYE_API_KEY }),
    stocks: new StocksService({ apiKey: MARKETSTACK_API_KEY }),
    hyperliquid: new HyperliquidService({
      transaction: new TransactionService({
        apiBaseUrl: API_BASE_URL,
        apiBearerToken: API_BEARER_TOKEN,
        privyAppId: PRIVY_APP_ID
      })
    })
  }
}

// The option schemas already enforce exactly-one-identifier and
// address/pool-requires-chain; this narrows for TypeScript.
function requireChain(chain: string | null | undefined): ResolvedChain {
  if (isNullish(chain)) {
    throw new Error('--chain is required for this identifier')
  }
  return resolveChain(chain)
}

function pickPriceSources(
  services: AssetServices,
  request: AssetPriceCommandOptions
): PriceSource[] {
  if (!isNullish(request.address)) {
    return priceContractSources({
      services,
      address: request.address,
      chain: requireChain(request.chain)
    })
  }
  if (!isNullish(request.ticker)) {
    return priceTickerSources({ services, ticker: request.ticker })
  }
  if (!isNullish(request.perp)) {
    return pricePerpSources({ services, perp: request.perp })
  }
  throw new Error('provide exactly one identifier: --address --chain | --ticker | --perp')
}

function pickCandleSources(
  services: AssetServices,
  request: AssetCandlesCommandOptions
): CandleSource[] {
  const timeframe = request.timeframe ?? DEFAULT_TIMEFRAME
  if (!isNullish(request.address)) {
    return candlesContractSources({
      services,
      address: request.address,
      chain: requireChain(request.chain),
      timeframe
    })
  }
  if (!isNullish(request.pool)) {
    return candlesPoolSources({
      services,
      pool: request.pool,
      chain: requireChain(request.chain),
      timeframe
    })
  }
  if (!isNullish(request.ticker)) {
    return candlesTickerSources({ services, ticker: request.ticker })
  }
  throw new Error('provide exactly one identifier: --address --chain | --ticker | --pool --chain')
}

function pickProfileSources(
  services: AssetServices,
  request: AssetProfileCommandOptions
): ProfileSource[] {
  if (!isNullish(request.address)) {
    return profileContractSources({
      services,
      address: request.address,
      chain: requireChain(request.chain)
    })
  }
  if (!isNullish(request.ticker)) {
    return profileTickerSources({ services, ticker: request.ticker })
  }
  throw new Error('provide exactly one identifier: --address --chain | --ticker')
}

export function buildAssetCommand(): Command {
  const services = createAssetServices()

  const program = new Command('asset')
  program
    .description(
      'Capability-first asset data (structured JSON). ' +
        'Identify the asset by --address --chain (token contract), --ticker (stock), ' +
        '--perp (Hyperliquid), or --pool --chain (DEX pair candles).'
    )
    .version(VERSION)

  program
    .command('price')
    .description('Price quote for any asset: token contract, stock ticker, or perp')
    .option('--address <address>', 'Token contract address (requires --chain)')
    .option('--chain <chain>', CHAIN_FLAG_HELP)
    .option('--ticker <symbol>', 'Stock ticker, e.g. AAPL')
    .option('--perp <coin>', 'Hyperliquid perp coin, e.g. BTC or xyz:AAPL')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = AssetPriceCommandOptionsSchema.parse(options)
      const result = AssetPriceQuoteSchema.parse(
        await resolveCapability({
          capability: 'price',
          sources: pickPriceSources(services, request)
        })
      )
      await writeOutput({ output: ensureJsonTreeString(result), outPath: request.out ?? undefined })
    })

  program
    .command('candles')
    .description('OHLCV candles ({t,o,h,l,c,v}, t epoch ms) for any asset class')
    .option('--address <address>', 'Token contract address (requires --chain)')
    .option('--chain <chain>', CHAIN_FLAG_HELP)
    .option('--ticker <symbol>', 'Stock ticker, e.g. AAPL (EOD daily candles)')
    .option('--pool <address>', 'DEX pool/pair address (requires --chain)')
    .option('--timeframe <tf>', 'Candle timeframe 1m|5m|15m|1h|4h|1d|1w (default 1h)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = AssetCandlesCommandOptionsSchema.parse(options)
      const result = AssetCandlesSchema.parse(
        await resolveCapability({
          capability: 'candles',
          sources: pickCandleSources(services, request)
        })
      )
      await writeOutput({ output: ensureJsonTreeString(result), outPath: request.out ?? undefined })
    })

  program
    .command('profile')
    .description('Identity + market profile for a token contract or stock ticker')
    .option('--address <address>', 'Token contract address (requires --chain)')
    .option('--chain <chain>', CHAIN_FLAG_HELP)
    .option('--ticker <symbol>', 'Stock ticker, e.g. AAPL')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = AssetProfileCommandOptionsSchema.parse(options)
      const result = AssetProfileSchema.parse(
        await resolveCapability({
          capability: 'profile',
          sources: pickProfileSources(services, request)
        })
      )
      await writeOutput({ output: ensureJsonTreeString(result), outPath: request.out ?? undefined })
    })

  program
    .command('trending')
    .description('Trending on-chain tokens')
    .option('--chain <chain>', CHAIN_FLAG_HELP)
    .option('--limit <n>', 'Rows to return, 1-50 (default 10)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = AssetTrendingCommandOptionsSchema.parse(options)
      const chain = isNullish(request.chain) ? null : resolveChain(request.chain)
      const result = AssetTrendingListSchema.parse(
        await resolveCapability({
          capability: 'trending',
          sources: trendingSources({
            services,
            chain,
            limit: request.limit ?? DEFAULT_LIST_LIMIT
          })
        })
      )
      await writeOutput({ output: ensureJsonTreeString(result), outPath: request.out ?? undefined })
    })

  program
    .command('new')
    .description('New on-chain token listings')
    .option('--limit <n>', 'Rows to return, 1-50 (default 10)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = AssetNewCommandOptionsSchema.parse(options)
      const result = AssetNewListSchema.parse(
        await resolveCapability({
          capability: 'new',
          sources: newListingSources({
            services,
            limit: request.limit ?? DEFAULT_LIST_LIMIT
          })
        })
      )
      await writeOutput({ output: ensureJsonTreeString(result), outPath: request.out ?? undefined })
    })

  program
    .command('search')
    .description('Resolve names/symbols to on-chain tokens (BirdEye)')
    .requiredOption('--query <text>', 'Name or symbol to search for')
    .requiredOption('--chain <chain>', CHAIN_FLAG_HELP)
    .option('--limit <n>', 'Rows to return, 1-50 (default 20)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = AssetSearchCommandOptionsSchema.parse(options)
      const result = AssetSearchResultsSchema.parse(
        await resolveCapability({
          capability: 'search',
          sources: searchSources({
            services,
            query: request.query,
            chain: resolveChain(request.chain),
            limit: request.limit ?? DEFAULT_SEARCH_LIMIT
          })
        })
      )
      await writeOutput({ output: ensureJsonTreeString(result), outPath: request.out ?? undefined })
    })

  program
    .command('holders')
    .description('Top holders for a token contract (BirdEye)')
    .requiredOption('--address <address>', 'Token contract address')
    .requiredOption('--chain <chain>', CHAIN_FLAG_HELP)
    .option('--limit <n>', 'Holders to return, 1-100 (default 20)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = AssetHoldersCommandOptionsSchema.parse(options)
      const result = AssetHoldersListSchema.parse(
        await resolveCapability({
          capability: 'holders',
          sources: holdersSources({
            services,
            address: request.address,
            chain: resolveChain(request.chain),
            limit: request.limit ?? DEFAULT_HOLDERS_LIMIT
          })
        })
      )
      await writeOutput({ output: ensureJsonTreeString(result), outPath: request.out ?? undefined })
    })

  return program
}
