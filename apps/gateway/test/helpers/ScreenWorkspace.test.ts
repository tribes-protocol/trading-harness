import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { describeScreenWorkspace } from '@/helpers/ScreenWorkspace'

/**
 * The failure this guards produced a real "why are the skills not loaded?": a screen
 * pointed at a scratch directory started cleanly, answered prompts, and simply had no
 * skills, no tribes extensions and the wrong model — because Pi resolves all of that
 * from cwd and says nothing when it is absent.
 */

function makeWorkspace(parts: { pi?: boolean; skills?: boolean; agents?: boolean }): string {
  const root = mkdtempSync(join(tmpdir(), 'pi-screen-workspace-'))
  if (parts.pi === true) {
    mkdirSync(join(root, '.pi'))
  }
  if (parts.skills === true) {
    mkdirSync(join(root, '.pi', 'skills'), { recursive: true })
  }
  if (parts.agents === true) {
    writeFileSync(join(root, 'AGENTS.md'), '# harness\n')
  }
  return root
}

describe('describeScreenWorkspace', () => {
  it('reports nothing missing for a real harness checkout', () => {
    const root = makeWorkspace({ pi: true, skills: true, agents: true })
    expect(describeScreenWorkspace(root)).toEqual([])
  })

  it('names everything missing from a scratch directory', () => {
    const root = makeWorkspace({})
    const missing = describeScreenWorkspace(root)
    expect(missing).toHaveLength(3)
    expect(missing.join(' ')).toContain('.pi/')
    expect(missing.join(' ')).toContain('skills')
    expect(missing.join(' ')).toContain('AGENTS.md')
  })

  it('catches a checkout with .pi but no skill catalog', () => {
    // The shape a broken `.pi/skills -> ../skills` symlink leaves behind: Pi loads
    // the extensions and the model pin but the agent has no skills at all.
    const root = makeWorkspace({ pi: true, agents: true })
    expect(describeScreenWorkspace(root)).toEqual(['.pi/skills (the skill catalog)'])
  })

  it('catches a missing operating prompt on its own', () => {
    const root = makeWorkspace({ pi: true, skills: true })
    expect(describeScreenWorkspace(root)).toEqual(['AGENTS.md (the operating prompt)'])
  })
})
