import { Command } from 'commander'

import { APIFY_API_KEY } from '@/common/Env'
import { writeOutput } from '@/helpers/WriteOutput'
import { ApifyService } from '@/services/ApifyService'
import { APIFY_MAX_TWEETS, SocialTweetsCommandOptionsSchema } from '@/types/Apify'
import { ensureJsonTreeString } from '@/utils/Lang'

const VERSION = '1.0.0'

const DEFAULT_LIMIT = 100

function collect(value: string, previous: string[]): string[] {
  return [...previous, value]
}

export function buildSocialCommand(): Command {
  const service = new ApifyService({ apiKey: APIFY_API_KEY })

  const program = new Command('social')
  program
    .description('X/Twitter chatter for sentiment reads, via the Apify tweet scraper')
    .version(VERSION)

  program
    .command('tweets')
    .description(
      'Tweets matching cashtags, search terms or handles. Cost is linear in --limit, so keep it tight'
    )
    .option(
      '--query <term>',
      "Search term or cashtag, repeatable — e.g. --query '$BTC' --query 'bitcoin etf'",
      collect,
      []
    )
    .option('--handle <handle>', 'X handle without the @, repeatable', collect, [])
    .option(
      '--limit <n>',
      `Tweets to return, 1-${APIFY_MAX_TWEETS} (default ${DEFAULT_LIMIT}). This is a spend control: the run is billed per tweet`,
      (value) => Number(value)
    )
    .option('--since <date>', 'Only tweets after this date, YYYY-MM-DD')
    .option('--until <date>', 'Only tweets before this date, YYYY-MM-DD')
    .option('--sort <order>', 'Latest or Top (default Latest)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = SocialTweetsCommandOptionsSchema.parse(options)
      const tweets = await service.searchTweets({
        queries: request.query ?? [],
        handles: request.handle ?? [],
        limit: request.limit ?? DEFAULT_LIMIT,
        since: request.since ?? null,
        until: request.until ?? null,
        sort: request.sort ?? null
      })
      await writeOutput({
        output: ensureJsonTreeString(tweets),
        outPath: request.out ?? undefined
      })
    })

  return program
}
