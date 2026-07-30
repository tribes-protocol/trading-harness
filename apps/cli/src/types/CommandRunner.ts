export type CommandRunner = (params: RunCommandParams) => Promise<CommandResult>

export interface CommandResult {
  readonly stdout: string
  readonly stderr: string
  readonly code: number
  readonly killed: boolean
}

export interface CommandExecutionOptions {
  readonly cwd: string
  readonly signal: AbortSignal | undefined
  readonly timeout: number
}

export interface RunCommandParams {
  readonly command: string
  readonly args: readonly string[]
  readonly options: CommandExecutionOptions
}
