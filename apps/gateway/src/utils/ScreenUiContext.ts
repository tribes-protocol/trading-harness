import type { ExtensionUIContext } from '@earendil-works/pi-coding-agent'

import type { ScreenUiContextParams } from '@/types/ScreenUi'
import { stripAnsi } from '@/utils/AnsiText'
import { HEADLESS_THEME } from '@/utils/HeadlessTheme'

/**
 * The `ExtensionUIContext` a hosted screen gives its extensions.
 *
 * Without one, Pi installs its own `noOpUIContext` and every `ctx.ui` call is
 * discarded — which is not a cosmetic loss. `/tribes:login` publishes its browser
 * URL through `setWidget`, so on a screen with no UI context the command runs to
 * completion, prints nothing, and looks exactly like a no-op. Binding this also
 * flips `ctx.hasUI` to true (Pi decides that by identity against its no-op), which
 * is what un-silences the extension's own error reporting.
 *
 * WIDGETS BECOME NOTICES. A TUI widget is a panel pinned by the editor that an
 * extension rewrites in place; there is no such surface in the transcript, so each
 * widget maps to one notice whose id is derived from the widget key. Successive
 * writes replace that notice rather than stacking, which is what keeps a widget
 * that updates per output chunk — the login URL arrives that way — from becoming
 * one transcript entry per chunk.
 *
 * DIALOGS CANNOT BE ANSWERED. `select`, `confirm`, `input` and `editor` need a
 * reply from a human, and this screen has no channel to ask on. They resolve to
 * the same refusal values Pi's own no-op context uses rather than hanging: a
 * dialog that never settles wedges the extension command that opened it, and
 * because extension commands run outside the agent turn, the screen would sit
 * IDLE with no indication anything was waiting. Each refusal announces itself as a
 * warning notice so the operator learns the command wanted an answer it could not
 * be given.
 */

const WIDGET_NOTICE_PREFIX = 'widget:'
const NOTIFY_NOTICE_PREFIX = 'notify:'

export function createScreenUiContext(params: ScreenUiContextParams): ExtensionUIContext {
  const { emitNotice } = params
  // Only ever increments, so two notifications with identical text stay separate
  // entries instead of the second replacing the first.
  let notifyCount = 0

  function refuseDialog(title: string): void {
    emitNotice({
      id: `${NOTIFY_NOTICE_PREFIX}${notifyCount++}`,
      level: 'warning',
      text: `"${stripAnsi(title)}" needs an answer this screen cannot ask for, so it was declined.`,
      persist: false
    })
  }

  const context: ExtensionUIContext = {
    async select(title) {
      refuseDialog(title)
      return undefined
    },
    async confirm(title) {
      refuseDialog(title)
      return false
    },
    async input(title) {
      refuseDialog(title)
      return undefined
    },
    async editor(title) {
      refuseDialog(title)
      return undefined
    },

    notify(message, type) {
      emitNotice({
        id: `${NOTIFY_NOTICE_PREFIX}${notifyCount++}`,
        level: type ?? 'info',
        text: stripAnsi(message),
        persist: false
      })
    },

    // Explicitly typed rather than left to contextual typing: `setWidget` is
    // declared as an overload pair (string lines OR a component factory), and a
    // parameter inferred from one of those signatures cannot be narrowed against
    // the other.
    setWidget(key: string, content: unknown) {
      // A component factory is a TUI construct with nothing to render against
      // here. Dropping it is right, but dropping it SILENTLY is not: the widget
      // is how an extension talks to the operator, so say the panel exists.
      if (!Array.isArray(content) && content !== undefined) {
        emitNotice({
          id: `${WIDGET_NOTICE_PREFIX}${key}`,
          level: 'warning',
          text: `"${key}" drew a terminal-only panel that cannot be shown here.`,
          persist: true
        })
        return
      }
      emitNotice({
        id: `${WIDGET_NOTICE_PREFIX}${key}`,
        level: 'info',
        // `undefined` is the extension clearing the widget.
        text: Array.isArray(content) ? stripAnsi(content.join('\n')) : null,
        persist: true
      })
    },

    // Everything below drives terminal chrome that has no counterpart on a hosted
    // screen. The status bar is fed from session state, not from extensions.
    setStatus() {},
    setTitle() {},
    setWorkingMessage() {},
    setWorkingVisible() {},
    setWorkingIndicator() {},
    setHiddenThinkingLabel() {},
    setFooter() {},
    setHeader() {},
    onTerminalInput() {
      return () => {}
    },
    pasteToEditor() {},
    setEditorText() {},
    getEditorText() {
      return ''
    },
    addAutocompleteProvider() {},
    setEditorComponent() {},
    getEditorComponent() {
      return undefined
    },

    // Rejects rather than resolving to a stand-in value: `custom` is generic in
    // its result, so there is no value that is honestly a `T`. An extension that
    // gets a rejection can handle it; one handed a fake answer cannot tell.
    async custom() {
      throw new Error('custom UI components are not available on a hosted screen')
    },

    get theme() {
      return HEADLESS_THEME
    },
    getAllThemes() {
      return []
    },
    getTheme() {
      return undefined
    },
    setTheme() {
      return { success: false, error: 'theme switching is not available on a hosted screen' }
    },
    getToolsExpanded() {
      return false
    },
    setToolsExpanded() {}
  }

  return context
}
