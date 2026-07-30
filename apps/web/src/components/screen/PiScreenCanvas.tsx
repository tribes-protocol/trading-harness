'use client'

import { AlertTriangle, Info, Sparkles } from 'lucide-react'
import { memo, type ReactNode, useMemo, useState } from 'react'

import { ToolBlockView } from '@/components/screen/ToolBlockView'
import { AutoScroll } from '@/components/ui/AutoScroll'
import { usePiScreens } from '@/providers/PiScreensProvider'
import type { NoticeScreenBlock, ScreenViewState, ThinkingScreenBlock } from '@/types/ScreenView'
import { cn } from '@/utils/Ui'

/**
 * The LEFT panel: what the agent is DOING. Tool invocations with their live output,
 * reasoning, and the notices the run emits (compaction, retries, errors).
 *
 * Terminal-adjacent but not a terminal — there is no ANSI here, no cursor, no
 * emulation. Blocks are structured, individually addressable, and individually
 * memoized.
 */

const NOTICE_STYLE = {
  info: 'border-info/40 text-info',
  warning: 'border-warning/40 text-warning',
  error: 'border-destructive/50 text-destructive'
}

const NOTICE_ICON = {
  info: Info,
  warning: AlertTriangle,
  error: AlertTriangle
}

interface ThinkingBlockViewProps {
  block: ThinkingScreenBlock
}

const ThinkingBlockView = memo(function ThinkingBlockView({
  block
}: ThinkingBlockViewProps): ReactNode {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <button
      type="button"
      onClick={() => setCollapsed((current) => !current)}
      aria-expanded={!collapsed}
      className="hairline-l block w-full border-border pl-2.5 text-left italic text-muted-foreground transition-colors hover:text-foreground"
    >
      {collapsed ? (
        <span className="text-[10px] uppercase not-italic tracking-[0.18em]">Reasoning hidden</span>
      ) : (
        <span className="whitespace-pre-wrap break-words">{block.text}</span>
      )}
    </button>
  )
})

interface NoticeBlockViewProps {
  block: NoticeScreenBlock
}

const NoticeBlockView = memo(function NoticeBlockView({ block }: NoticeBlockViewProps): ReactNode {
  const Icon = NOTICE_ICON[block.level]
  return (
    <div
      className={cn(
        'hairline flex items-start gap-2 rounded-sm bg-card px-2.5 py-1.5',
        NOTICE_STYLE[block.level]
      )}
    >
      <Icon className="size-3 shrink-0 translate-y-1" aria-hidden />
      <span className="whitespace-pre-wrap break-words">{block.text}</span>
    </div>
  )
})

function CanvasSkeleton(): ReactNode {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 py-3" aria-hidden>
      {[64, 40, 88, 52].map((width, index) => (
        <div key={index} className="hairline rounded-sm border-border bg-card px-2.5 py-2">
          <div className="h-2 animate-pulse rounded-sm bg-muted" style={{ width: `${width}%` }} />
        </div>
      ))}
    </div>
  )
}

function CanvasEmpty(): ReactNode {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
      <Sparkles className="size-4 text-muted-foreground" aria-hidden />
      <p className="t-label">Screen attached — no activity yet</p>
      <p className="max-w-xs text-muted-foreground">
        Tool calls, reasoning and run notices land here as the agent works.
      </p>
    </div>
  )
}

function CanvasError(): ReactNode {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
      <AlertTriangle className="size-4 text-destructive" aria-hidden />
      <p className="t-label text-destructive">Protocol mismatch</p>
      <p className="max-w-xs text-muted-foreground">
        The gateway announced a wire version this build cannot render. Reload the tab; if that does
        not clear it, the deployed gateway and this bundle are out of step.
      </p>
    </div>
  )
}

interface CanvasBlocksProps {
  screen: ScreenViewState
}

function CanvasBlocks({ screen }: CanvasBlocksProps): ReactNode {
  const blocks = useMemo(
    () =>
      screen.blocks.filter(
        (block) => block.type === 'tool' || block.type === 'thinking' || block.type === 'notice'
      ),
    [screen.blocks]
  )

  if (blocks.length === 0) {
    return <CanvasEmpty />
  }

  return (
    <AutoScroll className="gap-2 px-3 py-3">
      {blocks.map((block) => {
        switch (block.type) {
          case 'tool':
            return <ToolBlockView key={block.id} block={block} />
          case 'thinking':
            return <ThinkingBlockView key={block.id} block={block} />
          case 'notice':
            return <NoticeBlockView key={block.id} block={block} />
        }
      })}
    </AutoScroll>
  )
}

export function PiScreenCanvas(): ReactNode {
  const { activeScreen, loadPhase } = usePiScreens()

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      {loadPhase === 'error' ? (
        <CanvasError />
      ) : loadPhase === 'connecting' || activeScreen === null ? (
        <CanvasSkeleton />
      ) : (
        <CanvasBlocks screen={activeScreen} />
      )}
    </div>
  )
}
