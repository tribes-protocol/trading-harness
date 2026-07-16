import { Command } from 'commander'

import { API_BASE_URL, NEWSDATAIO_API_KEY } from '@/common/Env'
import { writeOutput } from '@/helpers/WriteOutput'
import { NewsDataIoService } from '@/services/NewsDataIoService'
import { NewsService } from '@/services/NewsService'
import { FetchNewsCommandOptionsSchema } from '@/types/News'
import { NewsDataIoHeadlinesCommandOptionsSchema } from '@/types/NewsDataIo'
import { ensureJsonTreeString } from '@/utils/Lang'
import { toAssetIdentity } from '@/utils/News'

const VERSION = '1.0.0'

export function buildNewsCommand(): Command {
  const newsService = new NewsService({ apiBaseUrl: API_BASE_URL })
  const newsDataIoService = new NewsDataIoService({ apiKey: NEWSDATAIO_API_KEY })

  const program = new Command('news')
  program.description('Asset news CLI').version(VERSION)

  program
    .command('fetch')
    .description('Fetch asset news and poll while still analyzing')
    .requiredOption('--kind <kind>', 'Asset kind: token | perp | stock')
    .option('--chain-id <chainId>', 'Token chain id (required when --kind token)')
    .option('--token-id <tokenId>', 'Token id/address/mint (required when --kind token)')
    .option('--coin <coin>', 'Perp coin (required when --kind perp)')
    .option('--ticker <ticker>', 'Stock ticker (required when --kind stock)')
    .option('--cursor <cursor>', 'Pagination cursor')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = FetchNewsCommandOptionsSchema.parse(options)
      const response = await newsService.fetchNewsUntilCompleted({
        assetIdentity: toAssetIdentity(request),
        cursor: request.cursor
      })
      await writeOutput({
        output: ensureJsonTreeString(response),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('headlines')
    .description('Fetch raw headlines directly from NewsData.io (latest or crypto endpoint)')
    .option('--query <text>', 'Keyword search, e.g. "bitcoin etf"')
    .option(
      '--coin <symbols>',
      'Up to 5 lowercase coin symbols, comma-separated (e.g. btc,eth); routes to the crypto endpoint'
    )
    .option(
      '--category <categories>',
      'Up to 5 categories, comma-separated (e.g. business,technology); not with --coin'
    )
    .option(
      '--country <codes>',
      'Up to 5 ISO-3166 alpha-2 country codes, comma-separated (e.g. us,gb); not with --coin'
    )
    .option('--language <codes>', 'Up to 5 language codes, comma-separated (default en)')
    .option('--timeframe <hours>', 'Look-back window in hours (1-48)')
    .option('--size <count>', 'Headlines per page (default 10, max 50)')
    .option('--page <token>', 'Opaque nextPage token from a previous response')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = NewsDataIoHeadlinesCommandOptionsSchema.parse(options)
      const response = await newsDataIoService.getHeadlines({
        query: request.query ?? null,
        coins: request.coin ?? [],
        categories: request.category ?? [],
        countries: request.country ?? [],
        languages: request.language,
        timeframeHours: request.timeframe ?? null,
        size: request.size,
        page: request.page ?? null
      })
      await writeOutput({
        output: ensureJsonTreeString(response),
        outPath: request.out ?? undefined
      })
    })

  return program
}
