'use client'

import { AlertTriangle, Loader2, MessageSquare } from 'lucide-react'
import { memo, type ReactNode, useMemo } from 'react'

import { ChatMarkdown } from '@/components/chat/ChatMarkdown'
import { AutoScroll } from '@/components/ui/AutoScroll'
import type {
  AssistantScreenBlock,
  ScreenLoadPhase,
  ScreenViewState,
  UserScreenBlock
} from '@/types/ScreenView'

/**
 * The conversation itself: the human's prompts and the agent's prose, nothing else.
 * Tool calls and reasoning belong to the screen canvas on the left — mixing them in
 * here is what turns a chat into a log.
 *
 * Every block is memoized and keyed by its stable id, so a `text_delta` re-renders
 * exactly one node.
 */

interface UserBlockViewProps {
  block: UserScreenBlock
}

const UserBlockView = memo(function UserBlockView({ block }: UserBlockViewProps): ReactNode {
  return (
    <div className="flex justify-end">
      <div className="hairline max-w-[85%] rounded-sm border-border bg-card px-2.5 py-1.5 text-foreground">
        <span className="whitespace-pre-wrap break-words">{block.text}</span>
      </div>
    </div>
  )
})

interface AssistantBlockViewProps {
  block: AssistantScreenBlock
}

/**
 * A `pending` block is the placeholder the turn opened with. The first text delta
 * adopts it IN PLACE — same id, same DOM node — so this spinner is replaced by the
 * reply without a remount and without the viewport jumping.
 */
const AssistantBlockView = memo(function AssistantBlockView({
  block
}: AssistantBlockViewProps): ReactNode {
  if (block.status === 'pending') {
    return (
      <div
        className="flex items-center gap-2 text-muted-foreground"
        aria-live="polite"
        aria-busy="true"
      >
        <Loader2 className="size-3 shrink-0 animate-spin text-primary" aria-hidden />
        <span className="t-label">Working</span>
      </div>
    )
  }
  return (
    <div className="text-foreground">
      <ChatMarkdown content={block.text} />
    </div>
  )
})

function ConversationSkeleton(): ReactNode {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 py-4" aria-hidden>
      {[70, 92, 46].map((width, index) => (
        <div
          key={index}
          className="h-2 animate-pulse rounded-sm bg-muted"
          style={{ width: `${width}%` }}
        />
      ))}
    </div>
  )
}

function ConversationEmpty(): ReactNode {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
      <MessageSquare className="size-4 text-muted-foreground" aria-hidden />
      <p className="t-label">No messages yet</p>
      <p className="max-w-xs text-muted-foreground">
        Send a prompt below. The agent&apos;s work shows on the left, its answers here.
      </p>
    </div>
  )
}

function ConversationError(): ReactNode {
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

interface ChatConversationProps {
  screen: ScreenViewState | null
  /**
   * The whole phase, not an `isLoading` boolean. Collapsed to a boolean, 'error'
   * takes the same branch as 'loaded' and the panel renders "No messages yet" —
   * telling the user the conversation is empty when the truth is the tab never
   * connected. Loading, loaded-and-empty and error have to stay distinct.
   */
  phase: ScreenLoadPhase
}

export function ChatConversation({ screen, phase }: ChatConversationProps): ReactNode {
  const blocks = useMemo(
    () =>
      screen === null
        ? []
        : screen.blocks.filter((block) => block.type === 'user' || block.type === 'assistant'),
    [screen]
  )

  if (phase === 'error') {
    return <ConversationError />
  }

  if (phase === 'connecting' || screen === null) {
    return <ConversationSkeleton />
  }

  if (blocks.length === 0) {
    return <ConversationEmpty />
  }

  return (
    <AutoScroll className="gap-3 px-4 py-4">
      {blocks.map((block) => {
        switch (block.type) {
          case 'user':
            return <UserBlockView key={block.id} block={block} />
          case 'assistant':
            return <AssistantBlockView key={block.id} block={block} />
        }
      })}
    </AutoScroll>
  )
}
