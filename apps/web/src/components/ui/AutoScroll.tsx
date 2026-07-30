'use client'

import { ArrowDown } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'

import { cn } from '@/utils/Ui'

/**
 * A scroll viewport pinned to the bottom while the reader is at the bottom.
 *
 * Both live surfaces need this and neither can get it from `blocks.length`: a tool's
 * output grows the content without adding a block, and the spinner→text swap changes
 * height without changing the block count. A ResizeObserver on the CONTENT is the
 * only thing that sees every height mutation, and it is the sanctioned use of an
 * effect — an external browser API, not state watching state.
 *
 * Scrolling up releases the pin and raises the jump chip; scrolling back down (or
 * clicking the chip) re-pins.
 */

const PIN_THRESHOLD_PX = 24

interface AutoScrollProps {
  children: ReactNode
  className?: string
}

export function AutoScroll({ children, className }: AutoScrollProps): ReactNode {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const [content, setContent] = useState<HTMLDivElement | null>(null)
  const [pinned, setPinned] = useState(true)

  useEffect(() => {
    if (container === null || content === null || !pinned) {
      return
    }
    // ResizeObserver coalesces to at most one callback per frame, so writing
    // scrollTop straight from it needs no further batching.
    const observer = new ResizeObserver(() => {
      container.scrollTop = container.scrollHeight
    })
    observer.observe(content)
    return () => observer.disconnect()
  }, [container, content, pinned])

  const onScroll = (): void => {
    if (container === null) {
      return
    }
    const distance = container.scrollHeight - container.scrollTop - container.clientHeight
    setPinned(distance <= PIN_THRESHOLD_PX)
  }

  const jumpToLatest = (): void => {
    setPinned(true)
    if (container !== null) {
      container.scrollTop = container.scrollHeight
    }
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={setContainer}
        onScroll={onScroll}
        className="h-full overflow-y-auto overscroll-contain"
      >
        <div ref={setContent} className={cn('flex flex-col', className)}>
          {children}
        </div>
      </div>
      {pinned ? null : (
        <button
          type="button"
          onClick={jumpToLatest}
          className="absolute bottom-3 right-4 flex items-center gap-1.5 rounded-sm border border-border bg-card px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground shadow-lg transition-colors hover:border-primary hover:text-foreground"
        >
          <ArrowDown className="size-3" aria-hidden />
          Latest
        </button>
      )}
    </div>
  )
}
