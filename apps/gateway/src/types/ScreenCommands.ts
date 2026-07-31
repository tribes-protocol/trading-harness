import type { PromptTemplate, ResolvedCommand, Skill } from '@earendil-works/pi-coding-agent'

/**
 * The three catalogs a `/` command can come from, already pulled off the session.
 *
 * Taken as plain arrays rather than as an `AgentSession` so the mapping stays a
 * pure function: an `AgentSession` cannot be constructed in a unit test without
 * booting a real agent, and the thing worth testing here is the naming, not the
 * getters.
 *
 * These are Pi's own types on purpose. `invocationName` and the `skill:` prefix
 * are the whole contract — a rename upstream must fail the build here, not
 * silently ship a palette full of names the operator cannot invoke.
 */
export type ScreenCommandSources = {
  extensionCommands: readonly ResolvedCommand[]
  promptTemplates: readonly PromptTemplate[]
  skills: readonly Skill[]
}
