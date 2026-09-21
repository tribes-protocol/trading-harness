import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import {
  resolveTradesStateDir as coreStateDir,
  resolveWorkspaceRoot as coreRoot
} from '@/common/Env'
import {
  anchorWorkspaceRoot,
  resolveTradesStateDir,
  resolveWorkspaceRoot
} from '../../.pi/extensions/tribes/WorkspacePaths.ts'

/**
 * The Pi extension cannot import `@/common/Env` (jiti has no tsconfig alias), so
 * it carries a mirrored resolver. These tests pin that mirror to the core
 * resolver under every precedence branch — the extension writing the agent key
 * to a different dir than the CLI reads is exactly the "Authorization key
 * missing" bug.
 */
const savedStateDir = process.env.TRIBES_STATE_DIR
const savedWorkspaceRoot = process.env.TRIBES_WORKSPACE_ROOT

function restoreEnv(): void {
  if (savedStateDir !== undefined) process.env.TRIBES_STATE_DIR = savedStateDir
  else delete process.env.TRIBES_STATE_DIR
  if (savedWorkspaceRoot !== undefined) process.env.TRIBES_WORKSPACE_ROOT = savedWorkspaceRoot
  else delete process.env.TRIBES_WORKSPACE_ROOT
}

describe('extension WorkspacePaths mirrors the core resolver', () => {
  beforeEach(() => {
    delete process.env.TRIBES_STATE_DIR
    delete process.env.TRIBES_WORKSPACE_ROOT
  })

  afterEach(restoreEnv)

  test('TRIBES_STATE_DIR wins for both resolvers', async () => {
    const anchor = await mkdtemp(join(tmpdir(), 'ext-state-'))
    try {
      process.env.TRIBES_STATE_DIR = anchor
      process.env.TRIBES_WORKSPACE_ROOT = join(anchor, 'ignored-root')
      expect(resolveTradesStateDir('/tmp/foreign')).toBe(coreStateDir())
      expect(resolveTradesStateDir('/tmp/foreign')).toBe(anchor)
    } finally {
      await rm(anchor, { recursive: true, force: true })
    }
  })

  test('TRIBES_WORKSPACE_ROOT drives both when TRIBES_STATE_DIR is unset', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ext-ws-'))
    try {
      process.env.TRIBES_WORKSPACE_ROOT = root
      expect(resolveWorkspaceRoot('/tmp/foreign')).toBe(coreRoot())
      expect(resolveWorkspaceRoot('/tmp/foreign')).toBe(root)
      expect(resolveTradesStateDir('/tmp/foreign')).toBe(coreStateDir())
      expect(resolveTradesStateDir('/tmp/foreign')).toBe(join(root, '.tribes'))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('with no override the extension uses its cwd as the checkout root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ext-cwd-'))
    const savedCwd = process.cwd()
    process.chdir(root)
    try {
      expect(resolveWorkspaceRoot(root)).toBe(root)
      expect(resolveTradesStateDir(root)).toBe(join(root, '.tribes'))
      // The core resolver reads process.cwd(), which is now the same root.
      expect(coreRoot()).toBe(root)
      expect(coreStateDir()).toBe(join(root, '.tribes'))
    } finally {
      process.chdir(savedCwd)
      await rm(root, { recursive: true, force: true })
    }
  })

  test('anchorWorkspaceRoot pins cwd but never overwrites an explicit value', () => {
    const root = resolve('/tmp/anchor-root')
    anchorWorkspaceRoot(root)
    expect(process.env.TRIBES_WORKSPACE_ROOT).toBe(root)

    process.env.TRIBES_WORKSPACE_ROOT = '/tmp/explicit-root'
    anchorWorkspaceRoot('/tmp/other-root')
    expect(process.env.TRIBES_WORKSPACE_ROOT).toBe('/tmp/explicit-root')
  })
})
