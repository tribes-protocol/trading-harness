#!/usr/bin/env node

/**
 * Prints the agent's Tribes API bearer token to stdout.
 *
 * This token authorizes EVERY proxy call the agent makes — the LLM proxy AND the
 * wallet/transaction backend — so it is the single credential the whole harness
 * runs on. `.env` (API_BEARER_TOKEN) is the source of truth; the tribes extension
 * mints it from the agent's P-256 key and refreshes it every 24h. This script
 * serves that value so the LLM provider and the CLIs share one token. `--force`
 * ignores .env + cache and mints a fresh token (how the extension refreshes .env).
 *
 * Extension-only infra (not a `tribes-cli` command): it MINTS the bearer token
 * before `.env` exists, so it must run without that token already present. The
 * tribes extension runs it directly via bun — Provider wires it as the proxy
 * apiKey `!command`, and AuthBootstrap runs it with --force to (re)write .env.
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
