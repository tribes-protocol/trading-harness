import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

import { REPO_ROOT } from './helpers/RepoRoot.ts'

/**
 * The monorepo split moved `src/` into `apps/cli/`. Everything asserted here is a
 * thing the sandbox boot path depends on that the move could have broken — and
 * every one of them breaks SILENTLY, behind a green typecheck and a green lint.
 *
 * The guest contract (terminal/scripts/sandbox-agent-shell.sh) is:
 *
 *   [ ! -e /root/workspace/package.json ] && clone this repo to /root/workspace
 *   ( cd /root/workspace && HOME=/root/workspace sh ./bootstrap.sh )
 *   cd /root/workspace && while true; do HOME=/root/workspace pi; bash -l; done
 *
 * A failed bootstrap only echoes — it is non-fatal — and the re-run gate is the
 * mere existence of package.json, so a box that boots wrong NEVER retries and
 * never reports degraded. These assertions are the only thing standing between a
 * layout mistake and a fleet of dead ata sandboxes.
 */

function readRepoFile(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8')
}

describe('monorepo boot contract', () => {
  it('pins the hoisted linker so the root node_modules/.bin survives', () => {
    // Bun 1.3.x switches to the isolated linker the moment `workspaces` exists,
    // which removes node_modules/.bin entirely. Three things break at once: the
    // guest's baked PATH entry /root/workspace/node_modules/.bin, bootstrap.sh's
    // `ln -sf $PWD/node_modules/.bin/pi /usr/local/bin/pi` (ln SUCCEEDS on a
    // missing target and leaves a dangling link), and the tribes-cli artifact
    // path. Nothing surfaces any of it.
    const bunfig = readRepoFile('bunfig.toml')
    expect(bunfig).toMatch(/linker\s*=\s*"hoisted"/)
  })

  it('keeps the Pi surface at the repo root, where Pi can actually find it', () => {
    // Pi resolves project resources at join(cwd, '.pi', …) with NO ancestor walk
    // and ships no --cwd flag, and the dispatcher launches it with
    // cwd=/root/workspace. A .pi/ inside a workspace is never discovered: Pi
    // loads nothing, prints nothing, and the whole tribes extension disappears.
    for (const entry of ['.pi', 'skills', 'AGENTS.md', 'CLAUDE.md', 'bootstrap.sh']) {
      expect(existsSync(join(REPO_ROOT, entry)), `${entry} must stay at the repo root`).toBe(true)
    }
  })

  it('satisfies the dispatcher gate with a root package.json that declares the workspaces', () => {
    const rootPackage = readRepoFile('package.json')
    expect(rootPackage).toContain('"workspaces"')
    expect(rootPackage).toContain('apps/*')
    expect(rootPackage).toContain('packages/*')
  })

  it('keeps pi a ROOT dependency so the filtered sandbox install still fetches it', () => {
    // bootstrap.sh installs with `--filter . --filter ./apps/cli` to keep Next.js
    // and React out of a 2G microVM. That only works while pi is declared on the
    // ROOT workspace — moving it into a package would leave the guest with no
    // agent binary at all.
    const rootPackage = readRepoFile('package.json')
    expect(rootPackage).toContain('"@earendil-works/pi-coding-agent"')
  })

  it('points bootstrap.sh, dev.sh and setup-env.sh at a CLI entry that exists', () => {
    // All three compile the same entry. bootstrap.sh is the production path; the
    // other two are dev-only, so a partial update ships a working sandbox and a
    // broken laptop.
    const entryPattern = /^ENTRY="([^"]+)"$/m
    for (const script of ['bootstrap.sh', 'scripts/dev.sh', 'scripts/setup-env.sh']) {
      const match = readRepoFile(script).match(entryPattern)
      expect(match, `${script} must declare an ENTRY`).not.toBeNull()
      const entry = match ? match[1] : ''
      expect(entry, `${script} ENTRY`).toBe('apps/cli/src/cli/Tribes.ts')
      expect(existsSync(join(REPO_ROOT, entry)), `${script} ENTRY must exist`).toBe(true)
    }
  })

  it('fails the install loudly when the root bin dir is missing', () => {
    // Without this guard bootstrap.sh prints "linked pi -> /usr/local/bin/pi" and
    // exits 0 on a box where pi does not exist.
    const bootstrap = readRepoFile('bootstrap.sh')
    expect(bootstrap).toContain('node_modules/.bin/pi')
    expect(bootstrap).toMatch(/if \[ ! -x "\$PWD\/node_modules\/\.bin\/pi" \]/)
  })

  it('maps @/* from the ROOT tsconfig, which is the only one .pi/ can reach', () => {
    // .pi/extensions/tribes/AgentProxyToken.ts imports '@/helpers/Jwt' and is
    // spawned at runtime as `bun .pi/extensions/tribes/AgentProxyToken.ts
    // --force` by AuthBootstrap. Bun resolves the alias by walking UP from that
    // file, so a package-local `paths` never reaches it. Lose this mapping and
    // token minting dies at runtime: no API bearer token in .env, every wallet /
    // proxy / trading call 401s, and both typecheck and lint stay green.
    const rootTsconfig = readRepoFile('tsconfig.json')
    expect(rootTsconfig).toContain('"@/*"')
    expect(rootTsconfig).toContain('./apps/cli/src/*')
  })

  it('resolves every @/ import under .pi/extensions to a real CLI source file', () => {
    const extensionsDir = join(REPO_ROOT, '.pi', 'extensions')
    const aliasImport = /from\s+'@\/([^']+)'/g
    const sources = listTypeScriptFiles(extensionsDir)
    expect(sources.length).toBeGreaterThan(0)

    for (const source of sources) {
      const contents = readFileSync(source, 'utf8')
      for (const match of contents.matchAll(aliasImport)) {
        const specifier = match[1] ?? ''
        const target = join(REPO_ROOT, 'apps', 'cli', 'src', `${specifier}.ts`)
        expect(existsSync(target), `${source} imports @/${specifier}, which does not exist`).toBe(
          true
        )
      }
    }
  })

  it('keeps the .pi/skills symlink pointing at the root skills tree', () => {
    // 55 tracked symlinks encode the current relative depth; git preserves
    // symlink TEXT, not targets, so a depth change leaves them dangling with no
    // error. This one is the load-bearing member — Pi reads skills through it.
    const link = join(REPO_ROOT, '.pi', 'skills')
    expect(existsSync(link)).toBe(true)
    expect(realpathSync(link)).toBe(realpathSync(join(REPO_ROOT, 'skills')))
  })
})

function listTypeScriptFiles(directory: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(directory)) {
    const absolute = join(directory, entry)
    if (statSync(absolute).isDirectory()) out.push(...listTypeScriptFiles(absolute))
    else if (absolute.endsWith('.ts')) out.push(absolute)
  }
  return out
}
