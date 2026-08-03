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
 * The tool invocation for a `!` bash line the OPERATOR ran.
 *
 * Shared by the live path and the replay fold so the BODY cannot drift: a bash run
 * has no `toolCall` to render from, so both sides synthesize it, and separate
 * copies would let a reattach describe the same run differently from the stream
 * that produced it.
 *
 * The IDENTITY is NOT shared, and cannot be. Live mints `user-bash-<n>` when the
 * command starts; replay uses Pi's own `bash-<timestamp>`, and Pi does not assign
 * that timestamp until the run is recorded, which happens after it exits. So one
 * completed run carries one id live and another on replay. That is harmless only
 * because a snapshot REPLACES the block list wholesale, so the block swaps rather
 * than duplicating — a client that merged snapshot blocks into its existing list
 * would show the run twice.
 *
 * `origin: 'user'` is the whole point. "The agent ran this" and "I ran this" are
 * different facts about a trading session, and the block carries no other trace of
 * which one it was.
 */
export function renderUserBashInvocation(toolCallId: string, command: string): ToolInvocation {
  const preview = truncateText(command, MAX_ARGS_PREVIEW_CHARS)
  return {
    toolCallId,
    toolName: 'bash',
    title: 'bash',
    subtitle: preview,
    argsPreview: preview,
    origin: 'user'
  }
}

/**
 * Whether a bash run should render as failed.
 *
 * A non-zero exit is not a gateway error — it is the answer the operator asked
 * for — but it is still the error VARIANT of a tool block, which is the only way
 * the UI can show it. `exitCode` is undefined when the process was killed, so
 * cancellation is checked first and separately rather than folded into it.
 */
export function isBashRunFailed(cancelled: boolean, exitCode: number | undefined): boolean {
  return cancelled || exitCode !== 0
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
