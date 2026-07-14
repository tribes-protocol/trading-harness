import { createHash } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

/**
 * Drift guard for the skills vendored from tribes-protocol/ai-harness-setup.
 *
 * The sync workflow writes skills/.synced.json = { upstreamSha, files: { path:
 * sha256 } } after prettier has run. Vendored files are machine-written and must
 * never be hand-edited: this test recomputes each recorded file's sha256 and fails
 * loudly on any mismatch (a hand-edit, a partial revert, or bit-rot).
 *
 * Hermetic: reads only the working tree, no network. Skips cleanly when the
 * manifest is absent, so the repo is green before the first sync ever runs.
 */

const REPO_ROOT = join(__dirname, '..', '..')
const MANIFEST_PATH = join(REPO_ROOT, 'skills', '.synced.json')

describe('synced skills drift guard', () => {
  if (!existsSync(MANIFEST_PATH)) {
    it.skip('no .synced.json yet — nothing has been vendored', () => {})
    return
  }

  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))

  it('records a non-empty upstream commit sha', () => {
    expect(typeof manifest.upstreamSha).toBe('string')
    expect(manifest.upstreamSha.length).toBeGreaterThan(0)
  })

  it('lists at least one vendored file', () => {
    expect(Object.keys(manifest.files ?? {}).length).toBeGreaterThan(0)
  })

  for (const [relativePath, expectedHash] of Object.entries(manifest.files ?? {})) {
    it(`${relativePath} matches its recorded sha256 (no hand-edits)`, () => {
      const absolute = join(REPO_ROOT, relativePath)
      expect(existsSync(absolute), `${relativePath} is in the manifest but missing on disk`).toBe(
        true
      )
      const actual = createHash('sha256').update(readFileSync(absolute)).digest('hex')
      expect(
        actual,
        `${relativePath} drifted from its manifest hash — edit upstream, not here`
      ).toBe(expectedHash)
    })
  }
})
