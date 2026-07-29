import { Command } from 'commander'

import { HEURIST_API_KEY } from '@/common/Env'
import { writeOutput } from '@/helpers/WriteOutput'
import { HeuristService } from '@/services/HeuristService'
import {
  MeshAccountCommandOptionsSchema,
  MeshBasisCommandOptionsSchema,
  MeshChainCommandOptionsSchema,
  MeshFundingCommandOptionsSchema,
  MeshMentionsCommandOptionsSchema,
  MeshProtocolCommandOptionsSchema,
  MeshTokenSafetyCommandOptionsSchema,
  MeshTrendingCommandOptionsSchema,
  MeshYieldsCommandOptionsSchema
} from '@/types/Heurist'
import { ensureJsonTreeString } from '@/utils/Lang'

const VERSION = '1.0.0'

const DEFAULT_MENTION_DAYS = 30
const DEFAULT_MENTION_LIMIT = 20
const DEFAULT_YIELD_LIMIT = 20

function collect(value: string, previous: string[]): string[] {
  return [...previous, value]
}

export function buildMeshCommand(): Command {
  const service = new HeuristService({ apiKey: HEURIST_API_KEY })

  const program = new Command('mesh')
  program
    .description(
      'Heurist Mesh: cross-venue perp funding, smart-account social intel, token safety, DeFi metrics (structured JSON)'
    )
    .version(VERSION)

  program
    .command('funding')
    .description(
      'Binance perp funding rate and APR. Without --symbol, the five majors (BTC/ETH/SOL/BNB/XRP) — that set is fixed upstream, not a venue sweep'
    )
    .option('--symbol <symbol>', 'Perp ticker, e.g. BTC or BTCUSDT (quote is forced to USDT)')
    .option('--oi', 'Append an open-interest trend summary (English prose, not numbers)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = MeshFundingCommandOptionsSchema.parse(options)
      const funding =
        request.symbol === null || request.symbol === undefined
          ? await service.getAllFundingRates()
          : await service.getSymbolFunding({
              symbol: request.symbol,
              includeOpenInterest: request.oi ?? false
            })
      await writeOutput({
        output: ensureJsonTreeString(funding),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('basis')
    .description('Spot-versus-futures carry candidates above a funding floor')
    .option('--min-rate <n>', 'Minimum funding rate to report', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = MeshBasisCommandOptionsSchema.parse(options)
      const opportunities = await service.findBasisOpportunities({
        minFundingRate: request.minRate ?? null
      })
      await writeOutput({
        output: ensureJsonTreeString(opportunities),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('mentions')
    .description(
      'Mentions of up to three keywords by influential accounts only, never the full firehose'
    )
    .requiredOption(
      '--keyword <word>',
      'Word or short phrase, repeatable up to 3 times. A full sentence returns nothing',
      collect,
      []
    )
    .option('--days <n>', 'Lookback window in days (default 30)', (value) => Number(value))
    .option('--limit <n>', 'Rows to return, 1-100 (default 20)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = MeshMentionsCommandOptionsSchema.parse(options)
      const mentions = await service.searchMentions({
        keywords: request.keyword,
        daysAgo: request.days ?? DEFAULT_MENTION_DAYS,
        limit: request.limit ?? DEFAULT_MENTION_LIMIT
      })
      await writeOutput({
        output: ensureJsonTreeString(mentions),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('account')
    .description('Engagement stats and recent mentions for one X account')
    .requiredOption('--username <handle>', 'Handle without the @')
    .option('--days <n>', 'Lookback window in days (default 30)', (value) => Number(value))
    .option('--limit <n>', 'Mentions to return, 1-100 (default 20)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = MeshAccountCommandOptionsSchema.parse(options)
      const account = await service.searchAccount({
        username: request.username,
        daysAgo: request.days ?? DEFAULT_MENTION_DAYS,
        limit: request.limit ?? DEFAULT_MENTION_LIMIT
      })
      await writeOutput({
        output: ensureJsonTreeString(account),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('trending-tokens')
    .description(
      'Tickers trending among influential accounts. Names only — no counts or sentiment, so treat it as a watchlist seed'
    )
    .option('--window <window>', 'Time window, e.g. 24h (default 24h)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = MeshTrendingCommandOptionsSchema.parse(options)
      const trending = await service.getTrendingTokens({ timeWindow: request.window ?? null })
      await writeOutput({
        output: ensureJsonTreeString(trending),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('token-safety')
    .description('Honeypot, mint-authority, tax and LP-lock screening for one token contract')
    .requiredOption('--address <address>', 'Token contract address')
    .option('--chain-id <id>', 'Chain id, e.g. 1 for Ethereum or 8453 for Base')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = MeshTokenSafetyCommandOptionsSchema.parse(options)
      const security = await service.getTokenSecurity({
        contractAddress: request.address,
        chainId: request.chainId ?? null
      })
      await writeOutput({
        output: ensureJsonTreeString(security),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('protocol')
    .description('TVL and revenue metrics for one DeFi protocol')
    .requiredOption('--protocol <slug>', 'DefiLlama protocol slug, e.g. aave')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = MeshProtocolCommandOptionsSchema.parse(options)
      const metrics = await service.getProtocolMetrics({ protocol: request.protocol })
      await writeOutput({
        output: ensureJsonTreeString(metrics),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('chain')
    .description('Aggregate TVL and activity metrics for one chain')
    .requiredOption('--chain <name>', 'Chain name, e.g. ethereum')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = MeshChainCommandOptionsSchema.parse(options)
      const metrics = await service.getChainMetrics({ chain: request.chain })
      await writeOutput({
        output: ensureJsonTreeString(metrics),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('yields')
    .description(
      'Yield pools filtered by chain, project or symbol — the cash leg for a carry trade'
    )
    .option('--chain <name>', 'Chain filter, repeatable', collect, [])
    .option('--project <slug>', 'Project filter, repeatable, e.g. aave-v3', collect, [])
    .option('--symbol <symbol>', 'Pool symbol filter, repeatable', collect, [])
    .option('--stablecoin', 'Only stablecoin pools')
    .option('--limit <n>', 'Pools to return, 1-100 (default 20)', (value) => Number(value))
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = MeshYieldsCommandOptionsSchema.parse(options)
      const pools = await service.searchYieldPools({
        chains: emptyToNull(request.chain),
        projects: emptyToNull(request.project),
        symbols: emptyToNull(request.symbol),
        stablecoin: request.stablecoin ?? null,
        limit: request.limit ?? DEFAULT_YIELD_LIMIT
      })
      await writeOutput({
        output: ensureJsonTreeString(pools),
        outPath: request.out ?? undefined
      })
    })

  return program
}

// A repeatable option the caller never passed arrives as [], which DefiLlama
// would read as "match nothing" rather than "no filter" — send no key instead.
function emptyToNull(values: string[] | null | undefined): string[] | null {
  return values === null || values === undefined || values.length === 0 ? null : values
}
