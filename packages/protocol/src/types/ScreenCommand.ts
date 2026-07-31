import { z } from 'zod'

/**
 * The `/` palette: everything a screen can be asked to run by name.
 *
 * Pi already resolves these itself — a prompt whose text begins `/name` is expanded
 * before it reaches the model, and `/skill:name` loads that skill's instructions. So
 * the client does NOT need a separate invoke frame for them: it sends an ordinary
 * `prompt`. What it cannot do is GUESS the list, which is what this carries.
 *
 * Three sources, and the difference matters to the operator:
 *  - `extension` — a command an extension registered. Runs immediately, even
 *    mid-stream, and manages its own model interaction.
 *  - `prompt`    — a prompt template from a `.md` file. Expands to its text.
 *  - `skill`     — a skill's instructions. Its `name` already carries the `skill:`
 *    prefix Pi expects, so the client must not add one.
 *
 * `!` is deliberately NOT in here. A bash line is not a named command from a
 * catalog — it is arbitrary text — so it rides its own client frame.
 */

export const ScreenCommandSourceSchema = z.enum(['extension', 'prompt', 'skill'])
export type ScreenCommandSource = z.infer<typeof ScreenCommandSourceSchema>

export const ScreenCommandSchema = z.object({
  /**
   * The invocation name WITHOUT the leading slash — `thesis`, `skill:alpha-scout`.
   * Sent back verbatim as `/${name}` at the head of a prompt.
   */
  name: z.string(),
  /** Nullish because an extension command may register without one. */
  description: z.string().nullish(),
  source: ScreenCommandSourceSchema
})
export type ScreenCommand = z.infer<typeof ScreenCommandSchema>
