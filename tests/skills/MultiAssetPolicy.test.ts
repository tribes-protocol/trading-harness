import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = join(__dirname, '..', '..')

function readRepoFile(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8')
}

describe('multi-asset trading policy', () => {
  const agents = readRepoFile('AGENTS.md')
  const strategize = readRepoFile('.pi/skills/strategize/SKILL.md')
  const thesis = readRepoFile('.pi/skills/thesis/SKILL.md')
  const commodityAnalyst = readRepoFile('.pi/skills/commodity-analyst/SKILL.md')
  const hyperliquid = readRepoFile('.pi/skills/hyperliquid/SKILL.md')
  const tradeExecution = readRepoFile('.pi/skills/trade-execution/SKILL.md')
  const judge = readRepoFile('.agents/desk-judge.md')
  const risk = readRepoFile('.agents/desk-risk.md')
  const positionManagement = readRepoFile('.pi/skills/position-management/SKILL.md')

  it('requires crypto, securities, and commodities in unscoped discovery', () => {
    expect(agents).toContain('cover crypto, securities, and commodities')
    expect(agents).toContain('## Crypto')
    expect(agents).toContain('## Securities')
    expect(agents).toContain('## Commodities')

    expect(strategize).toContain('## Crypto')
    expect(strategize).toContain('## Securities')
    expect(strategize).toContain('## Commodities')
    expect(strategize).toContain('Commodity ideas')
  })

  it('provides a dedicated commodity research and thesis path', () => {
    expect(existsSync(join(REPO_ROOT, '.agents/desk-commodity-research.md'))).toBe(true)
    expect(commodityAnalyst).toContain('research-analyst')
    expect(commodityAnalyst).toContain('technical-analyst')
    expect(commodityAnalyst).toContain('list-assets --all-dexes')
    expect(thesis).toContain('desk-commodity-research')
  })

  it('uses all-dex quality data before treating a HIP-3 market as executable', () => {
    for (const document of [agents, strategize, commodityAnalyst, hyperliquid, tradeExecution]) {
      expect(document).toContain('list-assets --all-dexes')
      expect(document).toContain('referencePx')
      expect(document).toContain('openInterest')
      expect(document).toContain('impactPxs')
    }

    for (const document of [agents, hyperliquid, tradeExecution]) {
      expect(document).toContain('isDelisted')
      expect(document).toContain('requiresIsolatedMargin')
    }
  })

  it('leaves the judge categorical and removes desk confidence and sizing caps', () => {
    expect(judge).not.toMatch(/^CONFIDENCE:/m)
    expect(judge).toContain('RECOMMEND TRADE: yes | no | conditional')

    for (const document of [thesis, risk]) {
      expect(document).not.toMatch(/confidence\s*>=/i)
      expect(document).not.toMatch(/0\.60|0\.65/)
      expect(document).not.toMatch(/5%|15%/)
    }

    expect(positionManagement).not.toMatch(/≤\s*5x|≤\s*3x|~25%/)
    expect(positionManagement).toContain("asset's exchange-enforced `maxLeverage`")
  })
})
