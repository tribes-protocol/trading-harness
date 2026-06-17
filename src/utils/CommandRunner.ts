import { spawn } from 'node:child_process'

import type { ExecResult, ExtensionAPI } from '@earendil-works/pi-coding-agent'

import type { CommandResult, CommandRunner, RunCommandParams } from '@/types/CommandRunner'

export function isCommandFailure(result: CommandResult): boolean {
  return result.code !== 0 || result.killed
}

// Create a command runner that uses the Pi API to run commands
export function createCommandRunner(
  pi: ExtensionAPI
): (params: RunCommandParams) => Promise<CommandResult> {
  return async (params: RunCommandParams): Promise<CommandResult> => {
    const result: ExecResult = await pi.exec(params.command, [...params.args], params.options)
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      code: result.code,
      killed: result.killed
    }
  }
}

// Create a command runner that uses the Node.js child_process module to run commands
export function createProcessCommandRunner(): CommandRunner {
  return async (params: RunCommandParams): Promise<CommandResult> => {
    return await new Promise<CommandResult>((resolve, reject) => {
      const child = spawn(params.command, params.args, {
        cwd: params.options.cwd,
        env: process.env,
        signal: params.options.signal
      })

      let stdout = ''
      let stderr = ''
      let timedOut = false
      const timeout = setTimeout(() => {
        timedOut = true
        child.kill('SIGTERM')
      }, params.options.timeout)

      child.stdout.on('data', (chunk: Buffer | string) => {
        stdout += chunk.toString()
      })
      child.stderr.on('data', (chunk: Buffer | string) => {
        stderr += chunk.toString()
      })

      child.on('error', (error: Error) => {
        clearTimeout(timeout)
        reject(error)
      })

      child.on('close', (code: number | null, signal: string | null) => {
        clearTimeout(timeout)
        resolve({
          stdout,
          stderr,
          code: code ?? 1,
          killed: timedOut || signal !== null
        })
      })
    })
  }
}
