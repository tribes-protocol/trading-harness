#!/usr/bin/env node

import { Command } from 'commander'

import { API_BASE_URL, API_BEARER_TOKEN } from '@/common/env'
import { TokenAnalystService } from '@/services/TokenAnalystService'
import { AskTokenAnalystCliOptionsSchema } from '@/types/TokenAnalyst'

const VERSION = '1.0.0'

const tokenAnalystService = new TokenAnalystService({
  apiBaseUrl: API_BASE_URL,
  apiBearerToken: API_BEARER_TOKEN
})

const program = new Command()

program
  .name('token-analyst-cli')
  .description(
    'Token specialist that deep-dives into token price, security, flows, and trading context.'
  )
  .version(VERSION)

program
  .command('ask')
  .description('Send a query to the token_analyst specialist agent endpoint')
  .requiredOption('--query <query>', 'Natural-language query for the specialist agent')
  .action(async (options: unknown): Promise<void> => {
    const parsedOptions = AskTokenAnalystCliOptionsSchema.parse(options)
    const response = await tokenAnalystService.ask(parsedOptions)
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
