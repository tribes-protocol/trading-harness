import { Command } from 'commander'

import { API_BASE_URL, API_BEARER_TOKEN } from '@/common/Env'
import { AnalystService } from '@/services/AnalystService'
import { type AnalystConfig, AskAnalystCliOptionsSchema } from '@/types/Analyst'

const VERSION = '1.0.0'

export function runAnalystCli(config: AnalystConfig): void {
  const service = new AnalystService({
    apiBaseUrl: API_BASE_URL,
    apiBearerToken: API_BEARER_TOKEN,
    config
  })

  const program = new Command()
  program.name(config.cliName).description(config.description).version(VERSION)

  program
    .command('ask')
    .description(config.askDescription)
    .requiredOption('--query <query>', 'Natural-language query for the specialist agent')
    .action(async (options: unknown): Promise<void> => {
      const parsedOptions = AskAnalystCliOptionsSchema.parse(options)
      const response = await service.ask(parsedOptions)
      process.stdout.write(`${response}\n`)
    })

  void program.parseAsync(process.argv).catch((error: unknown) => {
    if (error instanceof Error) {
      process.stderr.write(`${error.message}\n`)
    } else {
      process.stderr.write('Unknown error\n')
    }
    process.exit(1)
  })
}
