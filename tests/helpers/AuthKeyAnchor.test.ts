import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { resolveTradesStateDir, resolveWorkspaceRoot } from '@/common/Env'
import { readAgentAuthorizationKey, writeAgentAuthorizationKey } from '@/helpers/AuthKey'
import { readCliLoginKey, writeCliLoginKey } from '@/helpers/CliLoginKey'

const ORIGINAL_CWD = process.cwd()
const ORIGINAL_STATE_DIR = process.env.TRIBES_STATE_DIR

const AUTH_KEY = {
  schema: 'agent-authorization-key.v1',
  curve: 'P-256',
  privateKeyPem: '-----BEGIN PRIVATE KEY-----\nsigning-key-material\n-----END PRIVATE KEY-----\n',
  publicKeyPem: '-----BEGIN PUBLIC KEY-----\nsigning-pub\n-----END PUBLIC KEY-----\n',
  app: 'external' as const,
  sandboxId: 'sandbox-1',
  userId: 'user-1',
  createdAt: '1700000000000'
}

const CLI_KEY = {
  schema: 'cli-login-key.v1',
  curve: 'P-256',
  privateKeyPem: '-----BEGIN PRIVATE KEY-----\ncli-login-material\n-----END PRIVATE KEY-----\n',
  publicKeyPem: '-----BEGIN PUBLIC KEY-----\ncli-login-pub\n-----END PUBLIC KEY-----\n',
  createdAt: '1700000000000'
}

async function writeRepoKeys(): Promise<void> {
  await writeAgentAuthorizationKey(AUTH_KEY)
  await writeCliLoginKey(CLI_KEY)
}

describe('agent-auth + cli-login key path anchored to state dir (foreign-cwd fix)', () => {
  beforeEach(() => {
    process.env.TRIBES_STATE_DIR = undefined
  })

  afterEach(() => {
    process.chdir(ORIGINAL_CWD)
    if (ORIGINAL_STATE_DIR === undefined) {
      delete process.env.TRIBES_STATE_DIR
    } else {
      process.env.TRIBES_STATE_DIR = ORIGINAL_STATE_DIR
    }
  })

  test('readAgentAuthorizationKey resolves from a FOREIGN cwd (no "missing")', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'auth-anchor-'))
    process.env.TRIBES_STATE_DIR = stateDir
    await writeRepoKeys()

    const foreign = await mkdtemp(join(tmpdir(), 'foreign-cwd-'))
    process.chdir(foreign)

    const key = await readAgentAuthorizationKey()
    expect(key).not.toBeNull()
    expect(key?.sandboxId).toBe('sandbox-1')
    expect(key?.publicKeyPem).toContain('PUBLIC KEY')
  })

  test('readCliLoginKey resolves from a FOREIGN cwd', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'auth-anchor-cli-'))
    process.env.TRIBES_STATE_DIR = stateDir
    await writeRepoKeys()

    const foreign = await mkdtemp(join(tmpdir(), 'foreign-cwd-cli-'))
    process.chdir(foreign)

    const key = await readCliLoginKey()
    expect(key.publicKeyPem).toContain('PUBLIC KEY')
  })

  test('missing key still soft-fails to null (logged-out state preserved)', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'auth-anchor-empty-'))
    process.env.TRIBES_STATE_DIR = stateDir

    const foreign = await mkdtemp(join(tmpdir(), 'foreign-cwd-empty-'))
    process.chdir(foreign)

    const key = await readAgentAuthorizationKey()
    expect(key).toBeNull()
  })

  test('JWT token-cache path lands inside the canonical state dir from a foreign cwd', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'auth-anchor-jwt-'))
    process.env.TRIBES_STATE_DIR = stateDir

    const foreign = await mkdtemp(join(tmpdir(), 'foreign-cwd-jwt-'))
    process.chdir(foreign)

    const cachePath = join(resolveTradesStateDir(), 'jwt-token-cache.json')
    expect(cachePath.startsWith(stateDir)).toBe(true)
  })
})

describe('workspace-root anchors (extension <-> core contract)', () => {
  const savedStateDir = process.env.TRIBES_STATE_DIR
  const savedWorkspaceRoot = process.env.TRIBES_WORKSPACE_ROOT

  beforeEach(() => {
    delete process.env.TRIBES_STATE_DIR
    delete process.env.TRIBES_WORKSPACE_ROOT
  })

  afterEach(() => {
    if (savedStateDir !== undefined) process.env.TRIBES_STATE_DIR = savedStateDir
    else delete process.env.TRIBES_STATE_DIR
    if (savedWorkspaceRoot !== undefined) process.env.TRIBES_WORKSPACE_ROOT = savedWorkspaceRoot
    else delete process.env.TRIBES_WORKSPACE_ROOT
  })

  test('TRIBES_WORKSPACE_ROOT anchors workspace + state dir when TRIBES_STATE_DIR is unset', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ws-root-'))
    process.env.TRIBES_WORKSPACE_ROOT = root
    try {
      expect(resolveWorkspaceRoot()).toBe(root)
      expect(resolveTradesStateDir()).toBe(join(root, '.tribes'))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('with no override both anchors derive from cwd (the checkout root)', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ws-cwd-'))
    const savedCwd = process.cwd()
    process.chdir(root)
    try {
      expect(resolveWorkspaceRoot()).toBe(root)
      expect(resolveTradesStateDir()).toBe(join(root, '.tribes'))
    } finally {
      process.chdir(savedCwd)
      await rm(root, { recursive: true, force: true })
    }
  })
})
