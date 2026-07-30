import type { CollapsedToolOutput } from '@/types/ScreenView'

/**
 * Collapse a tool's output to its last `maxLines` lines.
 *
 * The tail, not the head: Pi's bash tool streams a cumulative tail-truncated
 * snapshot, so the newest lines are the interesting ones, and a running command's
 * live output should stay pinned to what it just printed.
 */
export function collapseToolOutput(text: string, maxLines: number): CollapsedToolOutput {
  if (text.length === 0) {
    return { visible: '', hiddenLines: 0 }
  }
  const lines = text.split('\n')
  if (lines.length <= maxLines) {
    return { visible: text, hiddenLines: 0 }
  }
  return {
    visible: lines.slice(lines.length - maxLines).join('\n'),
    hiddenLines: lines.length - maxLines
  }
}
