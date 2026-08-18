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

// scripts/skills-upgrade.mjs stamps this provenance line after the H1 of every
// vendored skill, and `bun run format` then pads it with a blank line. Upstream
// (harnesses/setup/test/skills-contract.test.sh) budgets the SAME 300 lines we
// do, measured on the file its authors wrote — so counting our own two injected
// lines against that budget makes the cap unsatisfiable for any upstream doc
// that uses it fully (zipbox-image: 299 authored, 301 vendored). Measure what
// upstream wrote; the cap itself is unchanged.
const SYNC_MARKER = '<!-- synced from tribes-protocol/terminal — edit there, not here -->'

function authoredLineCount(raw: string): number {
  const lines = raw.trimEnd().split('\n')
  const marker = lines.indexOf(SYNC_MARKER)
  if (marker === -1) return lines.length
  lines.splice(marker, lines[marker + 1] === '' ? 2 : 1)
  return lines.length
}

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
        const lines = authoredLineCount(parsed.raw)
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

/**
 * Guards the marker exclusion in authoredLineCount above.
 *
 * The exclusion exists because the two caps measure different artifacts: terminal
 * enforces 300 on the file its authors write, and the vendor step hands this repo
 * that file plus two injected lines. The correct fix is to stop counting the two
 * injected lines — NOT to raise the cap to 302, which would also let a genuinely
 * over-long doc through. These cases pin that difference so the "simplification"
 * fails a test instead of quietly buying 2 lines of slack.
 *
 * They also pin the coupling: if upstream changes the marker text, or the vendor
 * step starts injecting a third line, the first two cases go red rather than the
 * cap silently drifting.
 */
describe('authored line count', () => {
  const HEAD_LINES = 8 // frontmatter (5) + blank + H1 + blank

  function vendoredDoc(bodyLines: number, withMarker: boolean): string {
    const head = [
      '---',
      'name: x',
      'description: d',
      'allowed-tools: bash read',
      '---',
      '',
      '# X',
      ''
    ]
    const marker = withMarker ? [SYNC_MARKER, ''] : []
    const body = Array.from({ length: bodyLines }, (_, i) => `line ${i + 1}`)
    return [...head, ...marker, ...body].join('\n')
  }

  it('counts a doc that carries no marker exactly as written', () => {
    const raw = vendoredDoc(10, false)
    expect(authoredLineCount(raw)).toBe(raw.trimEnd().split('\n').length)
    expect(authoredLineCount(raw)).toBe(HEAD_LINES + 10)
  })

  it('subtracts exactly the two injected lines, so a vendored doc counts as authored', () => {
    const vendored = vendoredDoc(10, true)
    const authored = vendoredDoc(10, false)
    expect(vendored.trimEnd().split('\n').length).toBe(HEAD_LINES + 10 + 2)
    expect(authoredLineCount(vendored)).toBe(authoredLineCount(authored))
    expect(authoredLineCount(vendored)).toBe(HEAD_LINES + 10)
  })

  it('still fails a vendored doc whose AUTHORED content exceeds the cap', () => {
    const raw = vendoredDoc(MAX_LINES + 3 - HEAD_LINES, true)
    expect(raw.trimEnd().split('\n').length).toBe(MAX_LINES + 5)
    expect(authoredLineCount(raw)).toBe(MAX_LINES + 3)
    expect(authoredLineCount(raw)).toBeGreaterThan(MAX_LINES)
  })

  it('passes a vendored doc that spends its full authored budget', () => {
    const raw = vendoredDoc(MAX_LINES - HEAD_LINES, true)
    expect(raw.trimEnd().split('\n').length).toBe(MAX_LINES + 2)
    expect(authoredLineCount(raw)).toBe(MAX_LINES)
    expect(authoredLineCount(raw)).toBeLessThanOrEqual(MAX_LINES)
  })
})
