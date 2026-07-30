import {
  MAX_ARGS_PREVIEW_CHARS,
  MAX_TOOL_OUTPUT_CHARS
} from '@tribes-harness/protocol/common/Constants'
import type { ToolInvocation } from '@tribes-harness/protocol/types/ScreenEvent'
import { z } from 'zod'

import { toPrettyJsonText } from '@/utils/JsonText'
import { renderMessageContentText } from '@/utils/MessageContent'
import { truncateText } from '@/utils/TextTruncation'

/**
 * Pi types tool arguments and tool results as `any` — they come straight out of
 * tool code and change shape whenever a tool does. Everything here narrows them
 * with zod at the boundary and renders display-ready, bounded strings.
 *
 * Two things are deliberately dropped and must stay dropped:
 *  - `details` on a tool result (ReadToolDetails and friends carry absolute host
 *    paths),
 *  - the bytes of any image content (they arrive inlined as base64).
 */

const BashArgsSchema = z.object({ command: z.string() })
const PathArgsSchema = z.object({ path: z.string() })
const PatternArgsSchema = z.object({ pattern: z.string() })

const ToolResultSchema = z.object({ content: z.array(z.unknown()) })

function renderSubtitle(toolName: string, args: unknown): string | null {
  switch (toolName.toLowerCase()) {
    case 'bash': {
      const parsed = BashArgsSchema.safeParse(args)
      return parsed.success ? parsed.data.command : null
    }
    case 'read':
    case 'write':
    case 'edit':
    case 'ls': {
      const parsed = PathArgsSchema.safeParse(args)
      return parsed.success ? parsed.data.path : null
    }
    case 'grep':
    case 'find': {
      const parsed = PatternArgsSchema.safeParse(args)
      return parsed.success ? parsed.data.pattern : null
    }
    default:
      return null
  }
}

export function renderToolInvocation(
  toolCallId: string,
  toolName: string,
  args: unknown
): ToolInvocation {
  const subtitle = renderSubtitle(toolName, args)
  return {
    toolCallId,
    toolName,
    title: toolName,
    subtitle: subtitle === null ? null : truncateText(subtitle, MAX_ARGS_PREVIEW_CHARS),
    argsPreview: truncateText(toPrettyJsonText(args), MAX_ARGS_PREVIEW_CHARS)
  }
}

/**
 * Render an `AgentToolResult` — the partial one from `tool_execution_update` or
 * the final one from `tool_execution_end` — into bounded text. A value that does
 * not match the contract renders as empty rather than as a raw dump, because a
 * raw dump is exactly how `details` and its host paths would leak.
 */
export function renderToolOutput(result: unknown): string {
  const parsed = ToolResultSchema.safeParse(result)
  if (!parsed.success) {
    return ''
  }
  return truncateText(renderMessageContentText(parsed.data.content), MAX_TOOL_OUTPUT_CHARS)
}
