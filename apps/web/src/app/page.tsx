import type { ReactNode } from 'react'

import { ScreenWorkspace } from '@/components/layout/ScreenWorkspace'
import { StatusBar } from '@/components/ui/StatusBar'
import { PiScreensProvider } from '@/providers/PiScreensProvider'

export default function Page(): ReactNode {
  return (
    <PiScreensProvider>
      <div className="flex h-dvh flex-col overflow-hidden">
        <ScreenWorkspace />
        <StatusBar />
      </div>
    </PiScreensProvider>
  )
}
