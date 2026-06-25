import fs from 'node:fs'
import path from 'node:path'

import type { ExtensionContext } from '@earendil-works/pi-coding-agent'

const TRIBES_LOGO_LINES = [
  '   ████    ████    ████',
  '   ████    ████    ████',
  '   ████████████████████',
  '   ████████████████████',
  '           ████',
  '           ████',
  '   ████████████████████',
  '   ████████████████████',
  '   ████    ████    ████',
  '   ████    ████    ████'
]

function readHarnessVersion(): string {
  try {
    const pkg: unknown = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8')
    )
    if (
      typeof pkg === 'object' &&
      pkg !== null &&
      'version' in pkg &&
      typeof pkg.version === 'string'
    ) {
      return pkg.version
    }
  } catch {
    // package.json missing or unreadable — fall back to the default version.
  }
  return '0.0.0'
}

export function showWelcome(ctx: ExtensionContext): void {
  const version = readHarnessVersion()
  ctx.ui.setHeader((_tui, theme) => ({
    render(_width: number): string[] {
      const logo = TRIBES_LOGO_LINES.map((line) => theme.fg('text', line))
      const subtitle = `  ${theme.fg('muted', 'welcome to tribes')}${theme.fg('dim', ` v${version}`)}`
      return ['', ...logo, '', subtitle, '']
    },
    invalidate() {}
  }))
}
