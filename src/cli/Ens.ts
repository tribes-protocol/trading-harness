import { Command } from 'commander'
import { mainnet } from 'viem/chains'

import { EVM_REGISTRY } from '@/common/Web3'
import { writeOutput } from '@/helpers/WriteOutput'
import { EnsService } from '@/services/EnsService'
import { EnsResolveCommandOptionsSchema, EnsReverseCommandOptionsSchema } from '@/types/Ens'
import { ensureJsonTreeString } from '@/utils/Lang'

const VERSION = '1.0.0'

export function buildEnsCommand(): Command {
  const service = new EnsService({ client: EVM_REGISTRY.getPublicClient(mainnet.id) })

  const program = new Command('ens')
  program
    .description(
      'ENS identity: forward and reverse resolution on Ethereum mainnet (structured JSON)'
    )
    .version(VERSION)

  program
    .command('resolve')
    .description('Resolve an ENS name to its address, avatar, and url/twitter/github records')
    .requiredOption('--name <name>', 'ENS name, e.g. vitalik.eth')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = EnsResolveCommandOptionsSchema.parse(options)
      const resolution = await service.resolve({ name: request.name })
      await writeOutput({
        output: ensureJsonTreeString(resolution),
        outPath: request.out ?? undefined
      })
    })

  program
    .command('reverse')
    .description('Primary ENS name and owned domains for an address')
    .requiredOption('--address <address>', '0x-prefixed Ethereum address')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = EnsReverseCommandOptionsSchema.parse(options)
      const lookup = await service.reverse({ address: request.address })
      await writeOutput({
        output: ensureJsonTreeString(lookup),
        outPath: request.out ?? undefined
      })
    })

  return program
}
