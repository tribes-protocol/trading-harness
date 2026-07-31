import { describe, expect, it } from 'vitest'

import type { ScreenUiNotice } from '@/types/ScreenUi'
import { createScreenUiContext } from '@/utils/ScreenUiContext'

const ESC = String.fromCharCode(27)

function collect(): { notices: ScreenUiNotice[]; emitNotice: (notice: ScreenUiNotice) => void } {
  const notices: ScreenUiNotice[] = []
  return {
    notices,
    emitNotice: (notice) => {
      notices.push(notice)
    }
  }
}

describe('createScreenUiContext', () => {
  describe('notify', () => {
    it('emits the message at the level the extension asked for', () => {
      const { notices, emitNotice } = collect()
      createScreenUiContext({ emitNotice }).notify('Logged in.', 'info')

      expect(notices).toHaveLength(1)
      expect(notices[0]?.text).toBe('Logged in.')
      expect(notices[0]?.level).toBe('info')
    })

    it('defaults to info when no level is given', () => {
      const { notices, emitNotice } = collect()
      createScreenUiContext({ emitNotice }).notify('something happened')

      expect(notices[0]?.level).toBe('info')
    })

    it('keeps repeated identical messages as separate notices', () => {
      // Ids drive replacement downstream. Two toasts with the same text are two
      // events; if they shared an id the second would overwrite the first and the
      // operator would see one message where the extension raised two.
      const { notices, emitNotice } = collect()
      const ui = createScreenUiContext({ emitNotice })
      ui.notify('retrying')
      ui.notify('retrying')

      expect(notices).toHaveLength(2)
      expect(notices[0]?.id).not.toBe(notices[1]?.id)
    })

    it('does not survive a re-attach', () => {
      const { notices, emitNotice } = collect()
      createScreenUiContext({ emitNotice }).notify('Logged in.')

      expect(notices[0]?.persist).toBe(false)
    })
  })

  describe('setWidget', () => {
    it('joins the lines and strips the terminal escapes around them', () => {
      // THE BUG THIS EXISTS FOR: `/tribes:login` publishes its browser URL through
      // setWidget. With no UI context bound the call was discarded, so the command
      // ran to completion and printed nothing — indistinguishable from a no-op.
      const { notices, emitNotice } = collect()
      createScreenUiContext({ emitNotice }).setWidget('tribes:login', [
        `${ESC}[1mOpen this URL and approve this agent:${ESC}[22m`,
        `${ESC}[34mhttp://localhost:3000/agents/login?id=abc${ESC}[39m`
      ])

      expect(notices[0]?.text).toBe(
        'Open this URL and approve this agent:\nhttp://localhost:3000/agents/login?id=abc'
      )
    })

    it('reuses one id per key so an updating widget replaces rather than stacks', () => {
      // The login widget is rewritten on every chunk the child process prints. A
      // fresh id per write would turn one panel into one transcript entry per chunk.
      const { notices, emitNotice } = collect()
      const ui = createScreenUiContext({ emitNotice })
      ui.setWidget('tribes:login', ['waiting…'])
      ui.setWidget('tribes:login', ['waiting… still'])

      expect(notices[0]?.id).toBe(notices[1]?.id)
    })

    it('gives different keys different ids', () => {
      const { notices, emitNotice } = collect()
      const ui = createScreenUiContext({ emitNotice })
      ui.setWidget('one', ['a'])
      ui.setWidget('two', ['b'])

      expect(notices[0]?.id).not.toBe(notices[1]?.id)
    })

    it('clears the widget with a null text when content is undefined', () => {
      const { notices, emitNotice } = collect()
      const ui = createScreenUiContext({ emitNotice })
      ui.setWidget('tribes:login', ['waiting…'])
      ui.setWidget('tribes:login', undefined)

      expect(notices[1]?.text).toBeNull()
      expect(notices[1]?.id).toBe(notices[0]?.id)
    })

    it('survives a re-attach while it is open', () => {
      const { notices, emitNotice } = collect()
      createScreenUiContext({ emitNotice }).setWidget('tribes:login', ['url here'])

      expect(notices[0]?.persist).toBe(true)
    })

    it('says so rather than silently dropping a terminal-only component widget', () => {
      const { notices, emitNotice } = collect()
      createScreenUiContext({ emitNotice }).setWidget('fancy', () => {
        throw new Error('the factory is never invoked on a headless screen')
      })

      expect(notices).toHaveLength(1)
      expect(notices[0]?.level).toBe('warning')
    })
  })

  describe('dialogs', () => {
    // Each of these would otherwise hang forever. Extension commands run OUTSIDE
    // the agent turn, so a wedged dialog leaves the screen reporting IDLE with no
    // sign that anything is waiting — the operator sees a command that did nothing.
    it('declines a confirm instead of hanging', async () => {
      const { notices, emitNotice } = collect()
      const ui = createScreenUiContext({ emitNotice })

      await expect(ui.confirm('Already logged in', 'Log in again?')).resolves.toBe(false)
      expect(notices[0]?.level).toBe('warning')
    })

    it('declines a select instead of hanging', async () => {
      const { emitNotice } = collect()
      const ui = createScreenUiContext({ emitNotice })

      await expect(ui.select('Pick one', ['a', 'b'])).resolves.toBeUndefined()
    })

    it('declines an input instead of hanging', async () => {
      const { emitNotice } = collect()
      const ui = createScreenUiContext({ emitNotice })

      await expect(ui.input('Name?')).resolves.toBeUndefined()
    })

    it('declines an editor instead of hanging', async () => {
      const { emitNotice } = collect()
      const ui = createScreenUiContext({ emitNotice })

      await expect(ui.editor('Edit this')).resolves.toBeUndefined()
    })

    it('names the dialog it declined so the refusal is actionable', async () => {
      const { notices, emitNotice } = collect()
      const ui = createScreenUiContext({ emitNotice })
      await ui.confirm('Already logged in', 'Log in again?')

      expect(notices[0]?.text).toContain('Already logged in')
    })
  })

  it('reports no UI-owned theme switching rather than pretending it worked', () => {
    const { emitNotice } = collect()
    expect(createScreenUiContext({ emitNotice }).setTheme('dark').success).toBe(false)
  })
})
