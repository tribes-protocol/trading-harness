import { stdout } from 'node:process'

import { Command } from 'commander'

import { API_BASE_URL, API_BEARER_TOKEN } from '@/common/Env'
import { MacrosService } from '@/services/MacrosService'
import { ensureJsonTreeString } from '@/utils/Lang'

const VERSION = '1.0.0'

export function buildMacrosCommand(): Command {
  const macrosService = new MacrosService({
    apiBaseUrl: API_BASE_URL,
    apiBearerToken: API_BEARER_TOKEN
  })

  const program = new Command('macros')
  program.description('Macros market snapshot CLI').version(VERSION)

  program
    .command('market')
    .description('Fetch macro market snapshot')
    .action(async (): Promise<void> => {
      const response = await macrosService.getMarketSnapshot()
      const output = ensureJsonTreeString(response)
      stdout.write(`${output}\n`)
    })

  return program
}
