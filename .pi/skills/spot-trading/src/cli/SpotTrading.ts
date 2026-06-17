#!/usr/bin/env node

import { ensureJsonTreeString } from '@shared/utils/lang'
import { Command } from 'commander'

import { API_BASE_URL } from '@/common/env'
import { writeCliError, writeOutput } from '@/helpers/WriteOutput'
import { SwapBridgeService } from '@/services/SwapBridgeService'
import { QuoteCliOptionInputSchema } from '@/types/SpotTradingCli'

const service = new SwapBridgeService({ apiBaseUrl: API_BASE_URL })
const program = new Command()
const VERSION = '1.0.0'

program.name('spot-trading').description('Guarded spot trading CLI quote helper').version(VERSION)

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

async function main(): Promise<void> {
  await program.parseAsync(process.argv)
}

void main().catch((error: unknown) => {
  if (error instanceof Error) {
    writeCliError(error.message)
  } else {
    writeCliError('Unknown error')
  }
  process.exit(1)
})
