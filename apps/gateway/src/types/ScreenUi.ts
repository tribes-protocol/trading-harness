import type { ScreenNoticeLevel } from '@tribes-harness/protocol/types/ScreenEvent'

/**
 * One message an extension asked the host to show.
 *
 * `text: null` CLEARS the notice with this id — a widget removing itself.
 */
export interface ScreenUiNotice {
  id: string
  level: ScreenNoticeLevel
  text: string | null
  /**
   * Whether this notice survives a re-attach. True for a widget, which is standing
   * UI the extension expects to remain until it clears it; false for a `notify`
   * toast, which has already been shown once and would be a lie the second time.
   */
  persist: boolean
}

export interface ScreenUiContextParams {
  emitNotice: (notice: ScreenUiNotice) => void
}

/** A widget currently on screen, held so a re-attach can rebuild it. */
export interface ScreenWidgetNotice {
  level: ScreenNoticeLevel
  text: string
}
