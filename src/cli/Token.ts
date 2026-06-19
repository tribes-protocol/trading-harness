import { Command } from 'commander'

import { API_BASE_URL } from '@/common/Env'
import { writeOutput } from '@/helpers/WriteOutput'
import { TokenService } from '@/services/TokenService'
import { TokenSearchCommandOptionsSchema } from '@/types/Search'
import { ensureJsonTreeString } from '@/utils/Lang'

const VERSION = '1.0.0'

export function buildTokenCommand(): Command {
  const tokenService = new TokenService({ apiBaseUrl: API_BASE_URL })

  const program = new Command('token')
  program.description('Token search CLI').version(VERSION)

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

  return program
}
