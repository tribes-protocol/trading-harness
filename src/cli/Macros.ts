#!/usr/bin/env node

import { stderr, stdout } from 'node:process'

import { Command } from 'commander'

import { API_BASE_URL, API_BEARER_TOKEN } from '@/common/env'
import { MacrosService } from '@/services/MacrosService'
import { ensureJsonTreeString } from '@/utils/lang'

const VERSION = '1.0.0'
const macrosService = new MacrosService({
  apiBaseUrl: API_BASE_URL,
  apiBearerToken: API_BEARER_TOKEN
})
const program = new Command()

program.name('macros-cli').description('Macros market snapshot CLI').version(VERSION)

program
  .command('market')
  .description('Fetch macro market snapshot')
  .action(async (): Promise<void> => {
    const response = await macrosService.getMarketSnapshot()
    const output = ensureJsonTreeString(response)
    stdout.write(`${output}\n`)
  })

async function main(): Promise<void> {
  await program.parseAsync(process.argv)
}

void main().catch((error: unknown) => {
  if (error instanceof Error) {
    stderr.write(`${error.message}\n`)
  } else {
    stderr.write('Unknown error\n')
  }
  process.exit(1)
})
