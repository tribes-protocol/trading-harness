// Vendor shared agent skills from tribes-protocol/ai-harness-setup into skills/.
//
// Run it by hand when you want upstream's skills:
//
//   bun run skills:upgrade                 # upstream main's current tip
//   bun run skills:upgrade -- --ref v1.2.0 # a tag, branch, or full sha
//   bun run skills:upgrade -- --source ../ai-harness-setup/skills   # preview only
//
// then review the diff, commit, and open a PR. CI runs the same verification the
// old scheduled workflow ran inline, so the PR gate is unchanged.
//
// This is a build helper, NOT product source. It is a plain .mjs module so it sits
// outside the repo's tsc/eslint/prettier surface (those only cover .ts/.mts and a
// fixed prettier glob) — it runs directly under `bun` or `node`.
//
// What one run does, in order:
//
//   1. resolve --ref to a commit sha (`gh api`) and fetch that exact tree as a
//      public codeload tarball — no auth, no cross-repo token.
//   2. delete any slug the PREVIOUS manifest vendored that upstream no longer ships
//      (a retirement propagates; local-only trading skills are never touched), copy
//      skills/<slug>/* -> skills/<slug>/*, inject a "synced" marker after each
//      SKILL.md H1, and regenerate the marker-fenced routing block inside AGENTS.md's
//      "## Skill routing map".
//   3. run `bun run format`, so the manifest hashes the files as prettier leaves
//      them and `format:check` cannot fail on freshly vendored markdown.
//   4. hash every vendored file and write skills/.synced.json =
//      { upstreamSha, files: { path: sha256 } }. The manifest is only rewritten
//      when the file set actually changed, so a bare sha bump with identical skill
//      content produces no diff.
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
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const UPSTREAM_REPO = 'tribes-protocol/ai-harness-setup'
const DEFAULT_REF = 'main'
// Shared skills carry this prefix; see upstreamSlugs() for why it is load-bearing.
const SHARED_SLUG_PREFIX = 'zipbox-'
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const H1_MARKER = '<!-- synced from tribes-protocol/ai-harness-setup — edit there, not here -->'
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

function runManifestPhase(sourceDir, repoRoot, upstreamSha) {
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

  const manifest = { upstreamSha, files }
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

// A ref (branch, tag, or sha) -> the exact commit sha recorded in the manifest.
// Resolving up front means the tarball below and the recorded provenance are the
// same commit even if upstream moves mid-run.
function resolveSha(ref) {
  const sha = run('gh', ['api', `repos/${UPSTREAM_REPO}/commits/${ref}`, '--jq', '.sha']).trim()
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`could not resolve ${UPSTREAM_REPO}@${ref}`)
  return sha
}

// Public repo: codeload serves any ref anonymously, so this needs no token.
function fetchUpstreamSkills(sha, workDir) {
  const tarball = join(workDir, 'src.tar.gz')
  const extracted = join(workDir, 'extract')
  mkdirSync(extracted, { recursive: true })
  run('curl', ['-fsSL', `https://codeload.github.com/${UPSTREAM_REPO}/tar.gz/${sha}`, '-o', tarball])
  run('tar', ['-xzf', tarball, '-C', extracted, '--strip-components=1'])

  const skills = join(extracted, 'skills')
  if (!existsSync(skills)) throw new Error(`upstream ${sha} has no skills/ directory`)
  return skills
}

// --source vendors from a local ai-harness-setup checkout instead of a fetched ref,
// so an upstream change can be exercised here BEFORE it merges. The result is a
// preview, not a shippable state: `upstreamSha` still names the resolved --ref, so a
// source tree carrying unmerged edits produces a manifest whose sha does not describe
// its own content. Re-run without --source once the upstream PR lands.
function main() {
  const args = parseArgs(process.argv.slice(2))
  const ref = args.ref ?? DEFAULT_REF
  const localSource = args.source

  const upstreamSha = resolveSha(ref)
  console.log(`skills:upgrade: ${UPSTREAM_REPO}@${ref} -> ${upstreamSha}`)

  const workDir = mkdtempSync(join(tmpdir(), 'skills-upgrade-'))
  try {
    let sourceDir
    if (localSource) {
      if (!existsSync(localSource)) throw new Error(`--source not found: ${localSource}`)
      sourceDir = localSource
      console.log(`skills:upgrade: PREVIEW from ${localSource} — do not commit this run`)
    } else {
      sourceDir = fetchUpstreamSkills(upstreamSha, workDir)
    }
    runContentPhase(sourceDir, REPO_ROOT)
    run('bun', ['run', 'format'], { cwd: REPO_ROOT, stdio: 'inherit' })
    runManifestPhase(sourceDir, REPO_ROOT, upstreamSha)
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }

  console.log('skills:upgrade: done — review the diff, then commit and open a PR')
}

main()
