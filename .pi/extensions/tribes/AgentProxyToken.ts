#!/usr/bin/env node

/**
 * Prints the agent's Tribes API bearer token to stdout.
 *
 * This token authorizes EVERY proxy call the agent makes — the LLM proxy AND the
 * wallet/transaction backend — so it is the single credential the whole harness
 * runs on. It is the static per-sandbox API key the control plane injects into
 * the VM env as TRIBES_API_KEY (opaque, no expiry; the proxy verifies it by hash
 * and revokes it on shutdown). No minting, no 24h refresh — the key arrives
 * ready-to-use. Falls back to API_BEARER_TOKEN for local dev where no static key
 * is injected.
 *
 * Extension-only infra (not a `tribes-cli` command): the tribes extension runs it
 * directly via bun — Provider wires it as the proxy apiKey `!command`, and
 * AuthBootstrap runs it to (re)write .env so the CLIs share the one token.
 */

function main(): void {
  const token = process.env.TRIBES_API_KEY ?? process.env.API_BEARER_TOKEN
  if (!token) {
    process.stderr.write('TRIBES_API_KEY is not set\n')
    process.exit(1)
  }
  // No trailing newline: the value is used verbatim as a Bearer token.
  process.stdout.write(token)
}

main()
