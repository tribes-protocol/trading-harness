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

  return program
}
