import { Command } from 'commander'

import { API_BASE_URL, API_BEARER_TOKEN } from '@/common/Env'
import { WebSearchService } from '@/services/WebSearchService'
import { WebExtractCliOptionsSchema, WebSearchCliOptionsSchema } from '@/types/WebSearch'
import { ensureJsonTreeString } from '@/utils/Lang'

const VERSION = '1.0.0'

export function buildWebSearchCommand(): Command {
  const webSearchService = new WebSearchService({
    apiBaseUrl: API_BASE_URL,
    apiBearerToken: API_BEARER_TOKEN
  })

  const program = new Command('web-search')
  program.description('Web search and page extraction via the Tavily proxy').version(VERSION)

  program
    .command('search')
    .description('Search the web and return ranked results (title, url, snippet)')
    .requiredOption('--query <query>', 'Natural-language search query')
    .action(async (options: unknown): Promise<void> => {
      const { query } = WebSearchCliOptionsSchema.parse(options)
      const result = await webSearchService.search(query)
      process.stdout.write(`${ensureJsonTreeString(result)}\n`)
    })

  program
    .command('extract')
    .description('Extract the readable text content of a specific page URL')
    .requiredOption('--url <url>', 'URL to extract')
    .action(async (options: unknown): Promise<void> => {
      const { url } = WebExtractCliOptionsSchema.parse(options)
      const result = await webSearchService.extract(url)
      process.stdout.write(`${ensureJsonTreeString(result)}\n`)
    })

  return program
}
