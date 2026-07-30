'use client'

import { type ReactNode } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'

import { ChatPanel } from '@/components/chat/ChatPanel'
import { PiScreenCanvas } from '@/components/screen/PiScreenCanvas'
import { PiScreenTabs } from '@/components/screen/PiScreenTabs'

/**
 * The split. LEFT is what the agent is doing, RIGHT is what it is saying.
 *
 * `autoSaveId` persists the divider through reloads — the operator's chosen balance
 * between watching the work and reading the answers is a preference, not a default.
 */

const DEFAULT_CANVAS_SIZE = 48

export function ScreenWorkspace(): ReactNode {
  return (
    <PanelGroup direction="horizontal" autoSaveId="pi-screen-workspace" className="min-h-0 flex-1">
      <Panel defaultSize={DEFAULT_CANVAS_SIZE} minSize={25} order={1}>
        <div className="flex h-full min-h-0 flex-col">
          <PiScreenTabs />
          <PiScreenCanvas />
        </div>
      </Panel>
      <PanelResizeHandle className="panel-resizer shrink-0 cursor-col-resize" />
      <Panel defaultSize={100 - DEFAULT_CANVAS_SIZE} minSize={30} order={2}>
        <ChatPanel />
      </Panel>
    </PanelGroup>
  )
}
