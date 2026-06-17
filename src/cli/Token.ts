#!/usr/bin/env node

import { Command } from 'commander'

import { API_BASE_URL } from '@/common/Env'
import { writeOutput } from '@/helpers/WriteOutput'
import { TokenService } from '@/services/TokenService'
import { TokenSearchCommandOptionsSchema } from '@/types/Search'
import { ensureJsonTreeString } from '@/utils/Lang'

const VERSION = '1.0.0'
const tokenService = new TokenService({ apiBaseUrl: API_BASE_URL })
const program = new Command()

program.name('token-cli').description('Token search CLI').version(VERSION)

program
  .command('search')
  .description('Search tokens via /search')
  .requiredOption('--query <query>', 'Token query text')
  .option('--out <file>', 'Write output JSON to file')
  .action(async (options: unknown): Promise<void> => {
    const request = TokenSearchCommandOptionsSchema.parse(options)
    const response = await tokenService.search(request.query)
    const output = ensureJsonTreeString(response)
    await writeOutput({
      output,
      outPath: request.out ?? undefined
    })
  })

async function main(): Promise<void> {
  await program.parseAsync(process.argv)
}

void main().catch((error: unknown) => {
  if (error instanceof Error) {
    console.error(error.message)
  } else {
    console.error('Unknown error')
  }
  process.exit(1)
})
