import { describe, expect, it } from 'vitest'

import type { ScreenWidgetNotice } from '@/types/ScreenUi'
import { widgetNoticeBlocks } from '@/utils/ScreenNotices'

describe('widgetNoticeBlocks', () => {
  it('is empty when no widget is open', () => {
    expect(widgetNoticeBlocks(new Map())).toEqual([])
  })

  it('rebuilds an open widget as a notice block keyed by its id', () => {
    // A snapshot is folded from Pi's message list, which never mentions a widget.
    // Without this a tab that reloads mid-login comes back to a transcript with the
    // login URL missing and no way to recover it short of starting over.
    const widgets = new Map<string, ScreenWidgetNotice>([
      ['widget:tribes:login', { level: 'info', text: 'http://localhost:3000/agents/login?id=abc' }]
    ])

    expect(widgetNoticeBlocks(widgets)).toEqual([
      {
        type: 'notice',
        id: 'widget:tribes:login',
        level: 'info',
        text: 'http://localhost:3000/agents/login?id=abc'
      }
    ])
  })

  it('keeps every open widget', () => {
    const widgets = new Map<string, ScreenWidgetNotice>([
      ['widget:a', { level: 'info', text: 'one' }],
      ['widget:b', { level: 'warning', text: 'two' }]
    ])

    expect(widgetNoticeBlocks(widgets)).toHaveLength(2)
  })
})
