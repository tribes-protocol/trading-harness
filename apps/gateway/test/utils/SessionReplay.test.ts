import type { AgentMessage } from '@earendil-works/pi-agent-core'
import { MAX_TEXT_BLOCK_CHARS } from '@tribes-harness/protocol/common/Constants'
import { describe, expect, it } from 'vitest'

import { mapAgentSessionEvent } from '@/utils/EventMapping'
import { toJsonText } from '@/utils/JsonText'
import { foldMessagesToBlocks } from '@/utils/SessionReplay'

import {
  assistantMessage,
  bashExecutionMessage,
  toolResultMessage,
  userMessage
} from './PiFixtures'

const HOST_PATH = '/Users/leo/Desktop/harness/runtime/gateway-sessions/out.txt'

function fold(messages: AgentMessage[]): ReturnType<typeof foldMessagesToBlocks> {
  return foldMessagesToBlocks({ messages, streamingMessage: null })
}

describe('foldMessagesToBlocks', () => {
  it('folds a full turn into user, thinking, assistant and tool blocks in stream order', () => {
    const blocks = fold([
      userMessage(1000, 'list the files'),
      assistantMessage({
        timestamp: 1100,
        thinking: 'need a shell',
        text: 'Running it now.',
        toolCalls: [{ id: 'call-1', name: 'bash', arguments: { command: 'ls' } }],
        stopReason: 'toolUse'
      }),
      toolResultMessage(1200, 'call-1', 'bash', 'a.ts\nb.ts', false)
    ])

    expect(blocks).toEqual([
      { type: 'user', id: 'usr-1000', text: 'list the files' },
      { type: 'thinking', id: 'asst-1100-thinking', text: 'need a shell', status: 'done' },
      { type: 'assistant', id: 'asst-1100', text: 'Running it now.', status: 'done' },
      {
        type: 'tool',
        id: 'call-1',
        invocation: {
          toolCallId: 'call-1',
          toolName: 'bash',
          title: 'bash',
          subtitle: 'ls',
          argsPreview: '{\n  "command": "ls"\n}'
        },
        output: 'a.ts\nb.ts',
        status: 'done'
      }
    ])
  })

  it('uses the same block ids the live event path uses', () => {
    const message = assistantMessage({ timestamp: 4242, thinking: 't', text: 'hello' })
    const blocks = fold([message])

    const liveIds = mapAgentSessionEvent({ type: 'message_end', message }).flatMap((event) =>
      event.kind === 'text_end' || event.kind === 'thinking_end' ? [event.messageId] : []
    )

    expect(liveIds).toEqual(['asst-4242', 'asst-4242'])
    expect(blocks.map((block) => block.id)).toEqual(['asst-4242-thinking', 'asst-4242'])
  })

  it('marks the in-flight message as streaming and leaves history done', () => {
    const blocks = foldMessagesToBlocks({
      messages: [assistantMessage({ timestamp: 1000, text: 'done one' })],
      streamingMessage: assistantMessage({ timestamp: 2000, text: 'in progr' })
    })

    expect(blocks).toEqual([
      { type: 'assistant', id: 'asst-1000', text: 'done one', status: 'done' },
      { type: 'assistant', id: 'asst-2000', text: 'in progr', status: 'streaming' }
    ])
  })

  it('marks a failed turn and surfaces the message without the stack', () => {
    const blocks = fold([
      assistantMessage({
        timestamp: 3000,
        text: 'half an ans',
        stopReason: 'error',
        errorMessage: 'provider returned 529',
        diagnosticStack: `Error: boom\n    at stream (${HOST_PATH}:9:1)`
      })
    ])

    expect(blocks).toEqual([
      { type: 'assistant', id: 'asst-3000', text: 'half an ans', status: 'error' },
      {
        type: 'notice',
        id: 'asst-3000-error',
        level: 'error',
        text: 'provider returned 529'
      }
    ])
    expect(toJsonText(blocks)).not.toContain(HOST_PATH)
  })

  it('marks an errored tool result on the block the assistant opened', () => {
    const blocks = fold([
      assistantMessage({
        timestamp: 1000,
        toolCalls: [{ id: 'call-9', name: 'read', arguments: { path: 'nope.ts' } }],
        stopReason: 'toolUse'
      }),
      toolResultMessage(1100, 'call-9', 'read', 'ENOENT', true, { path: HOST_PATH })
    ])

    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toEqual({
      type: 'tool',
      id: 'call-9',
      invocation: {
        toolCallId: 'call-9',
        toolName: 'read',
        title: 'read',
        subtitle: 'nope.ts',
        argsPreview: '{\n  "path": "nope.ts"\n}'
      },
      output: 'ENOENT',
      status: 'error'
    })
    expect(toJsonText(blocks)).not.toContain(HOST_PATH)
  })

  it('keeps a tool result whose assistant message was compacted away', () => {
    const blocks = fold([toolResultMessage(1100, 'orphan', 'grep', 'no matches', false)])

    expect(blocks).toEqual([
      {
        type: 'tool',
        id: 'orphan',
        invocation: {
          toolCallId: 'orphan',
          toolName: 'grep',
          title: 'grep',
          subtitle: null,
          argsPreview: ''
        },
        output: 'no matches',
        status: 'done'
      }
    ])
  })

  it('never forwards the bash spill-file path', () => {
    const blocks = fold([bashExecutionMessage(1000, 'echo hi', 'hi', HOST_PATH)])

    expect(blocks).toEqual([
      {
        type: 'tool',
        id: 'bash-1000',
        invocation: {
          toolCallId: 'bash-1000',
          toolName: 'bash',
          title: 'bash',
          subtitle: 'echo hi',
          argsPreview: 'echo hi'
        },
        output: 'hi',
        status: 'done'
      }
    ])
    expect(toJsonText(blocks)).not.toContain(HOST_PATH)
  })

  it('bounds a long text block at the wire cap', () => {
    const blocks = fold([
      assistantMessage({ timestamp: 1000, text: 'w'.repeat(MAX_TEXT_BLOCK_CHARS * 2) })
    ])

    const block = blocks[0]
    expect(block?.type).toBe('assistant')
    expect(block?.type === 'assistant' ? block.text.length : 0).toBeLessThanOrEqual(
      MAX_TEXT_BLOCK_CHARS
    )
  })

  it('drops image bytes from a user message', () => {
    const blocks = foldMessagesToBlocks({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'look at this' },
            { type: 'image', data: 'QUJDREVGRw==', mimeType: 'image/png' }
          ],
          timestamp: 1000
        }
      ],
      streamingMessage: null
    })

    expect(blocks).toEqual([
      { type: 'user', id: 'usr-1000', text: 'look at this\n[image image/png]' }
    ])
    expect(toJsonText(blocks)).not.toContain('QUJDREVGRw==')
  })
})
