#!/usr/bin/env node

import { Command } from 'commander'

import { API_BASE_URL, API_BEARER_TOKEN } from '@/common/env'
import { AlphaScoutService } from '@/services/AlphaScoutService'
import { AskAlphaScoutCliOptionsSchema } from '@/types/AlphaScout'

const VERSION = '1.0.0'

const alphaScoutService = new AlphaScoutService({
  apiBaseUrl: API_BASE_URL,
  apiBearerToken: API_BEARER_TOKEN
})

const program = new Command()

program
  .name('alpha-scout-cli')
  .description('Discovers emerging opportunities and tracks smart money signals.')
  .version(VERSION)

program
  .command('ask')
  .description('Send a query to the alpha_scout specialist agent endpoint')
  .requiredOption('--query <query>', 'Natural-language query for the specialist agent')
  .action(async (options: unknown): Promise<void> => {
    const parsedOptions = AskAlphaScoutCliOptionsSchema.parse(options)
    const response = await alphaScoutService.ask(parsedOptions)
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
