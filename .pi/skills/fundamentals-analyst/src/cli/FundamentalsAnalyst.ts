#!/usr/bin/env node

import { Command } from 'commander'

import { API_BASE_URL, API_BEARER_TOKEN } from '@/common/env'
import { FundamentalsAnalystService } from '@/services/FundamentalsAnalystService'
import { AskFundamentalsAnalystCliOptionsSchema } from '@/types/FundamentalsAnalyst'

const VERSION = '1.0.0'

const fundamentalsAnalystService = new FundamentalsAnalystService({
  apiBaseUrl: API_BASE_URL,
  apiBearerToken: API_BEARER_TOKEN
})

const program = new Command()

program
  .name('fundamentals-analyst-cli')
  .description('Expert on in-depth coin research via CoinGecko data.')
  .version(VERSION)

program
  .command('ask')
  .description('Send a query to the fundamentals_analyst specialist agent endpoint')
  .requiredOption('--query <query>', 'Natural-language query for the specialist agent')
  .action(async (options: unknown): Promise<void> => {
    const parsedOptions = AskFundamentalsAnalystCliOptionsSchema.parse(options)
    const response = await fundamentalsAnalystService.ask(parsedOptions)
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
