'use client'

import { ChevronDown, ChevronRight } from 'lucide-react'
import { memo, type ReactNode, useState } from 'react'

import { TOOL_OUTPUT_COLLAPSED_LINES } from '@/common/Gateway'
import type { ToolScreenBlock } from '@/types/ScreenView'
import { collapseToolOutput } from '@/utils/ToolOutput'
import { cn } from '@/utils/Ui'

/**
 * One tool invocation. Memoized and keyed by `toolCallId`, so a `tool_output` delta
 * — which replaces exactly this block object and no other — re-renders exactly this
 * node.
 */

const STATUS_DOT = {
  pending: 'bg-muted-foreground',
  streaming: 'bg-primary animate-pulse',
  done: 'bg-success',
  error: 'bg-destructive'
}

const STATUS_LABEL = {
  pending: 'queued',
  streaming: 'running',
  done: 'ok',
  error: 'failed'
}

const STATUS_TEXT = {
  pending: 'text-muted-foreground',
  streaming: 'text-primary',
  done: 'text-muted-foreground',
  error: 'text-destructive'
}

interface ToolBlockViewProps {
  block: ToolScreenBlock
}

export const ToolBlockView = memo(function ToolBlockView({ block }: ToolBlockViewProps): ReactNode {
  const [expanded, setExpanded] = useState(false)
  const { invocation, output, status } = block
  const collapsed = collapseToolOutput(output, TOOL_OUTPUT_COLLAPSED_LINES)
  const body = expanded ? output : collapsed.visible
  const Chevron = expanded ? ChevronDown : ChevronRight

  return (
    <div
      className={cn(
        'hairline rounded-sm border-border bg-card',
        status === 'error' && 'border-destructive/50'
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        className="flex w-full items-baseline gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-accent"
      >
        <Chevron className="size-3 shrink-0 translate-y-0.5 text-muted-foreground" aria-hidden />
        <span className="shrink-0 font-medium text-foreground">{invocation.title}</span>
        {invocation.subtitle === null || invocation.subtitle === undefined ? null : (
          <span className="min-w-0 flex-1 truncate text-info">{invocation.subtitle}</span>
        )}
        <span
          className={cn(
            'ml-auto flex shrink-0 items-center gap-1.5 text-[10px] uppercase tracking-[0.14em]',
            STATUS_TEXT[status]
          )}
        >
          <span className={cn('size-1.5 rounded-full', STATUS_DOT[status])} aria-hidden />
          {STATUS_LABEL[status]}
        </span>
      </button>

      {expanded && invocation.argsPreview.length > 0 ? (
        <pre className="hairline-t overflow-x-auto border-border px-2.5 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
          {invocation.argsPreview}
        </pre>
      ) : null}

      {body.length > 0 ? (
        <div className="hairline-t border-border px-2.5 py-1.5">
          {collapsed.hiddenLines > 0 && !expanded ? (
            <div className="pb-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {collapsed.hiddenLines} earlier lines hidden
            </div>
          ) : null}
          <pre
            className={cn(
              'overflow-x-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed',
              status === 'error' ? 'text-destructive' : 'text-muted-foreground'
            )}
          >
            {body}
          </pre>
        </div>
      ) : null}
    </div>
  )
})
