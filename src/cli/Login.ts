import { Command } from 'commander'

import { LoginService } from '@/services/LoginService'

const VERSION = '1.0.0'

export function buildLoginCommand(): Command {
  const loginService = new LoginService()

  const program = new Command('login')
  program
    .description('Generate a CLI login keypair and print a browser login URL')
    .version(VERSION)
    .action(async (): Promise<void> => {
      await loginService.runLogin()
    })

  // Backfill keyQuorumId for a web-booted sandbox so its login state is correct.
  // No-op for any other origin or an already-synced key. Invoked by the harness
  // extension at session start.
  program
    .command('sync-quorum')
    .description('Backfill keyQuorumId for a web-booted sandbox (no-op otherwise)')
    .action(async (): Promise<void> => {
      await loginService.syncKeyQuorum()
    })

  return program
}
