// Vendor the shared agent skills published by tribes-protocol/terminal into skills/.
//
// Run it by hand when you want upstream's skills:
//
//   bun run skills:upgrade                    # the current published release
//   bun run skills:upgrade -- --pin <sha256>  # a specific release, by content address
//   bun run skills:upgrade -- --source ../terminal/harnesses/setup/skills  # preview only
//
// then review the diff, commit, and open a PR. CI runs the same verification the
// old scheduled workflow ran inline, so the PR gate is unchanged.
//
// WHERE THE SKILLS COME FROM. They used to be a public codeload tarball of
// tribes-protocol/ai-harness-setup. They now live in tribes-protocol/terminal,
// which is PRIVATE, so codeload is unreachable from here — there is no
// cross-repo token and there should not be one. terminal republishes the catalog
// on every merge to an R2 bucket that is public to READ only, content-addressed:
//
//   <base>/skills/latest.json                     -> { contentSha256, commit, ... }
//   <base>/skills/<contentSha256>.manifest.json   -> digests + provenance
//   <base>/skills/<contentSha256>.tar.gz          -> the catalog
//
// NOTHING DOWNLOADED IS TRUSTED. A public bucket is a public bucket: whoever can
// write it can serve any bytes it likes. So this script verifies, in order, the
// sha256 of the .tar.gz against the manifest, the sha256 of the archive's
// uncompressed content against the content address IN THE URL IT ASKED FOR, and
// the sha256 of every extracted file against the manifest — and it does all of
// that in a temp dir, before a single byte lands in skills/. Pin with --pin and
// the chain is anchored in an argument you typed, not in a mutable pointer.
//
// This is a build helper, NOT product source. It is a plain .mjs module so it sits
// outside the repo's tsc/eslint/prettier surface (those only cover .ts/.mts and a
// fixed prettier glob) — it runs directly under `bun` or `node`.
//
// What one run does, in order:
//
//   1. resolve the release (latest.json, or --pin), download it, and verify every
//      digest above before writing anything into the repo.
//   2. delete any slug the PREVIOUS manifest vendored that upstream no longer ships
//      (a retirement propagates; local-only trading skills are never touched), copy
//      skills/<slug>/* -> skills/<slug>/*, inject a "synced" marker after each
//      SKILL.md H1, and regenerate the marker-fenced routing block inside AGENTS.md's
//      "## Skill routing map".
//   3. run `bun run format`, so the manifest hashes the files as prettier leaves
//      them and `format:check` cannot fail on freshly vendored markdown.
//   4. hash every vendored file and write skills/.synced.json =
//      { upstreamSha, contentSha256, treeHash, source, files: { path: sha256 } }.
//      The manifest is only rewritten when the file set actually changed, so a bare
//      sha bump with identical skill content produces no diff. `upstreamSha` stays
//      the 40-hex upstream COMMIT — apps/cli/test/skills/SyncedSkills.test.ts pins
//      that shape, and scripts/install-shared-skills.sh scrapes the `files` keys
//      line by line, so neither may change form.
//
// The routing block backticks the SLUG ONLY and strips every backtick from the
// description: tests/skills/SkillsContract.test.ts fails on any backticked token in
// the routing section that is not a known skill slug.

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

// The R2 bucket terminal publishes to, reachable over its public custom domain.
// Overridable so a release can be staged and exercised before it is the default.
const DEFAULT_BASE_URL = 'https://skills.zipbox.ai'
const HEX_64 = /^[0-9a-f]{64}$/
const COMMIT_SHA = /^[0-9a-f]{40}$/
// Shared skills carry this prefix; see upstreamSlugs() for why it is load-bearing.
const SHARED_SLUG_PREFIX = 'zipbox-'
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const H1_MARKER = '<!-- synced from tribes-protocol/terminal — edit there, not here -->'
const ROUTES_BEGIN = '<!-- BEGIN synced skill routes (managed by scripts/skills-upgrade.mjs) -->'
const ROUTES_END = '<!-- END synced skill routes -->'
const ROUTING_HEADING = '## Skill routing map'

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (token.startsWith('--')) {
      const key = token.slice(2)
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) {
        args[key] = 'true'
      } else {
        args[key] = next
        i++
      }
    }
  }
  return args
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

// Directories under sourceDir that hold a SKILL.md — the set of slugs to vendor.
//
// The `zipbox-` prefix filter is a SAFETY BOUNDARY, not tidiness. Vendoring copies
// with cpSync(force:true) and the manifest then pins whatever it copied as canonical,
// so an upstream directory named after one of THIS repo's trading skills — `browser`,
// `web-search`, `news` — would silently overwrite it, and the drift guard would
// afterwards defend the overwrite as the intended state. Without this line the only
// thing protecting the trading catalog is the convention that upstream never creates a
// directory without the prefix.
//
// Reproduced before the filter existed: an upstream `news/` directory replaced this
// repo's own skills/news/SKILL.md on the next run. (Credit: tribes-protocol/trading-harness#93.)
function upstreamSlugs(sourceDir) {
  return readdirSync(sourceDir)
    .filter((entry) => entry.startsWith(SHARED_SLUG_PREFIX))
    .filter((entry) => statSync(join(sourceDir, entry)).isDirectory())
    .filter((entry) => existsSync(join(sourceDir, entry, 'SKILL.md')))
    .sort()
}

// Every file path (relative to root) under a directory tree.
function walkRelative(root, dir = root, out = []) {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry)
    if (statSync(abs).isDirectory()) walkRelative(root, abs, out)
    else out.push(relative(root, abs))
  }
  return out
}

// Same frontmatter accumulation the contract test uses, so `name`/`description`
// resolve identically here.
function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  const frontmatter = new Map()
  if (!match) return frontmatter
  let currentKey = ''
  for (const line of match[1].split('\n')) {
    const keyMatch = line.match(/^([a-z-]+):\s*(.*)$/)
    if (keyMatch && keyMatch[1]) {
      currentKey = keyMatch[1]
      frontmatter.set(currentKey, keyMatch[2] ?? '')
    } else if (currentKey) {
      frontmatter.set(currentKey, `${frontmatter.get(currentKey) ?? ''} ${line.trim()}`.trim())
    }
  }
  return frontmatter
}

// One-line routing description: drop the YAML fold indicator, strip EVERY backtick
// (a backticked non-slug token fails the routing-map test), collapse whitespace, and
// keep the first sentence so the bullet stays short.
function routeDescription(slug, raw) {
  let description = parseFrontmatter(raw).get('description') ?? ''
  description = description.replace(/^[>|][-+]?\s*/, '')
  description = description.replace(/`/g, '')
  description = description.replace(/\s+/g, ' ').trim()
  const sentenceEnd = description.search(/\.(\s|$)/)
  if (sentenceEnd !== -1) description = description.slice(0, sentenceEnd + 1)
  return description.length > 0 ? description : `Shared ${slug} skill.`
}

function injectH1Marker(skillPath) {
  const lines = readFileSync(skillPath, 'utf8').split('\n')
  const h1Index = lines.findIndex((line) => /^# .+/.test(line))
  if (h1Index === -1) return // no H1: the contract test surfaces this as an upstream error
  if (lines[h1Index + 1] === H1_MARKER) return // already injected (idempotent)
  lines.splice(h1Index + 1, 0, H1_MARKER)
  writeFileSync(skillPath, lines.join('\n'))
}

function renderRoutingBlock(slugs, descriptions) {
  const bullets = slugs.map((slug) => `- \`${slug}\` — ${descriptions.get(slug)}`).join('\n')
  return `${ROUTES_BEGIN}\n\n${bullets}\n\n${ROUTES_END}`
}

function updateRoutingMap(agentsPath, slugs, descriptions) {
  let markdown = readFileSync(agentsPath, 'utf8')
  const block = renderRoutingBlock(slugs, descriptions)

  if (markdown.includes(ROUTES_BEGIN) && markdown.includes(ROUTES_END)) {
    const before = markdown.slice(0, markdown.indexOf(ROUTES_BEGIN))
    const after = markdown.slice(markdown.indexOf(ROUTES_END) + ROUTES_END.length)
    markdown = `${before}${block}${after}`
  } else {
    const headingIndex = markdown.indexOf(ROUTING_HEADING)
    if (headingIndex === -1) throw new Error(`AGENTS.md has no "${ROUTING_HEADING}" section`)
    const nextHeading = markdown.indexOf('\n## ', headingIndex + ROUTING_HEADING.length)
    const insertAt = nextHeading === -1 ? markdown.length : nextHeading
    const prefix = markdown.slice(0, insertAt).replace(/\s*$/, '')
    const suffix = markdown.slice(insertAt)
    markdown = `${prefix}\n\n${block}\n${suffix}`
  }
  writeFileSync(agentsPath, markdown)
}

// Slugs the PREVIOUS run vendored, read back from the manifest. This is what makes
// a retirement safe to act on: the manifest distinguishes "we vendored this from
// upstream" from "this is a trading-only skill" and from "this is a stray
// directory", so removing what it lists can never delete local work.
function previouslyVendoredSlugs(repoRoot) {
  const manifestPath = join(repoRoot, 'skills', '.synced.json')
  if (!existsSync(manifestPath)) return []
  const files = JSON.parse(readFileSync(manifestPath, 'utf8')).files ?? {}
  const slugs = new Set()
  for (const key of Object.keys(files)) {
    const match = key.match(/^skills\/([^/]+)\//)
    if (match) slugs.add(match[1])
  }
  return [...slugs]
}

// Retire slugs that we vendored before and upstream no longer ships. Without this
// a deleted skill lingers forever: the copy loop only ever writes, so the stale
// directory stays on disk while dropping out of the manifest — which then trips the
// drift guard instead of just doing the right thing.
function removeRetiredSlugs(skillsRoot, repoRoot, currentSlugs) {
  const current = new Set(currentSlugs)
  const retired = previouslyVendoredSlugs(repoRoot).filter((slug) => !current.has(slug))
  for (const slug of retired) {
    rmSync(join(skillsRoot, slug), { recursive: true, force: true })
  }
  if (retired.length > 0) {
    console.log(`skills:upgrade: retired ${retired.length} skill(s): ${retired.join(', ')}`)
  }
}

function runContentPhase(sourceDir, repoRoot) {
  const skillsRoot = join(repoRoot, 'skills')
  const slugs = upstreamSlugs(sourceDir)
  if (slugs.length === 0) {
    // Refuse rather than interpret this as "upstream retired everything" — an empty
    // upstream is far more likely to be a broken fetch than a real deletion.
    console.log('skills:upgrade: upstream exposes no skills — nothing to vendor')
    return
  }

  removeRetiredSlugs(skillsRoot, repoRoot, slugs)

  const descriptions = new Map()
  for (const slug of slugs) {
    const from = join(sourceDir, slug)
    const to = join(skillsRoot, slug)
    mkdirSync(to, { recursive: true })
    // cpSync overwrites vendored files but leaves any local-only files in place,
    // and copying only upstream slugs never touches local-only slugs.
    cpSync(from, to, { recursive: true, force: true })
    injectH1Marker(join(to, 'SKILL.md'))
    descriptions.set(slug, routeDescription(slug, readFileSync(join(from, 'SKILL.md'), 'utf8')))
  }

  updateRoutingMap(join(repoRoot, 'AGENTS.md'), slugs, descriptions)
  console.log(`skills:upgrade: vendored ${slugs.length} skill(s): ${slugs.join(', ')}`)
}

function computeFileHashes(sourceDir, repoRoot) {
  const skillsRoot = join(repoRoot, 'skills')
  const files = {}
  for (const slug of upstreamSlugs(sourceDir)) {
    for (const relInSlug of walkRelative(join(sourceDir, slug))) {
      const abs = join(skillsRoot, slug, relInSlug)
      files[relative(repoRoot, abs)] = sha256(readFileSync(abs))
    }
  }
  const sorted = {}
  for (const key of Object.keys(files).sort()) sorted[key] = files[key]
  return sorted
}

function sameFileSet(a, b) {
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  return aKeys.every((key) => a[key] === b[key])
}

function runManifestPhase(sourceDir, repoRoot, release) {
  if (upstreamSlugs(sourceDir).length === 0) return
  const manifestPath = join(repoRoot, 'skills', '.synced.json')
  const files = computeFileHashes(sourceDir, repoRoot)

  if (existsSync(manifestPath)) {
    const existing = JSON.parse(readFileSync(manifestPath, 'utf8'))
    // Identical content under a new upstream sha is not a change worth a PR.
    if (sameFileSet(existing.files ?? {}, files)) {
      console.log('skills:upgrade: vendored content unchanged — leaving manifest untouched')
      return
    }
  }

  // `upstreamSha` stays first and stays a 40-hex commit: it is the field the
  // drift guard shape-checks and the field a human reads to find the source
  // commit. `contentSha256` is what an operator passes back as --pin to get
  // exactly these bytes again.
  const manifest = {
    upstreamSha: release.commit,
    contentSha256: release.contentSha256,
    treeHash: release.treeHash,
    source: release.source,
    files
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`skills:upgrade: wrote manifest for ${Object.keys(files).length} file(s)`)
}

// Run a command, failing loudly. Nothing here is best-effort: a half-applied
// upgrade is worse than none, and the caller still has a clean working tree.
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options })
  if (result.error) throw new Error(`${command} could not be run: ${result.error.message}`)
  if (result.status !== 0) {
    const detail = (result.stderr ?? '').trim()
    throw new Error(`${command} ${args.join(' ')} exited ${result.status}${detail ? `\n${detail}` : ''}`)
  }
  return result.stdout ?? ''
}

// Fetch one object, as bytes. Nothing here interprets a body before its digest
// has been checked, so every fetch returns a Buffer and the callers decide.
export async function fetchBytes(url, fetchImpl = fetch) {
  const response = await fetchImpl(url)
  if (!response.ok) throw new Error(`GET ${url} -> ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

// THE VERIFICATION. Called with the bytes actually received and the address they
// were requested under; throws before any caller can act on them.
//
// Order matters. The tarball digest is checked against the manifest, and the
// manifest is only trusted because its own key is the content address the caller
// asked for and the archive inside hashes back to that same address. A manifest
// that names a digest, a tarball that matches that digest, and a content address
// that matches neither is the exact shape of a swapped object — so all three are
// compared, not two.
export function verifyRelease({ contentSha256, manifest, tarballBytes, tarBytes }) {
  if (!HEX_64.test(contentSha256)) {
    throw new Error(`malformed content address: ${contentSha256}`)
  }
  if (manifest.contentSha256 !== contentSha256) {
    throw new Error(
      `manifest is for a different release: asked for ${contentSha256}, manifest names ${manifest.contentSha256}`
    )
  }
  if (!COMMIT_SHA.test(manifest.commit ?? '')) {
    throw new Error(`manifest carries no upstream commit sha: ${manifest.commit}`)
  }
  const tarballDigest = sha256(tarballBytes)
  if (tarballDigest !== manifest.tarball?.sha256) {
    throw new Error(
      `tarball digest mismatch: downloaded ${tarballDigest}, manifest says ${manifest.tarball?.sha256}`
    )
  }
  const contentDigest = sha256(tarBytes)
  if (contentDigest !== contentSha256) {
    throw new Error(
      `archive content does not match its address: unpacked to ${contentDigest}, requested ${contentSha256}`
    )
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error('manifest lists no files')
  }
}

// Per-file check after extraction. The archive digest already covers these bytes;
// this catches an extraction that dropped, renamed, or added a file, and it is
// what makes a partially-unpacked tree fail instead of quietly vendoring.
export function verifyExtractedFiles(dir, manifest) {
  for (const entry of manifest.files) {
    const abs = join(dir, entry.path)
    if (!existsSync(abs)) throw new Error(`manifest lists ${entry.path}, not present after extract`)
    const actual = sha256(readFileSync(abs))
    if (actual !== entry.sha256) {
      throw new Error(`${entry.path} digest mismatch: got ${actual}, manifest says ${entry.sha256}`)
    }
  }
  const onDisk = walkRelative(dir).sort()
  const listed = manifest.files.map((entry) => entry.path).sort()
  if (onDisk.length !== listed.length || onDisk.some((path, i) => path !== listed[i])) {
    throw new Error(
      `archive contents differ from the manifest file list:\n  on disk: ${onDisk.join(', ')}\n  manifest: ${listed.join(', ')}`
    )
  }
}

// Resolve, download, verify, unpack. Returns the verified skills dir plus the
// provenance to record. Nothing is written outside workDir.
async function fetchRelease(baseUrl, pin, workDir) {
  let contentSha256 = pin
  if (!contentSha256) {
    const latest = JSON.parse((await fetchBytes(`${baseUrl}/skills/latest.json`)).toString('utf8'))
    contentSha256 = latest.contentSha256
    console.log(`skills:upgrade: latest -> ${contentSha256}`)
  } else {
    console.log(`skills:upgrade: pinned -> ${contentSha256}`)
  }
  if (!HEX_64.test(contentSha256 ?? '')) {
    throw new Error(`malformed content address: ${contentSha256}`)
  }

  const manifestUrl = `${baseUrl}/skills/${contentSha256}.manifest.json`
  const tarballUrl = `${baseUrl}/skills/${contentSha256}.tar.gz`
  const manifest = JSON.parse((await fetchBytes(manifestUrl)).toString('utf8'))
  const tarballBytes = await fetchBytes(tarballUrl)
  const tarBytes = gunzipSync(tarballBytes)

  verifyRelease({ contentSha256, manifest, tarballBytes, tarBytes })
  console.log(
    `skills:upgrade: verified ${tarballBytes.length} bytes against ${contentSha256.slice(0, 12)}`
  )

  const tarPath = join(workDir, 'skills.tar')
  const extracted = join(workDir, 'extract')
  mkdirSync(extracted, { recursive: true })
  writeFileSync(tarPath, tarBytes)
  run('tar', ['-xf', tarPath, '-C', extracted])
  verifyExtractedFiles(extracted, manifest)

  return {
    sourceDir: extracted,
    release: {
      contentSha256,
      commit: manifest.commit,
      treeHash: manifest.treeHash,
      source: tarballUrl
    }
  }
}

// --source vendors from a local terminal checkout's harnesses/setup/skills instead
// of a published release, so an upstream change can be exercised here BEFORE it
// merges. It is a preview and nothing more: there is no release to attribute the
// bytes to, so the manifest is deliberately NOT written. Re-run without --source
// once the upstream PR lands and the publisher has run.
async function main() {
  const args = parseArgs(process.argv.slice(2))
  const baseUrl = (args['base-url'] ?? process.env.ZIPBOX_SKILLS_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
  const localSource = args.source
  const pin = args.pin

  const workDir = mkdtempSync(join(tmpdir(), 'skills-upgrade-'))
  try {
    if (localSource) {
      if (!existsSync(localSource)) throw new Error(`--source not found: ${localSource}`)
      console.log(`skills:upgrade: PREVIEW from ${localSource} — do not commit this run`)
      runContentPhase(localSource, REPO_ROOT)
      run('bun', ['run', 'format'], { cwd: REPO_ROOT, stdio: 'inherit' })
      console.log('skills:upgrade: preview — skills/.synced.json deliberately NOT written')
    } else {
      const { sourceDir, release } = await fetchRelease(baseUrl, pin, workDir)
      runContentPhase(sourceDir, REPO_ROOT)
      run('bun', ['run', 'format'], { cwd: REPO_ROOT, stdio: 'inherit' })
      runManifestPhase(sourceDir, REPO_ROOT, release)
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }

  console.log('skills:upgrade: done — review the diff, then commit and open a PR')
}

// Only run when invoked as a script. apps/cli/test/skills/SkillsRelease.test.ts
// imports the verifiers from this file; an unguarded main() would fetch the
// network and rewrite skills/ during test collection.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`skills:upgrade: ${error.message}`)
    process.exit(1)
  })
}
