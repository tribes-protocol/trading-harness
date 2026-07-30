import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Sanity-check the directory a screen's agent will run in.
 *
 * Pi discovers EVERYTHING from cwd — extensions at `<cwd>/.pi/extensions`, skills at
 * `<cwd>/.pi/skills`, the operating prompt at `<cwd>/AGENTS.md` — with no ancestor
 * walk and no error when they are absent. Point a screen at the wrong directory and
 * it starts perfectly happily as a bare Pi: no trading skills, no tribes extensions,
 * no harness prompt, and the default model instead of the pinned one. Nothing in the
 * logs says so, and from the browser it looks like the skills "did not load".
 *
 * That exact confusion is why this exists. It is a warning, not a refusal: running a
 * screen against a scratch directory is legitimate (it is how you test the gateway
 * without the tribes extensions minting tokens into .env), so the job here is to say
 * out loud which one you got.
 */
export function describeScreenWorkspace(cwd: string): string[] {
  const missing: string[] = []
  if (!existsSync(join(cwd, '.pi'))) {
    missing.push('.pi/ (extensions, skills, model pin)')
  }
  if (!existsSync(join(cwd, '.pi', 'skills'))) {
    missing.push('.pi/skills (the skill catalog)')
  }
  if (!existsSync(join(cwd, 'AGENTS.md'))) {
    missing.push('AGENTS.md (the operating prompt)')
  }
  return missing
}
