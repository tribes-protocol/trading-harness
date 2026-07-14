import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

/**
 * Contract tests for the operator-facing skill docs under skills/.
 *
 * The skills audit (skills-restructure branch) found real drift: stale binary
 * names, a forbidden wallet-snapshot path, cross-references to skills that do
 * not exist, and rules restated until they contradicted each other. These
 * tests pin the invariants so drift fails CI instead of confusing the
 * operator model.
 */

const SKILLS_DIR = join(__dirname, '..', '..', 'skills')
const AGENTS_MD = join(__dirname, '..', '..', 'AGENTS.md')

const FRONTMATTER_KEYS = new Set([
  'name',
  'description',
  'allowed-tools',
  'disable-model-invocation'
])

// Strings that must never appear in a skill doc: the only binary is
// `tribes-cli`, and "Endpoint Contract" sections tempt the model to bypass it.
const FORBIDDEN = ['transaction-cli', 'token-cli', 'spot-trading-cli', 'Endpoint Contract']

// May be mentioned only as a NEVER-read rule.
const PRIVY_SNAPSHOT = '.tribes/privy-wallets.json'

const MAX_LINES = 300

function skillSlugs(): string[] {
  return readdirSync(SKILLS_DIR).filter((entry) => statSync(join(SKILLS_DIR, entry)).isDirectory())
}

interface ParsedSkill {
  frontmatter: Map<string, string>
  body: string
  raw: string
}

function parseSkill(slug: string): ParsedSkill {
  const raw = readFileSync(join(SKILLS_DIR, slug, 'SKILL.md'), 'utf8')
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  expect(match, `${slug}: SKILL.md must start with a --- frontmatter block`).not.toBeNull()
  const frontmatter = new Map<string, string>()
  let currentKey = ''
  const frontmatterBlock = match ? match[1] : ''
  const body = match ? match[2] : ''
  for (const line of (frontmatterBlock ?? '').split('\n')) {
    const keyMatch = line.match(/^([a-z-]+):\s*(.*)$/)
    if (keyMatch && keyMatch[1]) {
      currentKey = keyMatch[1]
      frontmatter.set(currentKey, keyMatch[2] ?? '')
    } else if (currentKey) {
      frontmatter.set(currentKey, `${frontmatter.get(currentKey) ?? ''} ${line.trim()}`.trim())
    }
  }
  return { frontmatter, body: body ?? '', raw }
}

describe('skill docs contract', () => {
  const slugs = skillSlugs()

  it('has a SKILL.md in every skill directory', () => {
    expect(slugs.length).toBeGreaterThanOrEqual(20)
    for (const slug of slugs) {
      expect(() => statSync(join(SKILLS_DIR, slug, 'SKILL.md')), slug).not.toThrow()
    }
  })

  for (const slug of skillSlugs()) {
    describe(slug, () => {
      const parsed = parseSkill(slug)

      it('frontmatter: name matches directory, keys are the template set', () => {
        expect(parsed.frontmatter.get('name')).toBe(slug)
        expect(parsed.frontmatter.get('description'), 'description required').toBeTruthy()
        expect(parsed.frontmatter.get('allowed-tools')).toBe('bash read')
        for (const key of parsed.frontmatter.keys()) {
          expect(FRONTMATTER_KEYS.has(key), `unexpected frontmatter key: ${key}`).toBe(true)
        }
      })

      it('has an H1 title and stays within the line cap', () => {
        expect(parsed.body).toMatch(/^\n*# .+/)
        const lines = parsed.raw.trimEnd().split('\n').length
        expect(lines, `SKILL.md is ${lines} lines; cap is ${MAX_LINES}`).toBeLessThanOrEqual(
          MAX_LINES
        )
      })

      it('contains no forbidden strings', () => {
        for (const forbidden of FORBIDDEN) {
          expect(parsed.raw.includes(forbidden), `found forbidden string: ${forbidden}`).toBe(false)
        }
        for (const line of parsed.raw.split('\n')) {
          if (line.includes(PRIVY_SNAPSHOT)) {
            expect(
              line.includes('NEVER'),
              `${PRIVY_SNAPSHOT} may appear only in a NEVER rule`
            ).toBe(true)
          }
        }
      })

      it('cross-references only skills that exist', () => {
        const slugSet = new Set(skillSlugs())
        const description = parsed.frontmatter.get('description') ?? ''
        for (const match of description.matchAll(/\(use ([a-z0-9-]+)/g)) {
          const referenced = match[1] ?? ''
          expect(
            slugSet.has(referenced),
            `description references unknown skill: ${referenced}`
          ).toBe(true)
        }
        const relatedSection = parsed.body.split('## Related skills')[1]
        if (relatedSection !== undefined) {
          for (const match of relatedSection.matchAll(/^- `([a-z0-9-]+)`/gm)) {
            const referenced = match[1] ?? ''
            expect(
              slugSet.has(referenced),
              `Related skills references unknown: ${referenced}`
            ).toBe(true)
          }
        }
      })
    })
  }
})

describe('AGENTS.md routing map', () => {
  it('routes only to skills that exist', () => {
    const slugSet = new Set(skillSlugs())
    const raw = readFileSync(AGENTS_MD, 'utf8')
    const routingSection = raw.split('## Skill routing map')[1]?.split('\n## ')[0] ?? ''
    expect(routingSection.length, 'routing map section must exist').toBeGreaterThan(0)
    const referenced = new Set<string>()
    for (const match of routingSection.matchAll(/`([a-z0-9-]+)`/g)) {
      const token = match[1] ?? ''
      if (slugSet.has(token)) referenced.add(token)
      else expect(token, `routing map references unknown skill: ${token}`).toBe('')
    }
    // Every routable skill (all but the user-invoked login flow) appears in the map.
    for (const slug of slugSet) {
      if (slug === 'tribes-login') continue
      expect(referenced.has(slug), `routing map is missing skill: ${slug}`).toBe(true)
    }
  })
})
