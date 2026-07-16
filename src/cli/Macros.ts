import { stdout } from 'node:process'

import { Command } from 'commander'

import { API_BASE_URL, API_BEARER_TOKEN, FRED_API_KEY } from '@/common/Env'
import { writeCliError, writeOutput } from '@/helpers/WriteOutput'
import { FredService } from '@/services/FredService'
import { MacrosService } from '@/services/MacrosService'
import { FredSeriesCommandOptionsSchema } from '@/types/Fred'
import { ensureJsonTreeString } from '@/utils/Lang'

const VERSION = '1.0.0'

export function buildMacrosCommand(): Command {
  const macrosService = new MacrosService({
    apiBaseUrl: API_BASE_URL,
    apiBearerToken: API_BEARER_TOKEN
  })
  const fredService = new FredService({ apiKey: FRED_API_KEY })

  const program = new Command('macros')
  program.description('Macros market snapshot CLI').version(VERSION)

  program
    .command('market')
    .description('Fetch macro market snapshot (Tribes proxy, direct FRED fallback)')
    .action(async (): Promise<void> => {
      const response = await fetchSnapshotWithFallback(macrosService, fredService)
      const output = ensureJsonTreeString(response)
      stdout.write(`${output}\n`)
    })

  program
    .command('series')
    .description('Fetch latest observations for one FRED series (direct FRED API)')
    .requiredOption('--id <seriesId>', 'FRED series id, e.g. DGS10, VIXCLS, CPIAUCSL')
    .option('--limit <count>', 'Number of latest observations to return (default 12)')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = FredSeriesCommandOptionsSchema.parse(options)
      const response = await fredService.getSeries({
        seriesId: request.id,
        limit: request.limit
      })
      await writeOutput({
        output: ensureJsonTreeString(response),
        outPath: request.out ?? undefined
      })
    })

  return program
}

async function fetchSnapshotWithFallback(
  macrosService: MacrosService,
  fredService: FredService
): Promise<unknown> {
  try {
    return await macrosService.getMarketSnapshot()
  } catch (error: unknown) {
    if (!fredService.isConfigured()) {
      throw error
    }
    const reason = error instanceof Error ? error.message : 'unknown error'
    writeCliError(`macros proxy unavailable (${reason}); falling back to direct FRED`)
    return fredService.getMacrosSnapshotDirect()
  }
}
