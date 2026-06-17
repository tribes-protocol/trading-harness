#!/usr/bin/env node

/**
 * Agent authorization key.
 *
 * Mints a P-256 keypair the agent uses to control its designated Privy wallet
 * AND to authenticate to the Tribes LLM proxy. The private key never leaves the
 * sandbox; the public key is printed to stdout (as JSON) so the orchestrator can
 * link it to the sandbox record. The sandbox id + user id are passed as args and
 * stored alongside so `llm-token.ts` can mint scoped tokens later.
 *
 * Harness-agnostic: it writes to a canonical microVM path (NOT a harness dir),
 * so the host runs it on EVERY sandbox (real key for all harnesses, no
 * placeholder). For ata the agent-shell copies this keypair into the agent's
 * expected /workspace/.../.pi/ on first boot. Run via the baked `tribes-agent-key`
 * launcher: `tribes-agent-key <sandboxId> <userId>`.
 *
 * Idempotent for a given owner — a re-run with the SAME userId re-emits the
 * existing public key (no rotation). An unclaimed warm-pool VM mints with an
 * empty userId; the claim re-runs with the real owner, re-minting once.
 */

import { generateKeyPairSync } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { type AgentAuthorizationKey } from '@/types/JwtAuth'
import { ensureJsonTreeString, ensureString, isNullish } from '@/utils/Lang'

const AGENT_KEY_PATH = '/var/lib/tribes/agent-authorization-key.json'

function createKey(sandboxId: string, userId: string): AgentAuthorizationKey {
  const { publicKey, privateKey } = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  })

  const key: AgentAuthorizationKey = {
    schema: 'agent-authorization-key.v1',
    curve: 'P-256',
    privateKeyPem: privateKey,
    publicKeyPem: publicKey,
    sandboxId,
    userId,
    createdAt: new Date().toISOString()
  }

  mkdirSync(dirname(AGENT_KEY_PATH), { recursive: true })
  writeFileSync(AGENT_KEY_PATH, ensureJsonTreeString(key), { mode: 0o600 })
  return key
}

// Re-emit the existing key only when it was minted for the same owner; a
// different (or unreadable) record means a re-mint is due. Returns null to mint.
function existingPublicKey(userId: string): string | null {
  if (!existsSync(AGENT_KEY_PATH)) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(readFileSync(AGENT_KEY_PATH, 'utf8'))
    if (
      typeof parsed === 'object' &&
      !isNullish(parsed) &&
      'userId' in parsed &&
      'publicKeyPem' in parsed &&
      parsed.userId === userId &&
      typeof parsed.publicKeyPem === 'string'
    ) {
      return parsed.publicKeyPem
    }
  } catch {
    return null
  }
  return null
}

function main(): void {
  const sandboxId = ensureString(process.argv[2], 'sandboxId is required')
  // Empty for an unclaimed warm-pool VM (owner unknown until claim).
  const userId = process.argv[3] ?? ''
  const reused = existingPublicKey(userId)
  const publicKey = reused ?? createKey(sandboxId, userId).publicKeyPem
  // stdout carries only the public key for the orchestrator to capture.
  console.log(ensureJsonTreeString({ publicKey }))
}

main()
