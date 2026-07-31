import type {
  PromptTemplate,
  ResolvedCommand,
  Skill,
  SourceInfo
} from '@earendil-works/pi-coding-agent'
import { describe, expect, it } from 'vitest'

import { toScreenCommands } from '@/utils/ScreenCommands'

/**
 * The fixtures are typed against Pi's real interfaces, not against a convenient
 * subset. `invocationName` and the bare `Skill.name` are the entire contract this
 * file guards, so a rename upstream has to fail here rather than at runtime in a
 * palette the operator cannot invoke.
 */
const SOURCE_INFO: SourceInfo = {
  path: '/host/path/thing',
  source: 'tribes',
  scope: 'project',
  origin: 'top-level'
}

function extensionCommand(params: {
  name: string
  invocationName: string
  description?: string
}): ResolvedCommand {
  return {
    name: params.name,
    invocationName: params.invocationName,
    description: params.description,
    sourceInfo: SOURCE_INFO,
    handler: async () => {}
  }
}

function promptTemplate(name: string, description: string): PromptTemplate {
  return {
    name,
    description,
    content: `# ${name}`,
    sourceInfo: SOURCE_INFO,
    filePath: `/host/path/.pi/prompts/${name}.md`
  }
}

function skill(name: string, disableModelInvocation = false): Skill {
  return {
    name,
    description: `the ${name} skill`,
    filePath: `/host/path/skills/${name}/SKILL.md`,
    baseDir: `/host/path/skills/${name}`,
    sourceInfo: SOURCE_INFO,
    disableModelInvocation
  }
}

const EMPTY = { extensionCommands: [], promptTemplates: [], skills: [] }

describe('toScreenCommands', () => {
  it('prefixes a skill exactly once, from a bare skill name', () => {
    const commands = toScreenCommands({ ...EMPTY, skills: [skill('alpha-scout')] })

    expect(commands).toEqual([
      { name: 'skill:alpha-scout', description: 'the alpha-scout skill', source: 'skill' }
    ])
    // The client sends this back as `/skill:alpha-scout`. A second prefix here or
    // there is a command Pi will never match.
    expect(commands[0]?.name.startsWith('skill:skill:')).toBe(false)
  })

  it('uses invocationName for an extension command, not its registered name', () => {
    const commands = toScreenCommands({
      ...EMPTY,
      extensionCommands: [
        extensionCommand({
          name: 'login',
          invocationName: 'tribes:login',
          description: 'Sign in'
        })
      ]
    })

    expect(commands).toEqual([
      { name: 'tribes:login', description: 'Sign in', source: 'extension' }
    ])
  })

  it('keeps a missing extension description nullish', () => {
    const commands = toScreenCommands({
      ...EMPTY,
      extensionCommands: [extensionCommand({ name: 'quiet', invocationName: 'quiet' })]
    })

    expect(commands[0]?.description).toBeNull()
  })

  it('lists a skill whose model invocation is disabled', () => {
    // `disableModelInvocation` stops the MODEL auto-invoking the skill. Invoking
    // it by name is exactly what it leaves open, so it belongs in the palette.
    const commands = toScreenCommands({ ...EMPTY, skills: [skill('trade-execution', true)] })

    expect(commands.map((command) => command.name)).toEqual(['skill:trade-execution'])
  })

  it('emits extensions, then prompts, then skills, stable within each source', () => {
    const commands = toScreenCommands({
      extensionCommands: [
        extensionCommand({ name: 'b', invocationName: 'b' }),
        extensionCommand({ name: 'a', invocationName: 'a' })
      ],
      promptTemplates: [promptTemplate('thesis', 'Write a thesis'), promptTemplate('x', 'X')],
      skills: [skill('zulu'), skill('alpha')]
    })

    expect(commands.map((command) => `${command.source}/${command.name}`)).toEqual([
      'extension/b',
      'extension/a',
      'prompt/thesis',
      'prompt/x',
      'skill/skill:zulu',
      'skill/skill:alpha'
    ])
  })

  it('returns an empty palette when the session has no commands at all', () => {
    expect(toScreenCommands(EMPTY)).toEqual([])
  })
})
