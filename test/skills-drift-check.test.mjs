// Proof that scripts/skills-drift-check.mjs can actually FAIL.
//
// A drift guard nobody has ever seen go red is indistinguishable from a guard that
// cannot go red — which is the failure it was written to fix, reproduced one layer
// up. So every verdict is exercised here against a real HTTP origin, including the
// two that exit non-zero, and the positive control below asserts the in-sync case
// still passes so "fails on everything" cannot masquerade as "fails on drift".
//
// Hermetic: a stub bucket on 127.0.0.1 serving the same three keys R2 serves, and
// fixture .synced.json files in a temp dir. No network, no credentials.
//
// A plain .mjs run directly by node/bun, matching test/skills-release-verify.test.mjs:
// the module under test is .mjs and sits outside the repo's tsc/eslint/prettier
// surface on purpose. Wired into CI as `bun run test:skills-drift`.

import { createServer } from 'node:http'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { checkDrift } from '../scripts/skills-drift-check.mjs'

const OLD = '1'.repeat(64)
const NEW = '2'.repeat(64)
const ABSENT = '3'.repeat(64)
const COMMIT_OLD = 'a'.repeat(40)
const COMMIT_NEW = 'b'.repeat(40)

let failures = 0
async function check(name, fn) {
  try {
    await fn()
    console.log(`ok   ${name}`)
  } catch (error) {
    failures++
    console.error(`FAIL ${name}: ${error.message}`)
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function expectVerdict(result, verdict, exitCode) {
  assert(
    result.verdict === verdict && result.exitCode === exitCode,
    `expected ${verdict}/${exitCode}, got ${result.verdict}/${result.exitCode} — ${result.message}`
  )
}

const work = mkdtempSync(join(tmpdir(), 'skills-drift-test-'))
process.on('exit', () => rmSync(work, { recursive: true, force: true }))

// A .synced.json fixture, written where the check will read it.
function pinnedAt(contentSha256, name) {
  const path = join(work, `${name}.json`)
  writeFileSync(
    path,
    `${JSON.stringify({ upstreamSha: COMMIT_OLD, contentSha256, files: {} }, null, 2)}\n`
  )
  return path
}

function manifestFor(contentSha256, commit, publishedAt, files) {
  return {
    version: 1,
    contentSha256,
    tarball: { key: `skills/${contentSha256}.tar.gz`, sha256: 'x'.repeat(64), sizeBytes: 1 },
    treeHash: 'c'.repeat(40),
    commit,
    publishedAt,
    files
  }
}

const OLD_MANIFEST = manifestFor(OLD, COMMIT_OLD, '2026-07-29T00:00:00.000Z', [
  { path: 'zipbox-browser/SKILL.md', sha256: '1'.repeat(64) },
  { path: 'zipbox-dns/SKILL.md', sha256: '2'.repeat(64) }
])
const NEW_MANIFEST = manifestFor(NEW, COMMIT_NEW, '2026-08-18T23:26:57.083Z', [
  { path: 'zipbox-browser/SKILL.md', sha256: '9'.repeat(64) },
  { path: 'zipbox-notify/SKILL.md', sha256: '4'.repeat(64) }
])

// --- stub bucket -----------------------------------------------------------
// `pointerTo` is mutable so one server serves both the in-sync and the drifted
// world; `failWith` turns the whole origin into a transient failure.
let pointerTo = NEW_MANIFEST
let failWith = null

const server = createServer((request, response) => {
  if (failWith !== null) {
    response.writeHead(failWith, { 'retry-after': '0' })
    response.end('busy')
    return
  }
  const bodies = {
    '/skills/latest.json': {
      version: 1,
      contentSha256: pointerTo.contentSha256,
      manifestKey: `skills/${pointerTo.contentSha256}.manifest.json`,
      treeHash: pointerTo.treeHash,
      commit: pointerTo.commit,
      publishedAt: pointerTo.publishedAt
    },
    [`/skills/${OLD}.manifest.json`]: OLD_MANIFEST,
    [`/skills/${NEW}.manifest.json`]: NEW_MANIFEST
  }
  const body = bodies[request.url ?? '']
  if (body === undefined) {
    response.writeHead(404)
    response.end('not found')
    return
  }
  response.writeHead(200, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
})

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const baseUrl = `http://127.0.0.1:${server.address().port}`

// --- the verdicts ----------------------------------------------------------

// Positive control. Without it, every red below is also produced by a check that
// is simply broken.
await check('IN SYNC when the pin is the published release', async () => {
  pointerTo = NEW_MANIFEST
  const result = await checkDrift({ baseUrl, manifestPath: pinnedAt(NEW, 'in-sync') })
  expectVerdict(result, 'IN SYNC', 0)
})

await check('DRIFTED (exit 1) when the pin is behind the published release', async () => {
  pointerTo = NEW_MANIFEST
  const result = await checkDrift({ baseUrl, manifestPath: pinnedAt(OLD, 'behind') })
  expectVerdict(result, 'DRIFTED', 1)
  // The failure has to name what moved, or the operator learns only that two
  // hashes differ. zipbox-notify was added upstream, zipbox-dns retired,
  // zipbox-browser edited.
  assert(
    result.message.includes('zipbox-notify') &&
      result.message.includes('zipbox-dns') &&
      result.message.includes('zipbox-browser'),
    `drift message does not name the changed slugs:\n${result.message}`
  )
  assert(result.message.includes('skills:upgrade'), 'drift message does not name the fix')
})

await check('AHEAD (exit 0) when the pin is NEWER than the pointer', async () => {
  // The pointer was rolled back, or somebody pinned a release published after
  // latest.json last moved. Behind is drift; ahead is not.
  pointerTo = OLD_MANIFEST
  const result = await checkDrift({ baseUrl, manifestPath: pinnedAt(NEW, 'ahead') })
  expectVerdict(result, 'AHEAD', 0)
})

await check('IN SYNC is unaffected by an equal pin under a rolled-back pointer', async () => {
  pointerTo = OLD_MANIFEST
  const result = await checkDrift({ baseUrl, manifestPath: pinnedAt(OLD, 'equal') })
  expectVerdict(result, 'IN SYNC', 0)
})

await check('UNPUBLISHED (exit 1) when the pinned release is not in the bucket', async () => {
  pointerTo = NEW_MANIFEST
  const result = await checkDrift({ baseUrl, manifestPath: pinnedAt(ABSENT, 'absent') })
  expectVerdict(result, 'UNPUBLISHED', 1)
})

await check('MALFORMED (exit 1) when .synced.json carries no content address', async () => {
  const path = join(work, 'no-address.json')
  writeFileSync(path, `${JSON.stringify({ upstreamSha: COMMIT_OLD, files: {} }, null, 2)}\n`)
  const result = await checkDrift({ baseUrl, manifestPath: path })
  expectVerdict(result, 'MALFORMED', 1)
})

await check('MALFORMED (exit 1) when .synced.json is absent', async () => {
  const result = await checkDrift({ baseUrl, manifestPath: join(work, 'nope.json') })
  expectVerdict(result, 'MALFORMED', 1)
})

// --- transient upstream is NOT drift ---------------------------------------

await check('UNVERIFIED (exit 0) when the origin answers 503', async () => {
  failWith = 503
  const result = await checkDrift({
    baseUrl,
    manifestPath: pinnedAt(OLD, 'busy'),
    maxAttempts: 2
  })
  failWith = null
  expectVerdict(result, 'UNVERIFIED', 0)
  assert(
    !result.message.includes('DRIFT'),
    `a busy origin was reported as drift:\n${result.message}`
  )
})

await check('UNVERIFIED (exit 0) when the origin answers 429', async () => {
  failWith = 429
  const result = await checkDrift({
    baseUrl,
    manifestPath: pinnedAt(OLD, 'ratelimited'),
    maxAttempts: 2
  })
  failWith = null
  expectVerdict(result, 'UNVERIFIED', 0)
})

await check('UNVERIFIED (exit 0) when the host does not resolve', async () => {
  const result = await checkDrift({
    baseUrl: 'http://skills-drift-check.invalid',
    manifestPath: pinnedAt(OLD, 'dns'),
    maxAttempts: 2
  })
  expectVerdict(result, 'UNVERIFIED', 0)
})

await check('UNVERIFIED (exit 0) when the connection is refused', async () => {
  // Port 1 on loopback: nothing listens, so this is a connect error rather than a
  // DNS one — a different failure path through the same classifier.
  const result = await checkDrift({
    baseUrl: 'http://127.0.0.1:1',
    manifestPath: pinnedAt(OLD, 'refused'),
    maxAttempts: 2
  })
  expectVerdict(result, 'UNVERIFIED', 0)
})

server.close()

if (failures > 0) {
  console.error(`\nskills drift check self-test: ${failures} failure(s)`)
  process.exit(1)
}
console.log('\nskills drift check self-test: PASS')
