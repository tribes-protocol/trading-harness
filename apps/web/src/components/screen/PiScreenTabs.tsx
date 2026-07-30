'use client'

import { type ReactNode } from 'react'

import { usePiScreens } from '@/providers/PiScreensProvider'
import { cn } from '@/utils/Ui'

/**
 * The screen strip above the canvas.
 *
 * One screen today, N later — which is why the strip exists now. It renders a single
 * screen as a single tab and needs no restructuring to hold more: the provider
 * already multiplexes every screen over one socket, and the reducer already keys
 * every screen's state by id.
 */
export function PiScreenTabs(): ReactNode {
  const { screens, activeScreen, selectScreen, loadPhase } = usePiScreens()

  return (
    <div className="hairline-b flex h-9 shrink-0 items-stretch gap-px overflow-x-auto border-border bg-card">
      {loadPhase === 'connecting' && screens.length === 0 ? (
        <div className="flex items-center px-3" aria-hidden>
          <div className="h-2 w-24 animate-pulse rounded-sm bg-muted" />
        </div>
      ) : null}

      {screens.map((screen) => {
        const active = screen.screenId === activeScreen?.screenId
        return (
          <button
            key={screen.screenId}
            type="button"
            onClick={() => selectScreen(screen.screenId)}
            aria-current={active ? 'true' : undefined}
            className={cn(
              'group relative flex items-center gap-2 whitespace-nowrap px-3 text-[11px] uppercase tracking-[0.14em] transition-colors',
              active
                ? 'bg-background text-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
          >
            <span
              className={cn(
                'size-1.5 rounded-full',
                screen.state.status === 'streaming'
                  ? 'animate-pulse bg-primary'
                  : screen.hydrated
                    ? 'bg-success'
                    : 'bg-muted-foreground'
              )}
              aria-hidden
            />
            {screen.title}
            {screen.needsResync ? (
              <span className="text-[10px] normal-case tracking-normal text-warning">resync</span>
            ) : null}
            {active ? (
              <span className="absolute inset-x-0 bottom-0 h-px bg-primary" aria-hidden />
            ) : null}
          </button>
        )
      })}

      <div className="flex flex-1 items-center justify-end px-3">
        <span className="t-label">Pi screen</span>
      </div>
    </div>
  )
}
