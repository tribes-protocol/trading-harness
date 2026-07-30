import {
  type ChallengeCheck,
  SANDBOX_CHALLENGE_TTL_MS,
  SandboxChallengeSchema
} from '@/types/OwnerAuth'

// ---------------------------------------------------------------------------
// Parse + validate the sandbox-access challenge the owner signs. The canonical
// composer/parser is apps/microvmd/src/utils/SandboxChallenge.ts in
// tribes-protocol/terminal — keep this pattern byte-compatible with the text it
// emits (see types/OwnerAuth for the full note).
//
// The gateway never ISSUES a challenge (microvmd's GET /challenge does), so only
// the reading half is vendored. Pure and synchronous: the clock arrives as
// `nowMs` from the caller, which is what keeps this in utils/ and testable
// without freezing time.
// ---------------------------------------------------------------------------

const CHALLENGE_PATTERN = new RegExp(
  '^Tribes Sandbox Access\\n\\nSandbox: (\\S+)\\n' +
    'Issued At: (\\S+)\\nExpires At: (\\S+)\\nNonce: ([0-9a-f]{16,64})$'
)

// Tolerated clock drift between the signer's view and this verifier's clock when
// judging "issued in the future" — the host issues the timestamps, the browser
// only signs them.
const CLOCK_SKEW_MS = 5 * 60 * 1000

interface CheckSandboxChallengeParams {
  message: string
  // The sandbox this gateway runs in — a signature for sandbox A must never open
  // sandbox B.
  sandboxId: string
  nowMs: number
}

export function checkSandboxChallenge(params: CheckSandboxChallengeParams): ChallengeCheck {
  const match = CHALLENGE_PATTERN.exec(params.message)
  if (match === null) {
    return { valid: false, reason: 'malformed' }
  }
  const issuedAtMs = Date.parse(match[2] ?? '')
  const expiresAtMs = Date.parse(match[3] ?? '')
  if (Number.isNaN(issuedAtMs) || Number.isNaN(expiresAtMs)) {
    return { valid: false, reason: 'malformed' }
  }
  const parsed = SandboxChallengeSchema.safeParse({
    sandboxId: match[1],
    issuedAtMs,
    expiresAtMs,
    nonce: match[4]
  })
  if (!parsed.success) {
    return { valid: false, reason: 'malformed' }
  }
  const challenge = parsed.data
  if (challenge.sandboxId !== params.sandboxId) {
    return { valid: false, reason: 'sandbox-mismatch' }
  }
  if (challenge.expiresAtMs <= params.nowMs) {
    return { valid: false, reason: 'expired' }
  }
  if (challenge.issuedAtMs > params.nowMs + CLOCK_SKEW_MS) {
    return { valid: false, reason: 'not-yet-valid' }
  }
  // Cap the window so a hand-rolled message cannot claim a year of validity —
  // the host only ever issues SANDBOX_CHALLENGE_TTL_MS.
  if (challenge.expiresAtMs - challenge.issuedAtMs > SANDBOX_CHALLENGE_TTL_MS) {
    return { valid: false, reason: 'window-too-long' }
  }
  return { valid: true, challenge }
}
