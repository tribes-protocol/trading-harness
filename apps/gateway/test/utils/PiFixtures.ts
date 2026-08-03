import type { AgentMessage } from '@earendil-works/pi-agent-core'

/**
 * Builders for the Pi shapes the gateway consumes. They exist so a test can say
 * what matters (a delta, a tool result, a host path in `details`) without
 * restating the ten fields every AssistantMessage carries.
 */

export type AssistantFixture = Extract<AgentMessage, { role: 'assistant' }>
export type UserFixture = Extract<AgentMessage, { role: 'user' }>
export type ToolResultFixture = Extract<AgentMessage, { role: 'toolResult' }>
export type BashFixture = Extract<AgentMessage, { role: 'bashExecution' }>

export type ToolCallFixture = {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export type AssistantParams = {
  timestamp: number
  thinking?: string
  text?: string
  toolCalls?: ToolCallFixture[]
  stopReason?: 'stop' | 'toolUse' | 'error' | 'aborted'
  errorMessage?: string
  diagnosticStack?: string
}

const EMPTY_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
}

export function assistantMessage(params: AssistantParams): AssistantFixture {
  const content: AssistantFixture['content'] = []
  if (params.thinking !== undefined) {
    content.push({ type: 'thinking', thinking: params.thinking })
  }
  if (params.text !== undefined) {
    content.push({ type: 'text', text: params.text })
  }
  for (const call of params.toolCalls ?? []) {
    content.push({ type: 'toolCall', id: call.id, name: call.name, arguments: call.arguments })
  }

  const message: AssistantFixture = {
    role: 'assistant',
    content,
    api: 'anthropic-messages',
    provider: 'anthropic',
    model: 'claude-opus-4-5',
    usage: EMPTY_USAGE,
    stopReason: params.stopReason ?? 'stop',
    timestamp: params.timestamp
  }
  if (params.errorMessage !== undefined) {
    message.errorMessage = params.errorMessage
  }
  if (params.diagnosticStack !== undefined) {
    message.diagnostics = [
      {
        type: 'stream_error',
        timestamp: params.timestamp,
        error: { message: 'stream failed', stack: params.diagnosticStack }
      }
    ]
  }
  return message
}

export function userMessage(timestamp: number, text: string): UserFixture {
  return { role: 'user', content: text, timestamp }
}

export function toolResultMessage(
  timestamp: number,
  toolCallId: string,
  toolName: string,
  text: string,
  isError: boolean,
  details?: Record<string, unknown>
): ToolResultFixture {
  return {
    role: 'toolResult',
    toolCallId,
    toolName,
    content: [{ type: 'text', text }],
    details,
    isError,
    timestamp
  }
}

export function bashExecutionMessage(
  timestamp: number,
  command: string,
  output: string,
  fullOutputPath: string
): BashFixture {
  return {
    role: 'bashExecution',
    command,
    output,
    exitCode: 0,
    cancelled: false,
    truncated: false,
    fullOutputPath,
    timestamp
  }
}
