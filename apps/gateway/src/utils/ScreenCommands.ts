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
 * The three mappings, and what each one gets wrong if you improvise:
 *  - extension commands use `invocationName`, NOT `name`. The two differ when two
 *    extensions register the same command and Pi namespaces one of them.
 *  - a skill is emitted as `skill:${skill.name}`. `Skill.name` is bare, so the
 *    prefix is added exactly once here and never again by the client.
 *  - `disableModelInvocation` is NOT a filter. It stops the MODEL auto-invoking a
 *    skill; the operator invoking it by name is precisely what it leaves open.
 *
 * Order is source-by-source and stable within a source, so a palette rendered in
 * arrival order groups extension commands, then prompts, then skills.
 */
export function toScreenCommands(sources: ScreenCommandSources): ScreenCommand[] {
  const commands: ScreenCommand[] = []

  for (const command of sources.extensionCommands) {
    commands.push({
      name: command.invocationName,
      // Explicitly null rather than absent: an extension may register without a
      // description, and a missing key is harder to read on the wire than a null.
      description: command.description ?? null,
      source: 'extension'
    })
  }

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
