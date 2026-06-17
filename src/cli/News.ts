#!/usr/bin/env node

import { Command } from 'commander'

import { API_BASE_URL } from '@/common/env'
import { writeCliError, writeOutput } from '@/helpers/WriteOutput'
import { NewsService } from '@/services/NewsService'
import { FetchNewsCommandOptionsSchema } from '@/types/News'
import { ensureJsonTreeString } from '@/utils/lang'
import { toAssetIdentity } from '@/utils/News'

const VERSION = '1.0.0'
const newsService = new NewsService({ apiBaseUrl: API_BASE_URL })
const program = new Command()

program.name('news-cli').description('Asset news CLI').version(VERSION)

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

async function main(): Promise<void> {
  await program.parseAsync(process.argv)
}

void main().catch((error: unknown) => {
  if (error instanceof Error) {
    writeCliError(error.message)
  } else {
    writeCliError('Unknown error')
  }
  process.exit(1)
})
