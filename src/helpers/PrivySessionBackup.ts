import type { CommandExecutionOptions, CommandRunner } from '@/types/CommandRunner'
import { isCommandFailure } from '@/utils/CommandRunner'
import { trimCommandText } from '@/utils/Privy'

const BACKUP_SCRIPT =
  'mkdir -p "$HOME/.privy" && ' +
  '(cat "$HOME/.privy/session.json" > "$HOME/.privy/session.backup.json" 2>/dev/null || ' +
  'security find-generic-password -s "privy-agent-cli" -a "session" -w | tee "$HOME/.privy/session.backup.json" > /dev/null)'

export async function backupPrivySession(
  runner: CommandRunner,
  options: CommandExecutionOptions
): Promise<string | null> {
  const result = await runner({ command: 'bash', args: ['-lc', BACKUP_SCRIPT], options })
  return isCommandFailure(result) ? trimCommandText(result) : null
}
