import type { CommandExecutionOptions, CommandResult, CommandRunner } from '@/types/CommandRunner'

const PRIVY_PACKAGE = '@privy-io/agent-wallet-cli'
const PRIVY_BINARY = 'privy-agent-wallet'

function createPrivyArgs(args: readonly string[]): string[] {
  return [`--package=${PRIVY_PACKAGE}`, 'dlx', PRIVY_BINARY, ...args]
}

export async function runPrivyCommand(
  runner: CommandRunner,
  args: readonly string[],
  options: CommandExecutionOptions
): Promise<CommandResult> {
  return runner({ command: 'pnpm', args: createPrivyArgs(args), options })
}
