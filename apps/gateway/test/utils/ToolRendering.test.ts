import {
  MAX_ARGS_PREVIEW_CHARS,
  MAX_TOOL_OUTPUT_CHARS
} from '@tribes-harness/protocol/common/Constants'
import { describe, expect, it } from 'vitest'

import { renderToolInvocation, renderToolOutput } from '@/utils/ToolRendering'

const HOST_PATH = '/Users/leo/Desktop/harness/runtime/secret.txt'

describe('renderToolInvocation', () => {
  it('uses the command as the subtitle for bash', () => {
    const invocation = renderToolInvocation('c1', 'bash', { command: 'bun test', timeout: 30 })

    expect(invocation.title).toBe('bash')
    expect(invocation.subtitle).toBe('bun test')
    expect(invocation.toolCallId).toBe('c1')
  })

  it('uses the path as the subtitle for the file tools', () => {
    for (const toolName of ['read', 'write', 'edit', 'ls']) {
      expect(renderToolInvocation('c1', toolName, { path: 'src/Main.ts' }).subtitle).toBe(
        'src/Main.ts'
      )
    }
  })

  it('uses the pattern as the subtitle for search tools', () => {
    for (const toolName of ['grep', 'find']) {
      expect(renderToolInvocation('c1', toolName, { pattern: 'TODO' }).subtitle).toBe('TODO')
    }
  })

  it('is case insensitive on the tool name', () => {
    expect(renderToolInvocation('c1', 'Bash', { command: 'ls' }).subtitle).toBe('ls')
  })

  it('falls back to no subtitle for an unknown tool or unexpected arguments', () => {
    expect(renderToolInvocation('c1', 'mystery_tool', { whatever: 1 }).subtitle).toBeNull()
    expect(renderToolInvocation('c1', 'bash', { notACommand: true }).subtitle).toBeNull()
    expect(renderToolInvocation('c1', 'bash', 'not an object').subtitle).toBeNull()
  })

  it('still previews the arguments of an unknown tool', () => {
    expect(renderToolInvocation('c1', 'mystery_tool', { whatever: 1 }).argsPreview).toContain(
      'whatever'
    )
  })

  it('bounds the argument preview and the subtitle', () => {
    const long = 'y'.repeat(MAX_ARGS_PREVIEW_CHARS * 3)
    const invocation = renderToolInvocation('c1', 'bash', { command: long })

    expect(invocation.argsPreview.length).toBeLessThanOrEqual(MAX_ARGS_PREVIEW_CHARS)
    expect(invocation.subtitle?.length ?? 0).toBeLessThanOrEqual(MAX_ARGS_PREVIEW_CHARS)
  })

  it('renders undefined arguments as an empty preview', () => {
    expect(renderToolInvocation('c1', 'read', undefined).argsPreview).toBe('')
  })
})

describe('renderToolOutput', () => {
  it('joins text content and drops the details that carry host paths', () => {
    const rendered = renderToolOutput({
      content: [
        { type: 'text', text: 'first' },
        { type: 'text', text: 'second' }
      ],
      details: { fullOutputPath: HOST_PATH }
    })

    expect(rendered).toBe('first\nsecond')
    expect(rendered).not.toContain(HOST_PATH)
  })

  it('replaces image content with a placeholder instead of the base64 bytes', () => {
    expect(
      renderToolOutput({
        content: [{ type: 'image', mimeType: 'image/png', data: 'QUJDREVGRw==' }]
      })
    ).toBe('[image image/png]')
  })

  it('renders nothing for a value that does not match the tool result contract', () => {
    expect(renderToolOutput(undefined)).toBe('')
    expect(renderToolOutput({ details: { path: HOST_PATH } })).toBe('')
    expect(renderToolOutput('just a string')).toBe('')
  })

  it('bounds the output at the wire cap', () => {
    const rendered = renderToolOutput({
      content: [{ type: 'text', text: 'z'.repeat(MAX_TOOL_OUTPUT_CHARS * 2) }]
    })

    expect(rendered.length).toBeLessThanOrEqual(MAX_TOOL_OUTPUT_CHARS)
    expect(rendered.endsWith('truncated')).toBe(true)
  })
})
