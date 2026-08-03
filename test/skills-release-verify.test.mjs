// The consumer must never write bytes it has not verified.
//
// scripts/skills-upgrade.mjs now pulls the shared skill catalog from a
// PUBLIC-READ R2 bucket instead of a GitHub codeload tarball. Public-read means
// anyone who obtains the write token can serve whatever they like under a key
// this repo will happily fetch, so the digest chain is the only thing standing
// between that and seven SKILL.md files landing in the tree an agent reads as
// instructions. This exercises that chain against real bytes, including the
// tampered cases it exists to reject.
//
// A plain .mjs run directly by node/bun: the module under test is .mjs and sits
// outside the repo's tsc/eslint/prettier surface on purpose, and importing it
// from a .ts vitest file would drag it in as untyped JS. Wired into CI as
// `bun run test:skills-release`.
//
// Hermetic: no network, no bucket. Fixtures are built in a temp dir with the
// system tar, and the verifiers under test are pure functions over bytes.

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync, gzipSync } from 'node:zlib'

import { verifyExtractedFiles, verifyRelease } from '../scripts/skills-upgrade.mjs'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const COMMIT = 'a'.repeat(40)
const TREE = 'b'.repeat(40)

let failures = 0
function check(name, fn) {
  try {
    fn()
    console.log(`ok   ${name}`)
  } catch (error) {
    failures++
    console.error(`FAIL ${name}: ${error.message}`)
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

// Expect fn() to throw, and the message to name the reason. A test that only
// asserts "it threw" passes on a typo in the verifier as readily as on a
// rejection, so the reason is part of the assertion.
function throwsWith(fn, fragment) {
  let thrown = null
  try {
    fn()
  } catch (error) {
    thrown = error
  }
  assert(thrown !== null, `expected a throw mentioning "${fragment}", nothing was thrown`)
  assert(
    thrown.message.includes(fragment),
    `expected a throw mentioning "${fragment}", got: ${thrown.message}`
  )
}

const work = mkdtempSync(join(tmpdir(), 'skills-release-test-'))
process.on('exit', () => rmSync(work, { recursive: true, force: true }))

// --- fixture: a two-file catalog, packed the way a release is packed --------
const src = join(work, 'src')
mkdirSync(join(src, 'zipbox-x'), { recursive: true })
mkdirSync(join(src, 'zipbox-dns'), { recursive: true })
writeFileSync(join(src, 'zipbox-x', 'SKILL.md'), '# zipbox-x\n')
writeFileSync(join(src, 'zipbox-dns', 'SKILL.md'), '# zipbox-dns\n')

const tarPath = join(work, 'skills.tar')
const packed = spawnSync('tar', ['-cf', tarPath, '-C', src, 'zipbox-dns', 'zipbox-x'])
assert(packed.status === 0, `fixture tar failed: ${packed.stderr}`)

const tarBytes = readFileSync(tarPath)
const tarballBytes = gzipSync(tarBytes, { level: 9 })
const contentSha256 = sha256(tarBytes)
const manifest = {
  version: 1,
  contentSha256,
  tarball: {
    key: `skills/${contentSha256}.tar.gz`,
    sha256: sha256(tarballBytes),
    sizeBytes: tarballBytes.length
  },
  treeHash: TREE,
  commit: COMMIT,
  publishedAt: '1970-01-01T00:00:00.000Z',
  files: [
    { path: 'zipbox-dns/SKILL.md', sha256: sha256(readFileSync(join(src, 'zipbox-dns/SKILL.md'))) },
    { path: 'zipbox-x/SKILL.md', sha256: sha256(readFileSync(join(src, 'zipbox-x/SKILL.md'))) }
  ]
}

// Positive control. Without it, every rejection below is also satisfied by a
// verifier that rejects everything.
check('a well-formed release verifies', () => {
  verifyRelease({ contentSha256, manifest, tarballBytes, tarBytes })
  verifyExtractedFiles(src, manifest)
})

check('a tampered tarball is rejected', () => {
  const tampered = Buffer.concat([tarballBytes, Buffer.from([0])])
  throwsWith(
    () => verifyRelease({ contentSha256, manifest, tarballBytes: tampered, tarBytes }),
    'tarball digest mismatch'
  )
})

check('a tampered payload under an honest tarball digest is rejected', () => {
  // The attacker swapped the archive AND the digest that describes it — both are
  // self-consistent. Only the content address, which the caller asked for, still
  // disagrees. This is the case a two-way check would pass.
  const evilTar = Buffer.from(tarBytes)
  evilTar[512] = evilTar[512] ^ 0xff
  const evilTarball = gzipSync(evilTar, { level: 9 })
  const evilManifest = {
    ...manifest,
    tarball: { ...manifest.tarball, sha256: sha256(evilTarball) }
  }
  throwsWith(
    () =>
      verifyRelease({
        contentSha256,
        manifest: evilManifest,
        tarballBytes: evilTarball,
        tarBytes: evilTar
      }),
    'does not match its address'
  )
})

check('a manifest for a different release is rejected', () => {
  throwsWith(
    () =>
      verifyRelease({
        contentSha256: 'c'.repeat(64),
        manifest,
        tarballBytes,
        tarBytes
      }),
    'manifest is for a different release'
  )
})

check('a malformed content address is rejected before any fetch is trusted', () => {
  throwsWith(
    () => verifyRelease({ contentSha256: 'not-a-hash', manifest, tarballBytes, tarBytes }),
    'malformed content address'
  )
})

check('a manifest with no upstream commit is rejected', () => {
  throwsWith(
    () =>
      verifyRelease({
        contentSha256,
        manifest: { ...manifest, commit: 'main' },
        tarballBytes,
        tarBytes
      }),
    'no upstream commit sha'
  )
})

check('a file that changed after extraction is rejected', () => {
  const dir = join(work, 'extract-edited')
  mkdirSync(join(dir, 'zipbox-x'), { recursive: true })
  mkdirSync(join(dir, 'zipbox-dns'), { recursive: true })
  writeFileSync(join(dir, 'zipbox-x', 'SKILL.md'), '# zipbox-x TAMPERED\n')
  writeFileSync(join(dir, 'zipbox-dns', 'SKILL.md'), '# zipbox-dns\n')
  throwsWith(() => verifyExtractedFiles(dir, manifest), 'digest mismatch')
})

check('an archive carrying a file the manifest does not list is rejected', () => {
  const dir = join(work, 'extract-extra')
  mkdirSync(join(dir, 'zipbox-x'), { recursive: true })
  mkdirSync(join(dir, 'zipbox-dns'), { recursive: true })
  mkdirSync(join(dir, 'zipbox-evil'), { recursive: true })
  writeFileSync(join(dir, 'zipbox-x', 'SKILL.md'), '# zipbox-x\n')
  writeFileSync(join(dir, 'zipbox-dns', 'SKILL.md'), '# zipbox-dns\n')
  writeFileSync(join(dir, 'zipbox-evil', 'SKILL.md'), '# smuggled\n')
  throwsWith(() => verifyExtractedFiles(dir, manifest), 'differ from the manifest file list')
})

check('the round trip a real run makes is byte-exact', () => {
  assert(sha256(gunzipSync(tarballBytes)) === contentSha256, 'gunzip did not reproduce the content')
})

// --- nothing under skills/ moved -------------------------------------------
// The verifiers are pure, but "pure" is a claim about code, and this test is the
// place to measure it: every rejection above ran with the repo's own catalog on
// disk, so if any of them wrote through, this notices.
check('the repo catalog is untouched by a run of the verifiers', () => {
  const listing = spawnSync('git', ['status', '--porcelain', '--', 'skills'], {
    cwd: REPO_ROOT,
    encoding: 'utf8'
  })
  assert(listing.status === 0, `git status failed: ${listing.stderr}`)
  assert(
    listing.stdout.trim() === '',
    `the verifiers dirtied skills/:\n${listing.stdout}`
  )
})

if (failures > 0) {
  console.error(`\nskills release verification: ${failures} failure(s)`)
  process.exit(1)
}
console.log('\nskills release verification: PASS')
