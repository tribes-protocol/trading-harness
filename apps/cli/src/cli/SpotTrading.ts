import { Command } from 'commander'

import { API_BASE_URL } from '@/common/Env'
import { writeOutput } from '@/helpers/WriteOutput'
import { SwapBridgeService } from '@/services/SwapBridgeService'
import { QuoteCliOptionInputSchema } from '@/types/SpotTradingCli'
import { ensureJsonTreeString } from '@/utils/Lang'

const VERSION = '1.0.0'

export function buildSpotTradingCommand(): Command {
  const service = new SwapBridgeService({ apiBaseUrl: API_BASE_URL })

  const program = new Command('spot-trading')
  program.description('Guarded spot trading CLI quote helper').version(VERSION)

  program
    .command('quote')
    .description('Request quote from /trade/quote')
    .requiredOption('--from-chain <chain>', 'From chain id (e.g. 1, 8453, solana)')
    .requiredOption('--to-chain <chain>', 'To chain id (e.g. 1, 8453, solana)')
    .requiredOption('--from-token <token>', 'From token address/mint or "network"')
    .requiredOption('--to-token <token>', 'To token address/mint or "network"')
    .requiredOption('--from-amount <amount>', 'From token amount in base units')
    .requiredOption('--from-address <address>', 'Source wallet address')
    .requiredOption('--to-address <address>', 'Destination wallet address')
    .option('--slippage <value>', 'Optional slippage value')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = QuoteCliOptionInputSchema.parse(options)
      const response = await service.quote(request)
      await writeOutput({
        output: ensureJsonTreeString(response),
        outPath: request.out ?? undefined
      })
    })

  return program
}
