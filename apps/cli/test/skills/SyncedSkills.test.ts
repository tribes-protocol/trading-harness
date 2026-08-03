import { createHash } from 'crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'
import { describe, expect, it } from 'vitest'

import { REPO_ROOT } from '../helpers/RepoRoot.ts'

/**
 * Drift guard for the skills vendored from tribes-protocol/terminal.
 *
 * `bun run skills:upgrade` writes skills/.synced.json = { upstreamSha, files:
 * { path: sha256 } } after prettier has run. Vendored files are machine-written
 * and must never be hand-edited: this test recomputes each recorded file's sha256
 * and fails loudly on any mismatch (a hand-edit, a partial revert, or bit-rot).
 *
 * What is deliberately NOT pinned: the upstream sha and the file list. Freezing
 * either forbids the upgrade this manifest exists to record — an upstream skill
 * addition then fails CI instead of landing. Pinned instead is the SHAPE: a
 * well-formed sha, a non-empty file set, and exact agreement between the manifest
 * and the zipbox-* files actually on disk, so nothing vendored escapes the hash
 * check below.
 *
 * Hermetic: reads only the working tree, no network. Skips cleanly when the
 * manifest is absent, so the repo is green before the first upgrade ever runs.
 */

const SKILLS_DIR = join(REPO_ROOT, 'skills')
const MANIFEST_PATH = join(SKILLS_DIR, '.synced.json')
const SHARED_SLUG_PREFIX = 'zipbox-'
const COMMIT_SHA = /^[0-9a-f]{40}$/

// Build output .gitignore keeps out of the vendored set. A local dev tree can
// carry these; CI's fresh checkout cannot.
const IGNORED_DIRS = new Set(['node_modules', 'dist', 'dist-test'])

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIRS.has(entry)) continue
    const absolute = join(dir, entry)
    if (statSync(absolute).isDirectory()) walkFiles(absolute, out)
    else out.push(relative(REPO_ROOT, absolute))
  }
  return out
}

// Every file under every zipbox-* skill, as repo-relative paths.
function vendoredFilesOnDisk(): string[] {
  return readdirSync(SKILLS_DIR)
    .filter((entry) => entry.startsWith(SHARED_SLUG_PREFIX))
    .filter((slug) => statSync(join(SKILLS_DIR, slug)).isDirectory())
    .flatMap((slug) => walkFiles(join(SKILLS_DIR, slug)))
    .sort()
}

describe('synced skills drift guard', () => {
  if (!existsSync(MANIFEST_PATH)) {
    it.skip('no .synced.json yet — nothing has been vendored', () => {})
    return
  }

  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
  const recorded = manifest.files ?? {}

  it('records a well-formed upstream commit sha', () => {
    expect(typeof manifest.upstreamSha).toBe('string')
    expect(manifest.upstreamSha).toMatch(COMMIT_SHA)
  })

  it('records at least one vendored file', () => {
    expect(Object.keys(recorded).length).toBeGreaterThan(0)
  })

  it('covers exactly the zipbox-* files on disk — nothing vendored escapes the guard', () => {
    expect(Object.keys(recorded).sort()).toEqual(vendoredFilesOnDisk())
  })

  for (const [relativePath, expectedHash] of Object.entries(recorded)) {
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
