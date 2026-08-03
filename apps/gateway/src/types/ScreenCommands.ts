import type { PromptTemplate, Skill } from '@earendil-works/pi-coding-agent'

/**
 * The two catalogs a `/` command can come from, already pulled off the session.
 *
 * Extension commands are deliberately absent: they are Pi's own plumbing (and
 * this harness's), not operator-facing trading actions, so the palette lists
 * prompts and skills only.
 *
 * Taken as plain arrays rather than as an `AgentSession` so the mapping stays a
 * pure function: an `AgentSession` cannot be constructed in a unit test without
 * booting a real agent, and the thing worth testing here is the naming, not the
 * getters.
 *
 * These are Pi's own types on purpose. The `skill:` prefix is the whole contract
 * — a rename upstream must fail the build here, not silently ship a palette full
 * of names the operator cannot invoke.
 */
export type ScreenCommandSources = {
  promptTemplates: readonly PromptTemplate[]
  skills: readonly Skill[]
}
