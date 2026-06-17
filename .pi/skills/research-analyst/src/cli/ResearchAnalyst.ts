#!/usr/bin/env node

import { Command } from 'commander'

import { API_BASE_URL, API_BEARER_TOKEN } from '@/common/env'
import { ResearchAnalystService } from '@/services/ResearchAnalystService'
import { AskResearchAnalystCliOptionsSchema } from '@/types/ResearchAnalyst'

const VERSION = '1.0.0'

const researchAnalystService = new ResearchAnalystService({
  apiBaseUrl: API_BASE_URL,
  apiBearerToken: API_BEARER_TOKEN
})

const program = new Command()

program
  .name('research-analyst-cli')
  .description('Expert on ENS identity resolution and web-based financial research.')
  .version(VERSION)

program
  .command('ask')
  .description('Send a query to the research_analyst specialist agent endpoint')
  .requiredOption('--query <query>', 'Natural-language query for the specialist agent')
  .action(async (options: unknown): Promise<void> => {
    const parsedOptions = AskResearchAnalystCliOptionsSchema.parse(options)
    const response = await researchAnalystService.ask(parsedOptions)
    process.stdout.write(`${response}\n`)
  })

async function main(): Promise<void> {
  await program.parseAsync(process.argv)
}

void main().catch((error: unknown) => {
  if (error instanceof Error) {
    process.stderr.write(`${error.message}\n`)
  } else {
    process.stderr.write('Unknown error\n')
  }
  process.exit(1)
})
