// Vendor shared agent skills from tribes-protocol/ai-harness-setup into .pi/skills/.
//
// This is a build/CI helper, NOT product source. It is a plain .mjs module so it
// sits outside the repo's tsc/eslint/prettier surface (those only cover .ts/.mts
// and a fixed prettier glob) — it can be run directly with `bun` or `node`.
//
// Two phases, driven by --phase:
//
//   content   copy skills/<slug>/* -> .pi/skills/<slug>/* (never deleting local-only
//             slugs), inject a "synced" marker after each SKILL.md H1, and regenerate
//             the marker-fenced routing block inside AGENTS.md's "## Skill routing map".
//
//   manifest  hash every vendored file AFTER prettier has run and write
//             .pi/skills/.synced.json = { upstreamSha, files: { path: sha256 } }.
//             The manifest is only rewritten when the file set actually changed, so a
//             bare upstream-sha bump with identical skill content produces no diff.
//
// The routing block backticks the SLUG ONLY and strips every backtick from the
// description: tests/skills/SkillsContract.test.ts fails on any backticked token in
// the routing section that is not a known skill slug.

import { createHash } from 'node:crypto'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { join, relative } from 'node:path'

const H1_MARKER = '<!-- synced from tribes-protocol/ai-harness-setup — edit there, not here -->'
const ROUTES_BEGIN =
  '<!-- BEGIN synced skill routes (managed by .github/workflows/sync-harness-skills.yml) -->'
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
function upstreamSlugs(sourceDir) {
  return readdirSync(sourceDir)
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

function runContentPhase(sourceDir, repoRoot) {
  const skillsRoot = join(repoRoot, '.pi', 'skills')
  const slugs = upstreamSlugs(sourceDir)
  if (slugs.length === 0) {
    console.log('sync: upstream exposes no skills — nothing to vendor')
    return
  }

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
  console.log(`sync: vendored ${slugs.length} skill(s): ${slugs.join(', ')}`)
}

function computeFileHashes(sourceDir, repoRoot) {
  const skillsRoot = join(repoRoot, '.pi', 'skills')
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
  const manifestPath = join(repoRoot, '.pi', 'skills', '.synced.json')
  const files = computeFileHashes(sourceDir, repoRoot)

  if (existsSync(manifestPath)) {
    const existing = JSON.parse(readFileSync(manifestPath, 'utf8'))
    // Identical content under a new upstream sha is not a change worth a PR.
    if (sameFileSet(existing.files ?? {}, files)) {
      console.log('sync: vendored content unchanged — leaving manifest untouched')
      return
    }
  }

  const manifest = { upstreamSha, files }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`sync: wrote manifest for ${Object.keys(files).length} file(s)`)
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const repoRoot = args['repo-root'] ?? process.cwd()
  const sourceDir = args.source
  const phase = args.phase

  if (!sourceDir) throw new Error('missing --source <skills dir>')
  if (!existsSync(sourceDir)) throw new Error(`source skills dir not found: ${sourceDir}`)

  if (phase === 'content') {
    runContentPhase(sourceDir, repoRoot)
  } else if (phase === 'manifest') {
    const upstreamSha = args['upstream-sha']
    if (!upstreamSha) throw new Error('missing --upstream-sha for manifest phase')
    runManifestPhase(sourceDir, repoRoot, upstreamSha)
  } else {
    throw new Error(`unknown --phase: ${phase} (expected "content" or "manifest")`)
  }
}

main()
