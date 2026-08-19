import { basename } from 'node:path'

import { Command } from 'commander'

import { writeOutput } from '@/helpers/WriteOutput'
import { OrgService } from '@/services/OrgService'
import type { OrgValidateKind } from '@/types/Org'
import { OrgValidateCommandOptionsSchema } from '@/types/Org'
import { ensureJsonTreeString } from '@/utils/Lang'

const VERSION = '1.0.0'

export function buildOrgCommand(): Command {
  const orgService = new OrgService()

  const program = new Command('org')
  program
    .description('Machine-validate trading-org artifact files against the org-protocol envelope')
    .version(VERSION)

  program
    .command('validate')
    .description(
      "Validate an org artifact (or '<id>.ack.json' sidecar, auto-detected) and print the verdict"
    )
    .argument('<file>', 'Path to the artifact or ack JSON file')
    .option('--kind <kind>', "Override auto-detection: 'artifact' or 'ack'")
    .option('--out <file>', 'Write output JSON to file')
    .action(async (file: string, options: unknown): Promise<void> => {
      const request = OrgValidateCommandOptionsSchema.parse(options)
      const detectedKind: OrgValidateKind = basename(file).endsWith('.ack.json')
        ? 'ack'
        : 'artifact'
      const kind = request.kind ?? detectedKind
      const result =
        kind === 'ack'
          ? await orgService.validateAck(file)
          : await orgService.validateArtifact(file)
      await writeOutput({
        output: ensureJsonTreeString(result),
        outPath: request.out ?? undefined
      })
      // The verdict still prints; the exit code lets scripts gate on it.
      if (!result.valid) {
        process.exitCode = 1
      }
    })

  return program
}
