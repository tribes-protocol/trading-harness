#!/usr/bin/env node

import { Command } from 'commander'

import { API_BASE_URL, API_BEARER_TOKEN } from '@/common/env'
import { MarketStrategistService } from '@/services/MarketStrategistService'
import { AskMarketStrategistCliOptionsSchema } from '@/types/MarketStrategist'

const VERSION = '1.0.0'

const marketStrategistService = new MarketStrategistService({
  apiBaseUrl: API_BASE_URL,
  apiBearerToken: API_BEARER_TOKEN
})

const program = new Command()

program
  .name('market-strategist-cli')
  .description('Expert on the big-picture crypto market.')
  .version(VERSION)

program
  .command('ask')
  .description('Send a query to the market_strategist specialist agent endpoint')
  .requiredOption('--query <query>', 'Natural-language query for the specialist agent')
  .action(async (options: unknown): Promise<void> => {
    const parsedOptions = AskMarketStrategistCliOptionsSchema.parse(options)
    const response = await marketStrategistService.ask(parsedOptions)
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
