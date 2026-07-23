#!/usr/bin/env node

/**
 * Prints the agent's Tribes API bearer token to stdout.
 *
 * This token authorizes EVERY proxy call the agent makes — the LLM proxy AND the
 * wallet/transaction backend — so it is the single credential the whole harness
 * runs on. It is an ES256 JWT the harness mints from the in-VM P-256 agent key
 * (getApiBearerToken); the tribes extension refreshes it into .env every 24h.
 * Prefers a token already materialized in API_BEARER_TOKEN, unless `--force`
 * requests a freshly minted token that bypasses both the environment and cache.
 *
 * Extension-only infra (not a `tribes-cli` command): the tribes extension runs it
 * directly via bun — Provider wires it as the proxy apiKey `!command`, and
 * AuthBootstrap runs it to (re)write .env so the CLIs share the one token.
 */

import { getApiBearerToken } from '@/helpers/Jwt'

async function main(): Promise<void> {
  const force = process.argv.includes('--force')
  const fromEnv = process.env.API_BEARER_TOKEN
  if (!force && fromEnv) {
    process.stdout.write(fromEnv)
    return
  }

  const token = await getApiBearerToken({ force })
  // No trailing newline: the value is used verbatim as a Bearer token.
  process.stdout.write(token)
}

void main()
