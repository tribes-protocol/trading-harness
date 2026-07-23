#!/usr/bin/env node

/**
 * Prints the agent's Tribes API bearer token to stdout.
 *
 * Extension-only infra: the tribes extension runs this helper directly. The
 * launcher-owned wallet runtime is the source of token minting and cache policy.
 */

import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

type JwtHelper = {
  getApiBearerToken(options?: { force?: boolean }): Promise<string>
}

async function loadJwtHelper(): Promise<JwtHelper> {
  const launcherRoot = process.env.ORG_LAUNCHER_ROOT?.trim()
  if (!launcherRoot) throw new Error('ORG_LAUNCHER_ROOT is required to resolve the Tribes token helper')
  const helper = resolve(launcherRoot, '.pi/skills/wallet/runtime/src/helpers/Jwt.ts')
  return (await import(pathToFileURL(helper).href)) as JwtHelper
}

async function main(): Promise<void> {
  const force = process.argv.includes('--force')
  const fromEnv = process.env.API_BEARER_TOKEN
  if (fromEnv && !force) {
    process.stdout.write(fromEnv)
    return
  }

  const { getApiBearerToken } = await loadJwtHelper()
  const token = await getApiBearerToken({ force })
  process.stdout.write(token)
}

void main()
