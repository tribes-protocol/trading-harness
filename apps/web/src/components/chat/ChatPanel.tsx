'use client'

import { type ReactNode } from 'react'

import { ChatComposer } from '@/components/chat/ChatComposer'
import { ChatConversation } from '@/components/chat/ChatConversation'
import { usePiScreens } from '@/providers/PiScreensProvider'
import { cn } from '@/utils/Ui'

/** The RIGHT panel: conversation above, composer pinned to the bottom. */

const STATUS_STYLE = {
  idle: 'text-muted-foreground',
  streaming: 'text-primary',
  compacting: 'text-info',
  retrying: 'text-warning'
}

export function ChatPanel(): ReactNode {
  const { activeScreen, loadPhase, sendPrompt, abort } = usePiScreens()
  const status = activeScreen?.state.status ?? 'idle'
  const queue = activeScreen?.state.queue
  const queueDepth = (queue?.steering.length ?? 0) + (queue?.followUp.length ?? 0)

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="hairline-b flex h-9 shrink-0 items-center justify-between border-border bg-card px-3">
        <span className="t-label">Conversation</span>
        <span
          className={cn(
            'text-[10px] uppercase tracking-[0.16em]',
            loadPhase === 'loaded' ? STATUS_STYLE[status] : 'text-muted-foreground'
          )}
        >
          {loadPhase === 'loaded' ? status : '—'}
        </span>
      </div>

      <ChatConversation screen={activeScreen} phase={loadPhase} />

      <ChatComposer
        disabled={loadPhase !== 'loaded'}
        streaming={status === 'streaming'}
        queueDepth={queueDepth}
        onSend={sendPrompt}
        onAbort={abort}
      />
    </div>
  )
}
