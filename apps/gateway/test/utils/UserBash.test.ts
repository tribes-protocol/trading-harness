import { MAX_TOOL_OUTPUT_CHARS } from '@tribes-harness/protocol/common/Constants'
import { describe, expect, it } from 'vitest'

import type { ActiveBashRun } from '@/types/Screen'
import { activeBashBlocks, boundBashChunk } from '@/utils/UserBash'

describe('boundBashChunk', () => {
  it('passes a chunk through untouched while there is budget', () => {
    expect(boundBashChunk({ emittedChars: 0, chunk: 'hello' })).toEqual({
      slice: 'hello',
      emittedChars: 5
    })
  })

  it('spends the budget across chunks rather than per chunk', () => {
    // The bug: `truncateText(chunk, MAX)` capped EACH chunk. Ten 15k chunks each
    // passed the per-chunk check, so 150k characters went out under a 20k cap.
    const chunk = 'a'.repeat(15_000)
    const first = boundBashChunk({ emittedChars: 0, chunk })
    expect(first.slice).toHaveLength(15_000)
    const second = boundBashChunk({ emittedChars: first.emittedChars, chunk })
    expect(second.emittedChars).toBe(MAX_TOOL_OUTPUT_CHARS)
    expect(second.slice.length).toBeLessThan(chunk.length)
  })

  it('cuts only the chunk that crosses the budget, and says why once', () => {
    const first = boundBashChunk({
      emittedChars: MAX_TOOL_OUTPUT_CHARS - 10,
      chunk: 'x'.repeat(50)
    })
    expect(first.slice.startsWith('x'.repeat(10))).toBe(true)
    expect(first.slice).toContain('output capped')
    expect(first.emittedChars).toBe(MAX_TOOL_OUTPUT_CHARS)

    // Everything after the budget emits nothing at all — no repeated notice.
    const second = boundBashChunk({ emittedChars: first.emittedChars, chunk: 'more output' })
    expect(second).toEqual({ slice: '', emittedChars: MAX_TOOL_OUTPUT_CHARS })
  })

  it('never splices the notice into the middle of a chunk that fits', () => {
    // The old per-chunk cap put "… truncated" inside live output and dropped the
    // remainder of that chunk, which is corruption rather than bounding.
    const chunk = 'y'.repeat(MAX_TOOL_OUTPUT_CHARS)
    const bounded = boundBashChunk({ emittedChars: 0, chunk })
    expect(bounded.slice).toBe(chunk)
    expect(bounded.slice).not.toContain('capped')
  })
})

describe('activeBashBlocks', () => {
  function run(command: string, output: string): ActiveBashRun {
    return { command, output, emittedChars: output.length }
  }

  it('renders an in-flight run so a mid-run snapshot still describes it', () => {
    // Pi records a bash run into its message list only when the command EXITS, so
    // replaying from messages alone tells an attaching client the block does not
    // exist — and the tool_output/tool_end frames that follow then address a block
    // it never created.
    const blocks = activeBashBlocks(new Map([['user-bash-1', run('sleep 30', 'partial')]]))
    expect(blocks).toEqual([
      {
        type: 'tool',
        id: 'user-bash-1',
        invocation: expect.objectContaining({
          toolCallId: 'user-bash-1',
          toolName: 'bash',
          origin: 'user'
        }),
        output: 'partial',
        status: 'streaming'
      }
    ])
  })

  it('marks them streaming, not pending — output is already flowing', () => {
    const blocks = activeBashBlocks(new Map([['user-bash-2', run('tail -f log', 'line')]]))
    expect(blocks[0]?.status).toBe('streaming')
  })

  it('is empty when nothing is running', () => {
    expect(activeBashBlocks(new Map())).toEqual([])
  })
})
