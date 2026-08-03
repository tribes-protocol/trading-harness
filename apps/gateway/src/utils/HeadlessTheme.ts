import { Theme, type ThemeColor } from '@earendil-works/pi-coding-agent'

/**
 * The `Theme` an extension sees through `ctx.ui.theme` on a headless screen.
 *
 * `ExtensionUIContext` requires one, and Pi's own modes all hand over the
 * interactive singleton — which this package does not export (the `exports` map
 * stops at the root and `./rpc-entry`, so its module is unreachable). So the
 * gateway supplies its own.
 *
 * Every colour is the terminal's DEFAULT rather than a palette entry, because an
 * extension that calls `theme.fg(...)` here is colouring text bound for a browser,
 * where the escape codes are stripped on the way out (`stripAnsi`). Picking real
 * colours would only widen what has to be stripped; picking the default keeps the
 * wrapping minimal and the intent obvious to anyone reading a raw frame.
 *
 * `256color` over `truecolor` for the same reason: it is the narrower encoding,
 * and nothing here is ever rendered.
 */

const DEFAULT_FG = 39
const DEFAULT_BG = 49

const FG_COLORS: Record<ThemeColor, number> = {
  accent: DEFAULT_FG,
  border: DEFAULT_FG,
  borderAccent: DEFAULT_FG,
  borderMuted: DEFAULT_FG,
  success: DEFAULT_FG,
  error: DEFAULT_FG,
  warning: DEFAULT_FG,
  muted: DEFAULT_FG,
  dim: DEFAULT_FG,
  text: DEFAULT_FG,
  thinkingText: DEFAULT_FG,
  userMessageText: DEFAULT_FG,
  customMessageText: DEFAULT_FG,
  customMessageLabel: DEFAULT_FG,
  toolTitle: DEFAULT_FG,
  toolOutput: DEFAULT_FG,
  mdHeading: DEFAULT_FG,
  mdLink: DEFAULT_FG,
  mdLinkUrl: DEFAULT_FG,
  mdCode: DEFAULT_FG,
  mdCodeBlock: DEFAULT_FG,
  mdCodeBlockBorder: DEFAULT_FG,
  mdQuote: DEFAULT_FG,
  mdQuoteBorder: DEFAULT_FG,
  mdHr: DEFAULT_FG,
  mdListBullet: DEFAULT_FG,
  toolDiffAdded: DEFAULT_FG,
  toolDiffRemoved: DEFAULT_FG,
  toolDiffContext: DEFAULT_FG,
  syntaxComment: DEFAULT_FG,
  syntaxKeyword: DEFAULT_FG,
  syntaxFunction: DEFAULT_FG,
  syntaxVariable: DEFAULT_FG,
  syntaxString: DEFAULT_FG,
  syntaxNumber: DEFAULT_FG,
  syntaxType: DEFAULT_FG,
  syntaxOperator: DEFAULT_FG,
  syntaxPunctuation: DEFAULT_FG,
  thinkingOff: DEFAULT_FG,
  thinkingMinimal: DEFAULT_FG,
  thinkingLow: DEFAULT_FG,
  thinkingMedium: DEFAULT_FG,
  thinkingHigh: DEFAULT_FG,
  thinkingXhigh: DEFAULT_FG,
  bashMode: DEFAULT_FG
}

const BG_COLORS = {
  selectedBg: DEFAULT_BG,
  userMessageBg: DEFAULT_BG,
  customMessageBg: DEFAULT_BG,
  toolPendingBg: DEFAULT_BG,
  toolSuccessBg: DEFAULT_BG,
  toolErrorBg: DEFAULT_BG
}

export const HEADLESS_THEME = new Theme(FG_COLORS, BG_COLORS, '256color', {
  name: 'headless'
})
