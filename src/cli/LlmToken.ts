#!/usr/bin/env node

/**
 * Prints the harness JWT bearer token to stdout.
 *
 * `.env` (API_BEARER_TOKEN) is the single source of truth — the tribes extension
 * mints it and refreshes it every 24h. This CLI serves that value directly so
 * the LLM proxy and every skill use the same token. `--force` ignores .env + the
 * cache and mints a fresh token (how the extension refreshes .env).
 *
 * Wired as Pi's provider apiKey via:
 *   apiKey: "!bun src/cli/LlmToken.ts"
 */

import { getApiBearerToken } from '@/helpers/Jwt'

async function main(): Promise<void> {
  const forceRefresh = process.argv.includes('--force')

  // bun auto-loads .env from the workspace, so process.env.API_BEARER_TOKEN is
  // the current .env value when present.
  const fromEnv = process.env.API_BEARER_TOKEN
  if (!forceRefresh && fromEnv) {
    process.stdout.write(fromEnv)
    return
  }

  const token = await getApiBearerToken({ forceRefresh })
  // No trailing newline: the value is used verbatim as a Bearer token.
  process.stdout.write(token)
}

void main()
