#!/usr/bin/env node

import { Command } from 'commander'

import { API_BASE_URL, API_BEARER_TOKEN } from '@/common/env'
import { TechnicalAnalystService } from '@/services/TechnicalAnalystService'
import { AskTechnicalAnalystCliOptionsSchema } from '@/types/TechnicalAnalyst'

const VERSION = '1.0.0'

const technicalAnalystService = new TechnicalAnalystService({
  apiBaseUrl: API_BASE_URL,
  apiBearerToken: API_BEARER_TOKEN
})

const program = new Command()

program
  .name('technical-analyst-cli')
  .description('Expert technical analyst for OHLCV indicators and backtesting.')
  .version(VERSION)

program
  .command('ask')
  .description('Send a query to the technical_analyst specialist agent endpoint')
  .requiredOption('--query <query>', 'Natural-language query for the specialist agent')
  .action(async (options: unknown): Promise<void> => {
    const parsedOptions = AskTechnicalAnalystCliOptionsSchema.parse(options)
    const response = await technicalAnalystService.ask(parsedOptions)
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
