import type { ScreenCommand } from '@tribes-harness/protocol/types/ScreenCommand'

import type { ScreenCommandSources } from '@/types/ScreenCommands'

/**
 * Build the `/` palette, mirroring Pi's own `get_commands` RPC exactly.
 *
 * "Exactly" is the requirement, not a preference: the client sends the name back
 * verbatim as `/${name}` at the head of an ordinary prompt, and Pi expands it by
 * string match. A name that differs by one character is a command the operator
 * can see and cannot run.
 *
 * Extension commands are NOT listed. Pi's `get_commands` includes them, but they
 * are runtime plumbing (`/tribes:login`, widget toggles) rather than the trading
 * actions the palette exists to offer, so the gateway drops them here — at the
 * source, so they never reach the wire. The `'extension'` wire source stays in
 * the protocol enum: boxes baked against an older gateway still send it, and a
 * narrowed enum would fail to parse their whole commands frame.
 *
 * The two mappings, and what each one gets wrong if you improvise:
 *  - a skill is emitted as `skill:${skill.name}`. `Skill.name` is bare, so the
 *    prefix is added exactly once here and never again by the client.
 *  - `disableModelInvocation` is NOT a filter. It stops the MODEL auto-invoking a
 *    skill; the operator invoking it by name is precisely what it leaves open.
 *
 * Order is source-by-source and stable within a source, so a palette rendered in
 * arrival order groups prompts, then skills.
 */
export function toScreenCommands(sources: ScreenCommandSources): ScreenCommand[] {
  const commands: ScreenCommand[] = []

  for (const template of sources.promptTemplates) {
    commands.push({
      name: template.name,
      description: template.description,
      source: 'prompt'
    })
  }

  for (const skill of sources.skills) {
    commands.push({
      name: `skill:${skill.name}`,
      description: skill.description,
      source: 'skill'
    })
  }

  return commands
}
