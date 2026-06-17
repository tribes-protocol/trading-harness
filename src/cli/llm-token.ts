#!/usr/bin/env node

/**
 * Prints the harness JWT bearer token to stdout.
 *
 * The token is minted from the sandbox's P-256 private key when missing/expired,
 * otherwise served from cache for faster reads.
 *
 * Wired as Pi's provider apiKey via:
 *   apiKey: "!bun src/cli/llm-token.ts"
 */

import { getApiBearerToken } from '@/helpers/Jwt'

async function main(): Promise<void> {
  const token = await getApiBearerToken()
  // No trailing newline: the value is used verbatim as a Bearer token.
  process.stdout.write(token)
}

void main()
