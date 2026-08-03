import { MAX_TOOL_OUTPUT_CHARS } from '@tribes-harness/protocol/common/Constants'

import type { ActiveBashRun, ScreenToolBlock } from '@/types/Screen'
import { renderUserBashInvocation } from '@/utils/ToolRendering'

/**
 * Bounding and replaying the operator's own `!` runs.
 *
 * Both functions exist because a `!` run is the one thing on this screen that Pi
 * does not model for us: `executeBash` emits no events, and Pi only records the
 * run into its message list once the command exits.
 */

const TRUNCATION_NOTICE = '\n… output capped; the full result lands when the command finishes'

export type BoundBashChunkParams = {
  /** Characters already put on the wire for this run. */
  emittedChars: number
  chunk: string
}

export type BoundBashChunk = {
  /** What to emit. Empty means the budget is spent and nothing more should go out. */
  slice: string
  emittedChars: number
}

/**
 * Bound a live `!` chunk against a CUMULATIVE budget.
 *
 * `onChunk` hands over new output one piece at a time, so the frames APPEND. Capping
 * each chunk individually — the shape used for `tool_execution_update`, which is a
 * cumulative snapshot and therefore REPLACES — is wrong in both directions at once:
 * it splices a truncation marker into the middle of the operator's live output and
 * drops the rest of that chunk, while leaving the running total unbounded.
 *
 * So the budget is spent across chunks. The last chunk to cross it is cut at the
 * remaining allowance and carries the notice; everything after emits nothing. The
 * authoritative, fully bounded output still arrives in `tool_end`, which replaces
 * the block's text.
 */
export function boundBashChunk(params: BoundBashChunkParams): BoundBashChunk {
  const remaining = MAX_TOOL_OUTPUT_CHARS - params.emittedChars
  if (remaining <= 0) {
    return { slice: '', emittedChars: params.emittedChars }
  }
  if (params.chunk.length <= remaining) {
    return {
      slice: params.chunk,
      emittedChars: params.emittedChars + params.chunk.length
    }
  }
  return {
    slice: `${params.chunk.slice(0, remaining)}${TRUNCATION_NOTICE}`,
    // Spend the whole budget so every later chunk short-circuits and the notice is
    // emitted exactly once.
    emittedChars: MAX_TOOL_OUTPUT_CHARS
  }
}

/**
 * Render the in-flight `!` runs as tool blocks for a snapshot.
 *
 * A snapshot is the client's recovery path, so it has to describe the screen as it
 * actually is. Pi's message list does not contain a running command, so replaying
 * only from messages tells an attaching client the block does not exist — and the
 * `tool_output` / `tool_end` frames that follow then address a block it never made.
 */
export function activeBashBlocks(runs: ReadonlyMap<string, ActiveBashRun>): ScreenToolBlock[] {
  const blocks: ScreenToolBlock[] = []
  for (const [toolCallId, run] of runs) {
    blocks.push({
      type: 'tool',
      id: toolCallId,
      invocation: renderUserBashInvocation(toolCallId, run.command),
      output: run.output,
      status: 'streaming'
    })
  }
  return blocks
}
