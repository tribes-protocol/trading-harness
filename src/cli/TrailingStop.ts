import { HttpTransport, InfoClient } from '@nktkas/hyperliquid'
import { Command } from 'commander'

import { API_BASE_URL, API_BEARER_TOKEN, PRIVY_APP_ID } from '@/common/Env'
import { writeOutput } from '@/helpers/WriteOutput'
import { HyperliquidService } from '@/services/HyperliquidService'
import { TrailingStopService } from '@/services/TrailingStopService'
import { TransactionService } from '@/services/TransactionService'
import {
  TrailingStopArmCommandOptionsSchema,
  TrailingStopCancelCommandOptionsSchema,
  TrailingStopListCommandOptionsSchema
} from '@/types/TrailingStop'
import { ensureJsonTreeString } from '@/utils/Lang'

const VERSION = '1.0.0'

export function buildTrailingStopCommand(): Command {
  const transactionService = new TransactionService({
    apiBaseUrl: API_BASE_URL,
    apiBearerToken: API_BEARER_TOKEN,
    privyAppId: PRIVY_APP_ID
  })
  const hyperliquidService = new HyperliquidService({
    transaction: transactionService
  })
  const trailingStopService = new TrailingStopService({
    hyperliquid: hyperliquidService,
    infoClient: new InfoClient({ transport: new HttpTransport() })
  })

  const program = new Command('trailing-stop')
  program
    .description(
      'Arm, monitor, and exit a trailing stop on an open Hyperliquid perp position ' +
        '(protection alongside the hard SL/TP bracket; never a naked position, never a flip)'
    )
    .version(VERSION)

  program
    .command('arm')
    .description(
      'Arm a trailing stop on a LIVE open perp position (long: peak − trail; short: trough + trail)'
    )
    .requiredOption('--coin <coin>', 'Perp symbol (for example: BTC, ETH)')
    .option('--dex <dex>', 'Perp dex name (main by default)')
    .requiredOption('--from <address>', 'Signer EVM address (Privy wallet)')
    .requiredOption('--side <side>', 'Position side: long | short')
    .option('--trail-pct <pct>', 'Trail as decimal percent (for example: 0.25 = 0.25%)')
    .option('--trail-px <px>', 'Trail as absolute price distance')
    .requiredOption('--wallet-id <walletId>', 'Privy wallet id')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = TrailingStopArmCommandOptionsSchema.parse(options)
      const trail =
        request.trailPx !== null && request.trailPx !== undefined
          ? { kind: 'px' as const, value: request.trailPx }
          : { kind: 'pct' as const, value: request.trailPct ?? 0 }
      const response = await trailingStopService.arm({
        coin: request.coin,
        dex: request.dex,
        from: request.from,
        side: request.side,
        trail,
        walletId: request.walletId
      })
      const output = ensureJsonTreeString(response)
      await writeOutput({
        output,
        outPath: request.out ?? undefined
      })
    })

  program
    .command('list')
    .description('List trailing stops and reconcile dead monitors via heartbeat')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (options: unknown): Promise<void> => {
      const request = TrailingStopListCommandOptionsSchema.parse(options)
      const response = await trailingStopService.list()
      const output = ensureJsonTreeString(response)
      await writeOutput({
        output,
        outPath: request.out ?? undefined
      })
    })

  program
    .command('cancel')
    .description('Cancel an armed trailing stop — stops the monitor loop WITHOUT exiting')
    .argument('<id>', 'Trailing stop id from arm/list')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (id: string, options: { out?: string }): Promise<void> => {
      const request = TrailingStopCancelCommandOptionsSchema.parse({ id, out: options.out })
      const response = await trailingStopService.cancel(request.id)
      const output = ensureJsonTreeString(response)
      await writeOutput({
        output,
        outPath: request.out ?? undefined
      })
    })

  program
    .command('monitor')
    .description(
      'Run the monitor loop for a stop (stream-first via websocket, 10s poll fallback; ' +
        'spawned detached by arm; runs until trigger or cancel)'
    )
    .argument('<id>', 'Trailing stop id from arm')
    .option('--out <file>', 'Write output JSON to file')
    .action(async (id: string, options: { out?: string }): Promise<void> => {
      const request = TrailingStopCancelCommandOptionsSchema.parse({ id, out: options.out })
      const response = await trailingStopService.monitor(request.id)
      const output = ensureJsonTreeString(response)
      await writeOutput({
        output,
        outPath: request.out ?? undefined
      })
    })

  return program
}
