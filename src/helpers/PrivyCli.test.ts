import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { runPrivyCommand } from '@/helpers/PrivyCli'
import type { CommandRunner, RunCommandParams } from '@/types/CommandRunner'

void describe('runPrivyCommand', () => {
  void test('invokes the official Privy CLI through pnpm dlx instead of bunx', async () => {
    const calls: RunCommandParams[] = []
    const runner: CommandRunner = async (params) => {
      calls.push(params)
      return { stdout: '', stderr: '', code: 0, killed: false }
    }

    const options = { cwd: '/tmp/project', signal: undefined, timeout: 60_000 }
    await runPrivyCommand(runner, ['list-wallets'], options)

    assert.deepEqual(calls, [
      {
        command: 'pnpm',
        args: ['--package=@privy-io/agent-wallet-cli', 'dlx', 'privy-agent-wallet', 'list-wallets'],
        options
      }
    ])
  })
})
