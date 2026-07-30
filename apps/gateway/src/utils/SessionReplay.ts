import type { AgentMessage } from '@earendil-works/pi-agent-core'
import {
  MAX_ARGS_PREVIEW_CHARS,
  MAX_TEXT_BLOCK_CHARS,
  MAX_TOOL_OUTPUT_CHARS
} from '@tribes-harness/protocol/common/Constants'
import type { ScreenBlock, ScreenBlockStatus } from '@tribes-harness/protocol/types/ScreenBlock'

import type { ScreenReplayInput, ScreenToolBlock } from '@/types/Screen'
import { renderMessageContentText } from '@/utils/MessageContent'
import { messageBlockId, thinkingBlockId } from '@/utils/ScreenIdentity'
import { truncateText } from '@/utils/TextTruncation'
import { renderToolInvocation } from '@/utils/ToolRendering'

/**
 * Fold a Pi transcript into the same `ScreenBlock[]` the client builds from live
 * events, so a reattach renders identically to the live stream.
 *
 * Symmetry comes from three things: the ids are derived the same way
 * (`ScreenIdentity`), the tool payloads go through the same renderers
 * (`ToolRendering`), and the block order matches the live order — an assistant
 * message contributes thinking, then text, then its tool blocks, which is
 * exactly the order `thinking_delta` / `text_delta` / `tool_start` arrive in.
 */
export function foldMessagesToBlocks(input: ScreenReplayInput): ScreenBlock[] {
  const blocks: ScreenBlock[] = []
  const toolBlocksById = new Map<string, ScreenToolBlock>()

  for (const message of input.messages) {
    appendMessageBlocks(blocks, toolBlocksById, message, false)
  }
  if (input.streamingMessage !== null) {
    appendMessageBlocks(blocks, toolBlocksById, input.streamingMessage, true)
  }

  return blocks
}

function appendMessageBlocks(
  blocks: ScreenBlock[],
  toolBlocksById: Map<string, ScreenToolBlock>,
  message: AgentMessage,
  isStreaming: boolean
): void {
  switch (message.role) {
    case 'user':
      blocks.push({
        type: 'user',
        id: messageBlockId(message),
        text: truncateText(renderMessageContentText(message.content), MAX_TEXT_BLOCK_CHARS)
      })
      return

    case 'assistant':
      appendAssistantBlocks(blocks, toolBlocksById, message, isStreaming)
      return

    case 'toolResult':
      appendToolResult(blocks, toolBlocksById, message)
      return

    case 'bashExecution':
      appendBashExecution(blocks, message)
      return

    case 'custom':
      if (message.display) {
        blocks.push({
          type: 'notice',
          id: messageBlockId(message),
          level: 'info',
          text: truncateText(renderMessageContentText(message.content), MAX_TEXT_BLOCK_CHARS)
        })
      }
      return

    case 'branchSummary':
    case 'compactionSummary':
      blocks.push({
        type: 'notice',
        id: messageBlockId(message),
        level: 'info',
        text: truncateText(message.summary, MAX_TEXT_BLOCK_CHARS)
      })
      return
  }
}

function appendAssistantBlocks(
  blocks: ScreenBlock[],
  toolBlocksById: Map<string, ScreenToolBlock>,
  message: Extract<AgentMessage, { role: 'assistant' }>,
  isStreaming: boolean
): void {
  const messageId = messageBlockId(message)
  const failed = message.stopReason === 'error'
  const status: ScreenBlockStatus = failed ? 'error' : isStreaming ? 'streaming' : 'done'

  const thinkingText = message.content
    .flatMap((block) => (block.type === 'thinking' ? [block.thinking] : []))
    .join('')
  if (thinkingText.length > 0) {
    blocks.push({
      type: 'thinking',
      id: thinkingBlockId(messageId),
      text: truncateText(thinkingText, MAX_TEXT_BLOCK_CHARS),
      status
    })
  }

  const text = message.content
    .flatMap((block) => (block.type === 'text' ? [block.text] : []))
    .join('')
  if (text.length > 0) {
    blocks.push({
      type: 'assistant',
      id: messageId,
      text: truncateText(text, MAX_TEXT_BLOCK_CHARS),
      status
    })
  }

  for (const block of message.content) {
    if (block.type !== 'toolCall') {
      continue
    }
    const toolBlock: ScreenToolBlock = {
      type: 'tool',
      id: block.id,
      invocation: renderToolInvocation(block.id, block.name, block.arguments),
      output: '',
      status: 'pending'
    }
    toolBlocksById.set(block.id, toolBlock)
    blocks.push(toolBlock)
  }

  // `diagnostics[].error.stack` is never read: it carries absolute host paths.
  // Only the user-facing message becomes a block.
  if (failed && message.errorMessage !== undefined) {
    blocks.push({
      type: 'notice',
      id: `${messageId}-error`,
      level: 'error',
      text: truncateText(message.errorMessage, MAX_TEXT_BLOCK_CHARS)
    })
  }
}

function appendToolResult(
  blocks: ScreenBlock[],
  toolBlocksById: Map<string, ScreenToolBlock>,
  message: Extract<AgentMessage, { role: 'toolResult' }>
): void {
  const output = truncateText(renderMessageContentText(message.content), MAX_TOOL_OUTPUT_CHARS)
  const status: ScreenBlockStatus = message.isError ? 'error' : 'done'

  const pending = toolBlocksById.get(message.toolCallId)
  if (pending !== undefined) {
    pending.output = output
    pending.status = status
    return
  }

  // The assistant message that requested the call was compacted away; keep the
  // result rather than dropping it.
  blocks.push({
    type: 'tool',
    id: message.toolCallId,
    invocation: renderToolInvocation(message.toolCallId, message.toolName, undefined),
    output,
    status
  })
}

function appendBashExecution(
  blocks: ScreenBlock[],
  message: Extract<AgentMessage, { role: 'bashExecution' }>
): void {
  // `fullOutputPath` is deliberately not forwarded — it is an absolute host path.
  const id = messageBlockId(message)
  const command = truncateText(message.command, MAX_ARGS_PREVIEW_CHARS)
  blocks.push({
    type: 'tool',
    id,
    invocation: {
      toolCallId: id,
      toolName: 'bash',
      title: 'bash',
      subtitle: command,
      argsPreview: command
    },
    output: truncateText(message.output, MAX_TOOL_OUTPUT_CHARS),
    status: message.cancelled || message.exitCode !== 0 ? 'error' : 'done'
  })
}
