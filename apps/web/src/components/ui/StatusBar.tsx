'use client'

import { type ReactNode } from 'react'

import { usePiScreens } from '@/providers/PiScreensProvider'
import type { GatewayStatus } from '@/types/ScreenView'
import { cn, formatPercent, formatUsd } from '@/utils/Ui'

/**
 * The bottom instrument rail: transport on the left, run economics on the right.
 * Every value here is a live number an operator watches while the agent trades —
 * which model is answering, how much context is left, what the run has cost.
 */

const CONNECTION_LABEL = {
  connecting: 'connecting',
  open: 'live',
  reconnecting: 'reconnecting'
}

const CONNECTION_DOT = {
  connecting: 'bg-muted-foreground animate-pulse',
  open: 'bg-success',
  reconnecting: 'bg-warning animate-pulse'
}

interface MetricProps {
  label: string
  value: string
  emphasis?: boolean
}

function Metric({ label, value, emphasis }: MetricProps): ReactNode {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="t-label">{label}</span>
      <span className={cn('tabular-nums', emphasis === true ? 'text-primary' : 'text-foreground')}>
        {value}
      </span>
    </span>
  )
}

interface ConnectionPillProps {
  status: GatewayStatus
}

function ConnectionPill({ status }: ConnectionPillProps): ReactNode {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('size-1.5 rounded-full', CONNECTION_DOT[status])} aria-hidden />
      <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {CONNECTION_LABEL[status]}
      </span>
    </span>
  )
}

export function StatusBar(): ReactNode {
  const { status, activeScreen, loadPhase } = usePiScreens()
  const state = activeScreen?.state
  const hydrated = loadPhase === 'loaded' && state !== undefined
  const queueDepth = hydrated ? state.queue.steering.length + state.queue.followUp.length : 0
  const contextPercent = state?.contextPercent

  return (
    <footer className="hairline-t flex h-8 shrink-0 items-center justify-between gap-4 overflow-x-auto border-border bg-card px-3">
      <div className="flex shrink-0 items-center gap-3">
        <ConnectionPill status={status} />
        <span className="t-label">{activeScreen?.title ?? 'no screen'}</span>
      </div>

      {hydrated ? (
        <div className="flex shrink-0 items-center gap-4">
          <Metric label="model" value={state.model ?? 'unresolved'} />
          <Metric label="think" value={state.thinkingLevel} />
          <Metric
            label="ctx"
            value={
              contextPercent === null || contextPercent === undefined
                ? '—'
                : formatPercent(contextPercent)
            }
            emphasis={
              contextPercent !== null && contextPercent !== undefined && contextPercent > 80
            }
          />
          <Metric label="cost" value={formatUsd(state.costUsd)} />
          <Metric label="queue" value={`${queueDepth}`} emphasis={queueDepth > 0} />
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-4" aria-hidden>
          {[48, 32, 40, 44].map((width, index) => (
            <div key={index} className="h-2 animate-pulse rounded-sm bg-muted" style={{ width }} />
          ))}
        </div>
      )}
    </footer>
  )
}
