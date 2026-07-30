'use client'

import { CornerDownLeft, Square } from 'lucide-react'
import { type KeyboardEvent, type ReactNode, useState } from 'react'

import { cn } from '@/utils/Ui'

/**
 * The prompt box.
 *
 * Enter sends, Shift+Enter opens a line. While the agent is streaming the send still
 * works — the provider tags it `steer`, Pi's "land this after the current turn's tool
 * calls" — and the Stop button aborts the run outright.
 */

interface ChatComposerProps {
  disabled: boolean
  streaming: boolean
  queueDepth: number
  onSend: (text: string) => void
  onAbort: () => void
}

export function ChatComposer({
  disabled,
  streaming,
  queueDepth,
  onSend,
  onAbort
}: ChatComposerProps): ReactNode {
  const [text, setText] = useState('')
  const canSend = !disabled && text.trim().length > 0
  // A disabled composer means the screen is unusable (no snapshot yet, or the wire
  // version was refused). Stop has to go with it — the provider drops the frame in
  // that state, and a button that silently does nothing is worse than no button.
  const canAbort = streaming && !disabled

  const send = (): void => {
    if (!canSend) {
      return
    }
    onSend(text)
    setText('')
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== 'Enter' || event.shiftKey) {
      return
    }
    event.preventDefault()
    send()
  }

  return (
    <div className="hairline-t shrink-0 border-border bg-card px-3 py-2.5">
      <div className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled}
          rows={1}
          placeholder={streaming ? 'Steer the run…' : 'Prompt the agent…'}
          aria-label="Prompt"
          className="field-sizing-content max-h-40 min-h-[1.6rem] flex-1 resize-none bg-transparent text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
        />
        {canAbort ? (
          <button
            type="button"
            onClick={onAbort}
            className="hairline flex shrink-0 items-center gap-1.5 rounded-sm border-destructive/60 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-destructive transition-colors hover:bg-destructive/10"
          >
            <Square className="size-2.5 fill-current" aria-hidden />
            Stop
          </button>
        ) : null}
        <button
          type="button"
          onClick={send}
          disabled={!canSend}
          className={cn(
            'hairline flex shrink-0 items-center gap-1.5 rounded-sm px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] transition-colors',
            canSend
              ? 'border-primary text-primary hover:bg-primary/10'
              : 'border-border text-muted-foreground opacity-50'
          )}
        >
          <CornerDownLeft className="size-2.5" aria-hidden />
          {streaming ? 'Steer' : 'Send'}
        </button>
      </div>
      <div className="mt-1.5 flex items-center gap-3">
        <span className="t-label">Enter sends · Shift+Enter newline</span>
        {queueDepth > 0 ? (
          <span className="text-[10px] uppercase tracking-[0.14em] text-warning">
            {queueDepth} queued
          </span>
        ) : null}
      </div>
    </div>
  )
}
