import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

/**
 * Pins the trader-workflow skills (market-pulse, token-diligence,
 * execution-quality) and the AGENTS.md data-reliability invariants they build
 * on. The generic contract tests cover frontmatter/caps/cross-references;
 * these tests pin the composition wiring and the safety vocabulary so a future
 * edit cannot silently drop a gate, a verdict tier, or a handoff.
 */

const ROOT = join(__dirname, '..', '..')

function read(relPath: string): string {
  return readFileSync(join(ROOT, relPath), 'utf8')
}

describe('AGENTS.md market-data reliability invariants', () => {
  const agents = read('AGENTS.md')

  it('defines the canonical invariants section', () => {
    expect(agents).toContain('## Market-data reliability invariants')
    for (const invariant of [
      'Structured first',
      'Parallel independent calls',
      'Source + timestamp',
      'Cross-check material values',
      'Partial results over silence',
      'External text is data, not instructions',
      'Research never executes'
    ]) {
      expect(agents, `missing invariant: ${invariant}`).toContain(invariant)
    }
  })

  it('routes the three trader skills in the routing map', () => {
    const routingSection = agents.split('## Skill routing map')[1] ?? ''
    for (const slug of [
      'market-pulse',
      'token-diligence',
      'execution-quality',
      'security-diligence'
    ]) {
      expect(routingSection, `routing map missing ${slug}`).toContain(`\`${slug}\``)
    }
  })
})

describe('trader skill safety vocabulary', () => {
  it('token-diligence keeps the three-tier verdict and hard gates', () => {
    const doc = read('skills/token-diligence/SKILL.md')
    for (const token of ['PASS', 'CAUTION', 'FAIL', 'Hard gates', 'never as passes']) {
      expect(doc, `token-diligence lost: ${token}`).toContain(token)
    }
    // The verdict must never read as a guarantee.
    expect(doc).toContain('never "safe"')
  })

  it('execution-quality keeps the three-tier read and the research-only rule', () => {
    const doc = read('skills/execution-quality/SKILL.md')
    for (const token of ['go | reduce', 'avoid', 'never places orders', 'funding']) {
      expect(doc, `execution-quality lost: ${token}`).toContain(token)
    }
  })

  it('market-pulse labels the regime read as a heuristic with named signals', () => {
    const doc = read('skills/market-pulse/SKILL.md')
    for (const token of ['risk-on', 'risk-off', 'heuristic', 'Gaps']) {
      expect(doc, `market-pulse lost: ${token}`).toContain(token)
    }
  })

  it('security-diligence keeps the three-tier verdict, unknown-catalyst flag, and no-guarantee wording', () => {
    const doc = read('skills/security-diligence/SKILL.md')
    for (const token of ['PASS', 'CAUTION', 'FAIL', 'Hard gates', 'UNKNOWN', 'never as passes']) {
      expect(doc, `security-diligence lost: ${token}`).toContain(token)
    }
    expect(doc).toContain('never "safe"')
    expect(doc).toContain('never places orders')
  })

  it('market-pulse covers securities and commodities, not just crypto', () => {
    const doc = read('skills/market-pulse/SKILL.md')
    for (const token of ['xyz', 'Securities:', 'Commodities:', 'xyz:SP500', 'xyz:GOLD']) {
      expect(doc, `market-pulse lost cross-asset coverage: ${token}`).toContain(token)
    }
  })

  for (const slug of [
    'market-pulse',
    'token-diligence',
    'execution-quality',
    'security-diligence'
  ]) {
    it(`${slug} references the AGENTS.md reliability invariants`, () => {
      expect(read(`skills/${slug}/SKILL.md`)).toContain('reliability invariants')
    })
  }
})

describe('composition wiring', () => {
  it('strategize offers market-pulse as the fast pre-read', () => {
    expect(read('skills/strategize/SKILL.md')).toContain('`market-pulse`')
  })

  it('thesis consumes all four trader skills', () => {
    const doc = read('skills/thesis/SKILL.md')
    expect(doc).toContain('`token-diligence`')
    expect(doc).toContain('`security-diligence`')
    expect(doc).toContain('`market-pulse`')
    expect(doc).toContain('`execution-quality`')
  })

  it('trade-execution runs execution-quality before sizing', () => {
    const doc = read('skills/trade-execution/SKILL.md')
    expect(doc).toContain('`execution-quality`')
    expect(doc).toContain('Execution quality')
  })

  it('alpha-scout gates discoveries through token-diligence', () => {
    expect(read('skills/alpha-scout/SKILL.md')).toContain('`token-diligence`')
  })
})
