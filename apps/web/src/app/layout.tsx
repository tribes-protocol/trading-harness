import './globals.css'

import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Tribes Harness — Pi Screen',
  description: 'Live view of the trading agent: its work on the left, the conversation on the right'
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#0b0e14'
}

interface RootLayoutProps {
  children: ReactNode
}

export default function RootLayout({ children }: RootLayoutProps): ReactNode {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  )
}
