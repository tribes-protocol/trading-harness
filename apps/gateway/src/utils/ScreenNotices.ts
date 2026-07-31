import type { ScreenBlock } from '@tribes-harness/protocol/types/ScreenBlock'

import type { ScreenWidgetNotice } from '@/types/ScreenUi'

/**
 * The still-open extension widgets, as transcript blocks for a snapshot.
 *
 * Pi records nothing about a widget in its message list — it is live UI state
 * owned by the extension, not part of the conversation — so a snapshot folded
 * purely from messages omits it. That is the same hole `activeBashBlocks` fills
 * for in-flight `!` runs, and it bites hardest in exactly the case widgets exist
 * for: `/tribes:login` publishes its URL to a widget and then blocks for minutes,
 * so a tab that reloads mid-login would come back to a transcript with no URL in
 * it and no way to get one short of starting over.
 *
 * Notices raised by `notify` are deliberately NOT kept. Those are toasts — Pi
 * discards them once shown, and replaying them on every attach would re-announce
 * an hour of stale messages as though they had just happened.
 */
export function widgetNoticeBlocks(
  widgets: ReadonlyMap<string, ScreenWidgetNotice>
): ScreenBlock[] {
  return [...widgets].map(([id, widget]) => ({
    type: 'notice',
    id,
    level: widget.level,
    text: widget.text
  }))
}
