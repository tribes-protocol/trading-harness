// Fail CI when the vendored skill catalog has fallen behind the published one.
//
// WHAT THIS CATCHES THAT NOTHING ELSE DID
//
// tests/skills/SyncedSkills.test.ts already proves the files on disk are the files
// skills/.synced.json says they are, and test/skills-release-verify.test.mjs proves
// the download path cannot be fed bytes it has not verified. Both are hermetic, and
// that is the gap: neither has ever asked upstream what the current release IS. A
// pin that stops moving is, to both of them, a perfectly healthy repository.
//
// It stopped moving for three weeks. skills-upgrade.mjs fetched
// tribes-protocol/ai-harness-setup, that catalog moved into tribes-protocol/terminal,
// and the abandoned repo kept serving its last snapshot with a 200. Seven skills here,
// twelve upstream, every check green. It surfaced only because somebody deleting a
// duplicate skill went looking for its replacement and could not find one. This
// script is the thing that should have said so.
//
// THE COMPARISON
//
// One string. The release channel is content-addressed — contentSha256 is the sha256
// of the uncompressed catalog tar — so equal addresses mean identical catalogs and
// different addresses mean genuinely different catalogs. There is no tree to diff and
// no false positive from a version bump that changed nothing, which is what makes a
// hard failure safe here.
//
// EXIT CODES, AND WHY UNREACHABLE IS NOT A FAILURE
//
//   0  IN SYNC     — the pin is the published release.
//   0  AHEAD       — the pin is NEWER than the pointer (a --pin taken from a release
//                    published after latest.json was last moved, or a rolled-back
//                    pointer). Not drift; warned about, not failed.
//   0  UNVERIFIED  — upstream could not be consulted: DNS, connection reset, timeout,
//                    429, 5xx. A build must never read "the bucket was busy" as "the
//                    catalog changed", so this warns loudly and exits clean.
//   1  DRIFTED     — the pin is behind a newer published release. The fix is
//                    `bun run skills:upgrade`, review, commit.
//   1  UNPUBLISHED — the pinned release is not in the bucket (404). Deterministic,
//                    not transient: this repo is carrying a catalog whose provenance
//                    cannot be checked by anyone.
//   1  MALFORMED   — skills/.synced.json is missing or carries no content address.
//
// Retries use exponential backoff with a cap and jitter, and honour Retry-After.
// Bounded rather than endless because the terminal state on exhaustion is
// UNVERIFIED, not failure — a CI step must not hang on a busy edge, and it must not
// convert one into a red build either.

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_BASE_URL = 'https://skills.zipbox.ai'
const HEX_64 = /^[0-9a-f]{64}$/
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MANIFEST_PATH = join(REPO_ROOT, 'skills', '.synced.json')

const MAX_ATTEMPTS = 5
const BASE_DELAY_MS = 400
const MAX_DELAY_MS = 8000

// Deliberately NOT scripts/skills-upgrade.mjs's fetchBytes. That one throws on any
// non-2xx because a vendoring run must abort; this one has to tell a 404 (a fact
// about the bucket) apart from a 503 (a fact about the afternoon), and the two lead
// to opposite exit codes.
class Unreachable extends Error {}
class NotFound extends Error {}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function backoffMs(attempt, retryAfter) {
  const seconds = Number(retryAfter)
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, MAX_DELAY_MS)
  const window = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS)
  // Half fixed, half jitter: a fleet of runners retrying in lockstep is how one
  // slow response becomes a thundering herd.
  return window / 2 + Math.random() * (window / 2)
}

async function getJson(url, fetchImpl = fetch, maxAttempts = MAX_ATTEMPTS) {
  let detail = 'no response'
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let response
    try {
      response = await fetchImpl(url)
    } catch (error) {
      detail = error.message
      await sleep(backoffMs(attempt))
      continue
    }
    if (response.status === 404) throw new NotFound(`GET ${url} -> 404`)
    if (response.ok) {
      const text = await response.text()
      try {
        return JSON.parse(text)
      } catch (error) {
        // Served, but not JSON. The bucket answered, so this is not a network
        // problem and must not be laundered into UNVERIFIED.
        throw new Error(`GET ${url} returned invalid JSON: ${error.message}`)
      }
    }
    detail = `HTTP ${response.status}`
    await sleep(backoffMs(attempt, response.headers.get('retry-after')))
  }
  throw new Unreachable(`GET ${url} failed ${maxAttempts} times: ${detail}`)
}

function annotate(level, message) {
  // GitHub Actions surfaces these in the run summary and on the job. Outside CI
  // they are just a prefixed line, which is why the human-readable report below
  // is printed regardless.
  if (process.env.GITHUB_ACTIONS === 'true') {
    console.log(`::${level}::${message.replace(/\n/g, '%0A')}`)
  }
}

function readPin(manifestPath) {
  if (!existsSync(manifestPath)) {
    return { error: 'skills/.synced.json does not exist — nothing has been vendored' }
  }
  let parsed
  try {
    parsed = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (error) {
    return { error: `skills/.synced.json is not valid JSON: ${error.message}` }
  }
  if (!HEX_64.test(parsed.contentSha256 ?? '')) {
    return {
      error:
        `skills/.synced.json carries no content address ` +
        `(contentSha256 = ${JSON.stringify(parsed.contentSha256)}). ` +
        `Re-run \`bun run skills:upgrade\` — a manifest without one cannot be compared to upstream.`
    }
  }
  return { contentSha256: parsed.contentSha256, upstreamSha: parsed.upstreamSha }
}

// Which slugs differ between two releases, from the manifests' own file lists.
// Reported so the failure names what changed instead of two opaque hashes.
function slugDelta(localFiles, latestFiles) {
  const slugOf = (path) => path.split('/')[0]
  const local = new Map((localFiles ?? []).map((f) => [f.path, f.sha256]))
  const latest = new Map((latestFiles ?? []).map((f) => [f.path, f.sha256]))
  const added = new Set()
  const removed = new Set()
  const changed = new Set()
  for (const [path, digest] of latest) {
    if (!local.has(path)) added.add(slugOf(path))
    else if (local.get(path) !== digest) changed.add(slugOf(path))
  }
  for (const path of local.keys()) {
    if (!latest.has(path)) removed.add(slugOf(path))
  }
  return {
    added: [...added].sort(),
    removed: [...removed].sort(),
    changed: [...changed].sort()
  }
}

function describeDelta(delta) {
  const parts = []
  if (delta.added.length > 0) parts.push(`  added upstream:   ${delta.added.join(', ')}`)
  if (delta.removed.length > 0) parts.push(`  retired upstream: ${delta.removed.join(', ')}`)
  if (delta.changed.length > 0) parts.push(`  changed upstream: ${delta.changed.join(', ')}`)
  return parts.length > 0 ? parts.join('\n') : '  (same file set, different bytes)'
}

// manifestPath is injectable so the self-test can drive every verdict from fixture
// manifests without writing to the repo's own skills/.synced.json.
export async function checkDrift({
  baseUrl,
  fetchImpl = fetch,
  manifestPath,
  maxAttempts = MAX_ATTEMPTS
} = {}) {
  const base = (baseUrl ?? process.env.ZIPBOX_SKILLS_BASE_URL ?? DEFAULT_BASE_URL).replace(
    /\/+$/,
    ''
  )
  const pin = readPin(manifestPath ?? MANIFEST_PATH)
  if (pin.error) return { verdict: 'MALFORMED', exitCode: 1, message: pin.error }

  let latest
  try {
    latest = await getJson(`${base}/skills/latest.json`, fetchImpl, maxAttempts)
  } catch (error) {
    if (error instanceof Unreachable) {
      return {
        verdict: 'UNVERIFIED',
        exitCode: 0,
        message:
          `could not reach the published catalog at ${base} (${error.message}).\n` +
          `Treating this as UNVERIFIED, not as drift — a transient upstream must never turn a build red.\n` +
          `The vendored pin is ${pin.contentSha256.slice(0, 12)}; nothing was compared.`
      }
    }
    if (error instanceof NotFound) {
      return {
        verdict: 'MALFORMED',
        exitCode: 1,
        message: `${base}/skills/latest.json does not exist — the release channel is misconfigured, not merely busy.`
      }
    }
    throw error
  }

  if (!HEX_64.test(latest.contentSha256 ?? '')) {
    return {
      verdict: 'MALFORMED',
      exitCode: 1,
      message: `latest.json carries no content address: ${JSON.stringify(latest.contentSha256)}`
    }
  }

  if (latest.contentSha256 === pin.contentSha256) {
    return {
      verdict: 'IN SYNC',
      exitCode: 0,
      message: `vendored catalog is the published release ${pin.contentSha256.slice(0, 12)} (upstream commit ${(latest.commit ?? '').slice(0, 12)}).`
    }
  }

  // The addresses differ. Before calling that drift, establish the DIRECTION: a pin
  // taken from a release published after the pointer last moved is ahead, not behind,
  // and must not fail. Both manifests are immutable, so publishedAt is authoritative.
  let localManifest
  try {
    localManifest = await getJson(
      `${base}/skills/${pin.contentSha256}.manifest.json`,
      fetchImpl,
      maxAttempts
    )
  } catch (error) {
    if (error instanceof Unreachable) {
      return {
        verdict: 'UNVERIFIED',
        exitCode: 0,
        message:
          `the pointer names ${latest.contentSha256.slice(0, 12)} and this repo pins ${pin.contentSha256.slice(0, 12)}, ` +
          `but the pinned release's manifest could not be fetched (${error.message}).\n` +
          `Direction is undetermined, so this is UNVERIFIED rather than drift.`
      }
    }
    if (error instanceof NotFound) {
      return {
        verdict: 'UNPUBLISHED',
        exitCode: 1,
        message:
          `this repo pins release ${pin.contentSha256} but no such release is published at ${base}.\n` +
          `That is not a transient failure: the vendored catalog has no provenance anyone can verify.\n` +
          `Fix: \`bun run skills:upgrade\`, review the diff, commit.`
      }
    }
    throw error
  }

  const localAt = Date.parse(localManifest.publishedAt ?? '')
  const latestAt = Date.parse(latest.publishedAt ?? '')
  if (Number.isFinite(localAt) && Number.isFinite(latestAt) && localAt > latestAt) {
    return {
      verdict: 'AHEAD',
      exitCode: 0,
      message:
        `the vendored pin ${pin.contentSha256.slice(0, 12)} (published ${localManifest.publishedAt}) is NEWER than ` +
        `the pointer ${latest.contentSha256.slice(0, 12)} (published ${latest.publishedAt}).\n` +
        `Not drift. Either a deliberate --pin ahead of latest.json, or the pointer was rolled back.`
    }
  }

  let latestManifest = null
  try {
    latestManifest = await getJson(
      `${base}/skills/${latest.contentSha256}.manifest.json`,
      fetchImpl,
      maxAttempts
    )
  } catch {
    // The delta is a courtesy in the failure message; the verdict is already
    // settled by the addresses and their publish times.
  }

  return {
    verdict: 'DRIFTED',
    exitCode: 1,
    message:
      `the vendored skill catalog is behind the published one.\n` +
      `  vendored: ${pin.contentSha256} (published ${localManifest.publishedAt ?? 'unknown'}, terminal ${(localManifest.commit ?? '').slice(0, 12)})\n` +
      `  upstream: ${latest.contentSha256} (published ${latest.publishedAt ?? 'unknown'}, terminal ${(latest.commit ?? '').slice(0, 12)})\n` +
      describeDelta(slugDelta(localManifest.files, latestManifest?.files)) +
      `\nFix: \`bun run skills:upgrade\`, review the diff, commit.`
  }
}

// Entry point only when run directly, so the self-test can import checkDrift.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await checkDrift()
  const line = `skills drift: ${result.verdict} — ${result.message}`
  console.log(line)
  if (result.exitCode !== 0) annotate('error', line)
  else if (result.verdict !== 'IN SYNC') annotate('warning', line)
  process.exit(result.exitCode)
}
