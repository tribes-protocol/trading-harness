#!/usr/bin/env node

import { Command } from 'commander'

import { API_BASE_URL, API_BEARER_TOKEN } from '@/common/env'
import { ExchangeAnalystService } from '@/services/ExchangeAnalystService'
import { AskExchangeAnalystCliOptionsSchema } from '@/types/ExchangeAnalyst'

const VERSION = '1.0.0'

const exchangeAnalystService = new ExchangeAnalystService({
  apiBaseUrl: API_BASE_URL,
  apiBearerToken: API_BEARER_TOKEN
})

const program = new Command()

program
  .name('exchange-analyst-cli')
  .description('Expert on exchanges, derivatives, and institutional crypto holdings.')
  .version(VERSION)

program
  .command('ask')
  .description('Send a query to the exchange_analyst specialist agent endpoint')
  .requiredOption('--query <query>', 'Natural-language query for the specialist agent')
  .action(async (options: unknown): Promise<void> => {
    const parsedOptions = AskExchangeAnalystCliOptionsSchema.parse(options)
    const response = await exchangeAnalystService.ask(parsedOptions)
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
