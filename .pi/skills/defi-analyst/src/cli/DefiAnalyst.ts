#!/usr/bin/env node

import { Command } from 'commander'

import { API_BASE_URL, API_BEARER_TOKEN } from '@/common/env'
import { DefiAnalystService } from '@/services/DefiAnalystService'
import { AskDefiAnalystCliOptionsSchema } from '@/types/DefiAnalyst'

const VERSION = '1.0.0'

const defiAnalystService = new DefiAnalystService({
  apiBaseUrl: API_BASE_URL,
  apiBearerToken: API_BEARER_TOKEN
})

const program = new Command()

program
  .name('defi-analyst-cli')
  .description('Expert on DEX activity and liquidity pools.')
  .version(VERSION)

program
  .command('ask')
  .description('Send a query to the defi_analyst specialist agent endpoint')
  .requiredOption('--query <query>', 'Natural-language query for the specialist agent')
  .action(async (options: unknown): Promise<void> => {
    const parsedOptions = AskDefiAnalystCliOptionsSchema.parse(options)
    const response = await defiAnalystService.ask(parsedOptions)
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
